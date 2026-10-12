import { cleanName, playerColor } from '../core/city.ts';
import type { D1Database } from '@cloudflare/workers-types';
import { parseTrace, replayTrace } from '../core/trace.ts';
import { parseRuntimeConfig } from '../config.ts';
import type { SharedCityId, SharedSession } from '../shared/protocol.ts';
import { ApiError, OFFICIAL_RULES, PLAYER_TTL_MS, RULESET_ID, RUN_TTL_MS, hashText, randomCredential, randomId } from './policy.ts';
import { CityStore } from './store.ts';
import type { PlayerRow } from './store.ts';

export interface ServerContext { db?: D1Database; publicWriteOpen: boolean; cityName?: string; now?: () => number }
const COOKIE='skyline_player';
const json=(value:unknown,status=200,cookie?:string)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Cookie',...(cookie?{'Set-Cookie':cookie}:{})}});
const cityId=(value:unknown):SharedCityId=>{if(value==='public'||value==='test')return value;throw new ApiError(400,'invalid_city');};
const keys=(body:Record<string,unknown>,allowed:string[])=>{if(Object.keys(body).some(k=>!allowed.includes(k)))throw new ApiError(400,'unexpected_field');};
const uuid=(v:unknown)=>{if(typeof v!=='string'||!/^[a-f0-9-]{36}$/i.test(v))throw new ApiError(400,'invalid_id');return v;};
async function readBody(request:Request) {
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new ApiError(415,'json_required');
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError(403,'same_origin_required');
  const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'body_required');
  let count=0;const chunks:Uint8Array[]=[];
  for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>65_536){await reader.cancel();throw new ApiError(413,'body_too_large');}chunks.push(value);}
  const bytes=new Uint8Array(count);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  let value:unknown;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(400,'invalid_json');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ApiError(400,'invalid_body');return value as Record<string,unknown>;
}

export async function handleApi(request:Request,context:ServerContext):Promise<Response> {
  try {
    if(!context.db)throw new ApiError(503,'storage_unavailable');
    const store=new CityStore(context.db),url=new URL(request.url),now=(context.now??Date.now)();
    const name=parseRuntimeConfig({cityDisplayName:context.cityName}).cityDisplayName;
    const token=request.headers.get('cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    let player:PlayerRow|null=null;
    if(token&&/^[a-f0-9]{64}$/.test(token))player=await store.player(await hashText(token),now);
    const getCity=async(city:SharedCityId)=>{await store.ensureCity(city,city==='test'?'城市天际线 · 共享测试':name);};
    const writeOpen=(city:SharedCityId)=>city==='test'||context.publicWriteOpen;
    const requirePlayer=()=>{if(!player)throw new ApiError(401,'session_required');return player;};
    if(request.method==='GET'&&url.pathname==='/api/session') {
      const city=cityId(url.searchParams.get('city')??'public');await getCity(city);
      let cookie:string|undefined;
      if(!player){
        const address=request.headers.get('cf-connecting-ip')??'loopback';
        await store.rateLimit('signup:'+await hashText(address+':'+Math.floor(now/86_400_000)),240,now,300_000);
        const credential=randomCredential();player=await store.createPlayer(randomId(),randomId(),await hashText(credential),now,now+PLAYER_TTL_MS);
        cookie=`${COOKIE}=${credential}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${PLAYER_TTL_MS/1000}${url.protocol==='https:'?'; Secure':''}`;
      }
      const snapshot=await store.snapshot(city,writeOpen(city)),active=await store.activeRun(city,player.id,now);
      const session:SharedSession={playerId:player.public_id,color:playerColor(player.public_id),snapshot,rules:{...OFFICIAL_RULES},rulesetId:RULESET_ID,activeRunId:active?.id??null};
      return json(session,200,cookie);
    }
    if(request.method==='GET'&&url.pathname==='/api/city') {
      const city=cityId(url.searchParams.get('city')??'public');await getCity(city);
      const snapshot=await store.snapshot(city,writeOpen(city));
      if(url.searchParams.get('epoch')===snapshot.epoch&&url.searchParams.get('since')===String(snapshot.revision))return json({cityId:city,epoch:snapshot.epoch,revision:snapshot.revision,unchanged:true,writeOpen:snapshot.writeOpen,name:snapshot.name});
      return json(snapshot);
    }
    if(request.method==='POST'&&url.pathname==='/api/runs') {
      const body=await readBody(request);keys(body,['city','startKey','replaceRunId']);const city=cityId(body.city),owner=requirePlayer();
      if(!writeOpen(city))throw new ApiError(403,'city_write_closed');await getCity(city);
      await store.rateLimit('start:'+owner.id,30,now,60_000);
      return json(await store.start(city,owner.id,uuid(body.startKey),body.replaceRunId?uuid(body.replaceRunId):null,now));
    }
    const matched=/^\/api\/runs\/([a-f0-9-]{36})(?:\/(submit|cancel))?$/i.exec(url.pathname);
    if(matched) {
      const owner=requirePlayer(),run=await store.getRun(matched[1],owner.id,now);
      if(request.method==='GET'&&!matched[2])return json({runId:run.id,status:run.status,receipt:run.receipt_json?JSON.parse(run.receipt_json):null,snapshot:await store.snapshot(run.city_id,writeOpen(run.city_id))});
      if(request.method==='POST'&&matched[2]==='cancel') {const body=await readBody(request);keys(body,[]);await store.cancel(run.id,owner.id);return json({cancelled:true});}
      if(request.method==='POST'&&matched[2]==='submit') {
        const body=await readBody(request);keys(body,['name','trace']);
        if(!writeOpen(run.city_id))throw new ApiError(403,'city_write_closed');
        if(body.name!==undefined&&typeof body.name!=='string')throw new ApiError(400,'invalid_name');
        let trace,completed;try{trace=parseTrace(body.trace);completed=replayTrace(JSON.parse(run.rules_json),trace,run.id);}catch{throw new ApiError(400,'invalid_trace');}
        if(trace.endUs/1000>RUN_TTL_MS||trace.endUs/1000>now-run.created_at+1000)throw new ApiError(400,'impossible_run_time');
        if(run.status!=='active'&&!run.receipt_json)throw new ApiError(410,'run_expired_or_cancelled');
        await store.rateLimit('submit:'+owner.id,60,now,60_000);
        const signature=cleanName((body.name as string|undefined)??'');
        const hash=await hashText(JSON.stringify({version:1,runId:run.id,name:signature,trace}));
        const result=await store.submit(run,owner,signature,trace,completed,hash,now);
        return json({...result,snapshot:await store.snapshot(run.city_id,writeOpen(run.city_id))});
      }
    }
    throw new ApiError(404,'route_not_found');
  } catch(error) {
    if(error instanceof ApiError)return json({error:error.code},error.status);
    // Never send database internals, identities or stack traces to public clients.
    return json({error:'service_unavailable'},503);
  }
}
