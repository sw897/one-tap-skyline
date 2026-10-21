import {RELEASE_ID} from '../release.ts';
import {shanghaiMidnight} from '../core/photo.ts';
import { cleanName, playerColor, randomBuildingName, PALETTE } from '../core/city.ts';
import {waterfrontLayout,type CityLayout} from '../core/layout.ts';
import type { D1Database } from '@cloudflare/workers-types';
import { parseTrace, replayTrace } from '../core/trace.ts';
import { parseRuntimeConfig } from '../config.ts';
import type { SharedCityId, SharedSession } from '../shared/protocol.ts';
import { ApiError, OFFICIAL_RULES, PLAYER_TTL_MS, RULESET_ID, RUN_TTL_MS, hashText, randomCredential, randomId } from './policy.ts';
import { CityStore } from './store.ts';
import { handlePhotoApi } from './photos.ts';
import { ensureGameDay,removePastDayFiles } from './daily-reset.ts';
import type { R2Bucket } from '@cloudflare/workers-types';
import type { PlayerRow } from './store.ts';
import {gameOperation,type BoundaryContext} from './boundary.ts';
import {credential as readCredential,cookiePolicy,assertParameters,ROOT_SCOPE} from '../shared/app-scope.ts';

export interface ServerContext extends BoundaryContext { db?: D1Database; bucket?: R2Bucket; publicWriteOpen: boolean; publicPhotosOpen?: boolean; cityName?: string; layout?:CityLayout; clientAddress?:string }
const json=(value:unknown,status=200,cookie?:string)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Cookie',...(cookie?{'Set-Cookie':cookie}:{})}});
const cityId=(value:unknown):SharedCityId=>{if(value==='public'||value==='test'||value==='test-mobile')return value;throw new ApiError(400,'invalid_city');};
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

async function handleGameApi(request:Request,context:ServerContext,parsedBody:Record<string,unknown>|undefined,day:Awaited<ReturnType<typeof ensureGameDay>>):Promise<Response> {
    if(!context.db)throw new ApiError(503,'storage_unavailable');
    const scope=context.scope??ROOT_SCOPE,store=new CityStore(context.db,scope),url=new URL(request.url),now=(context.now??Date.now)();
    const name=parseRuntimeConfig({cityDisplayName:context.cityName}).cityDisplayName;
    const token=readCredential(request,scope);
    let player:PlayerRow|null=null;
    if(token&&/^[a-f0-9]{64}$/.test(token))player=await store.player(await hashText(token),now);
    const getCity=async(city:SharedCityId)=>{await store.ensureCity(city,city!=='public'?'城市天际线 · 共享测试':name,context.layout??waterfrontLayout());};
    const writeOpen=(city:SharedCityId)=>city!=='public'||context.publicWriteOpen;
    const requirePlayer=()=>{if(!player)throw new ApiError(401,'session_required');return player;};
    if(request.method==='GET'&&url.pathname==='/api/game/entry'){
      const city=cityId(url.searchParams.get('city')??'public');await getCity(city);
      const current=await store.stmt('SELECT epoch FROM cities WHERE id=?',city).first<{epoch:string}>();
      return json({releaseId:RELEASE_ID,dayStart:day.dayStart,resetAt:day.resetAt,entry:current!.epoch});
    }
    const ownOnly=url.searchParams.get('scope')==='own';
    if(url.searchParams.has('scope')&&!['all','own'].includes(url.searchParams.get('scope')!))throw new ApiError(400,'invalid_scope');
    const afterRaw=url.searchParams.get('after');
    if(afterRaw!==null&&!/^\d{1,15}$/.test(afterRaw))throw new ApiError(400,'invalid_cursor');
    const after=afterRaw===null?undefined:Number(afterRaw);
    const snapshot=async(city:SharedCityId)=>{const view=await store.snapshot(city,writeOpen(city),ownOnly?requirePlayer().id:undefined,after);view.resetAt=day.resetAt;view.photoWriteOpen=city!=='public'||context.publicPhotosOpen===true;return view;};
    if(request.method==='GET'&&url.pathname==='/api/session') {
      const city=cityId(url.searchParams.get('city')??'public');await getCity(city);
      let cookie:string|undefined;
      if(city==='public'){
        const current=await store.stmt('SELECT epoch FROM cities WHERE id=?',city).first<{epoch:string}>();
        if(url.searchParams.get('entry')!==current!.epoch)throw new ApiError(403,'entry_expired');
      }
      if(!player){
        const address=context.clientAddress??request.headers.get('cf-connecting-ip')??'loopback';
        await store.rateLimit('signup:'+await hashText(address+':'+Math.floor(now/86_400_000)),240,now,300_000);
        const credential=randomCredential();player=await store.createPlayer(randomId(),randomId(),await hashText(credential),now,Math.min(now+PLAYER_TTL_MS,day.resetAt));
        const policy=cookiePolicy(scope);
        cookie=`${policy.name}=${credential}; HttpOnly; SameSite=Lax; Path=${policy.path}; Max-Age=${Math.max(1,Math.floor((day.resetAt-now)/1000))}${url.protocol==='https:'?'; Secure':''}`;
      }
      const view=await snapshot(city),active=await store.activeRun(city,player.id,now);
      const session:SharedSession={playerId:player.public_id,color:playerColor(player.public_id),snapshot:view,rules:{...OFFICIAL_RULES},rulesetId:RULESET_ID,activeRunId:active?.id??null};
      return json(session,200,cookie);
    }
    if(request.method==='GET'&&url.pathname==='/api/city') {
      const city=cityId(url.searchParams.get('city')??'public');await getCity(city);
      const view=await snapshot(city);
      if(url.searchParams.get('epoch')===view.epoch&&url.searchParams.get('since')===String(view.revision)&&!view.events?.length&&!view.eventGap)return json({cityId:city,epoch:view.epoch,revision:view.revision,unchanged:true,writeOpen:view.writeOpen,name:view.name,latestEventId:view.latestEventId});
      return json(view);
    }
    if(request.method==='POST'&&url.pathname==='/api/runs') {
      const body=parsedBody!;keys(body,['city','startKey','replaceRunId']);const city=cityId(body.city),owner=requirePlayer();
      if(scope.publicOnly&&city!=='public')throw new ApiError(400,'invalid_city');
      if(!writeOpen(city))throw new ApiError(403,'city_write_closed');await getCity(city);
      if(city==='public'&&(await store.stmt('SELECT epoch FROM cities WHERE id=?',city).first<{epoch:string}>())?.epoch!==url.searchParams.get('entry'))throw new ApiError(403,'entry_expired');
      await store.rateLimit('start:'+owner.id,30,now,60_000);
      return json(await store.start(city,owner.id,uuid(body.startKey),body.replaceRunId?uuid(body.replaceRunId):null,now));
    }
    const matched=/^\/api\/runs\/([a-f0-9-]{36})(?:\/(submit|cancel))?$/i.exec(url.pathname);
    if(matched) {
      const owner=requirePlayer(),run=await store.getRun(matched[1],owner.id,now);
      if(run.created_at<shanghaiMidnight(now))throw new ApiError(410,'city_reset');
      if(request.method==='GET'&&!matched[2])return json({runId:run.id,status:run.status,receipt:run.receipt_json?JSON.parse(run.receipt_json):null,snapshot:await snapshot(run.city_id)});
      if(request.method==='POST'&&matched[2]==='cancel') {const body=parsedBody!;keys(body,[]);await store.cancel(run.id,owner.id);return json({cancelled:true});}
      if(request.method==='POST'&&matched[2]==='submit') {
        const body=parsedBody!;keys(body,['name','trace','color']);
        if(!writeOpen(run.city_id))throw new ApiError(403,'city_write_closed');
        if(body.name!==undefined&&typeof body.name!=='string')throw new ApiError(400,'invalid_name');
        if(body.color!==undefined&&(typeof body.color!=='string'||!PALETTE.includes(body.color)))throw new ApiError(400,'invalid_color');
        let trace,completed;try{trace=parseTrace(body.trace);completed=replayTrace(JSON.parse(run.rules_json),trace,run.id);}catch{throw new ApiError(400,'invalid_trace');}
        if(trace.endUs/1000>RUN_TTL_MS||trace.endUs/1000>now-run.created_at+1000)throw new ApiError(400,'impossible_run_time');
        if(run.status!=='active'&&!run.receipt_json)throw new ApiError(410,'run_expired_or_cancelled');
        await store.rateLimit('submit:'+owner.id,60,now,60_000);
        const requestedName=cleanName((body.name as string|undefined)??'');
        const signature=requestedName||await store.currentName(run.city_id,owner.id)||randomBuildingName(owner.public_id);
        // Keep the existing empty-input hash normalization for outstanding retries.
        // This marker is never the displayed default name.
        const hash=await hashText(JSON.stringify({version:1,runId:run.id,name:requestedName||'我的小楼',trace,...(body.color!==undefined?{color:body.color}:{})}));
        const result=await store.submit(run,owner,signature,trace,completed,hash,now,body.color as string|undefined);
        return json({...result,snapshot:await snapshot(run.city_id)});
      }
    }
    throw new ApiError(404,'route_not_found');
}

export async function handleApi(request:Request,context:ServerContext):Promise<Response> {
  try {
    try{assertParameters(new URL(request.url),context.scope??ROOT_SCOPE);}catch(error){throw new ApiError(400,(error as Error).message);}
    const expectedDay=request.method==='POST'?shanghaiMidnight((context.now??Date.now)()):undefined;
    const pathname=new URL(request.url).pathname;
    if(pathname.startsWith('/api/photos/'))return handlePhotoApi(request,{...context,publicPhotosOpen:context.publicPhotosOpen===true},expectedDay);
    if(pathname==='/api/game/reset-due'&&request.method==='GET'){
      const day=await gameOperation(context,async(_now,day)=>day);
      const files=context.bucket?await removePastDayFiles(context.bucket,(context.now??Date.now)()):{removed:0,pending:0};
      return json({...day,filesRemoved:files.removed,filesPending:files.pending});
    }
    // Body IO finishes before acquiring the SQLite write boundary.
    const parsedBody=request.method==='POST'?await readBody(request):undefined;
    return await gameOperation(context,(now,day)=>handleGameApi(request,{...context,now:()=>now},parsedBody,day),expectedDay);
  } catch(error) {
    if(error instanceof ApiError)return json({error:error.code},error.status);
    // Never send database internals, identities or stack traces to public clients.
    return json({error:'service_unavailable'},503);
  }
}
