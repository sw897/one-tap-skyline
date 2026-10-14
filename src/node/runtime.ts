import {createServer,type IncomingMessage} from 'node:http';
import {Readable} from 'node:stream';
import {mkdir,readFile,stat} from 'node:fs/promises';
import {isIP} from 'node:net';
import path from 'node:path';
import {NodeDatabase} from './database.ts';
import {FileBucket} from './files.ts';
import {serverRuntime} from '../server/runtime.ts';
import {gameOperation} from '../server/boundary.ts';
import {handleApi,type ServerContext} from '../server/service.ts';
import {cleanupPhotos} from '../server/photos.ts';
import {removePastDayFiles} from '../server/daily-reset.ts';
import {waterfrontLayout} from '../core/layout.ts';
import {nextShanghaiMidnight,shanghaiMidnight} from '../core/photo.ts';
import {ApiError} from '../server/policy.ts';
import {cachePolicy} from '../server/cache.ts';
import {RELEASE_ID} from '../release.ts';

export function requestAddress(request:IncomingMessage,trustProxy:boolean){
  const remote=request.socket.remoteAddress??'unknown',plain=remote.replace(/^::ffff:/,'');
  const privatePeer=plain==='127.0.0.1'||plain==='::1'||plain.startsWith('10.')||plain.startsWith('192.168.')||/^172\.(?:1[6-9]|2\d|3[01])\./.test(plain);
  const forwarded=request.headers['x-skyline-client-ip'];
  return trustProxy&&privatePeer&&typeof forwarded==='string'&&isIP(forwarded)?forwarded:plain;
}
export interface NodeRuntimeOptions {origin:string;dataRoot:string;webRoot:string;migrations:string;env?:Record<string,string|undefined>;now?:()=>number;timers?:boolean;log?:(value:unknown)=>void}
export async function createGameServer(options:NodeRuntimeOptions){
  const origin=new URL(options.origin),env=options.env??{},clock=options.now??Date.now,log=options.log??(v=>console.log(JSON.stringify(v)));
  if(!['http:','https:'].includes(origin.protocol)||origin.pathname!=='/'||origin.username||origin.password||origin.search||origin.hash)throw Error('invalid_public_origin');
  const dbRoot=path.join(options.dataRoot,'db'),photosRoot=path.join(options.dataRoot,'photos');
  await mkdir(dbRoot,{recursive:true});
  const database=new NodeDatabase(path.join(dbRoot,'game.sqlite'),options.migrations),bucket=new FileBucket(photosRoot);
  await bucket.probe();
  const activeUploads=new Map<number,number>();let physicalPending=0,endedOldUploadRevision=0,sweptUploadRevision=0;
  const config=serverRuntime(env),context:ServerContext={db:database.asD1(),bucket:bucket.asR2(),now:clock,boundary:job=>database.atomic(job,()=>{
    const marker=database.connection.prepare("SELECT day_start FROM game_clock WHERE id='daily'").get();
    if(marker?.day_start!==shanghaiMidnight(clock()))throw new ApiError(410,'city_reset');
  }),publicWriteOpen:env.SKYLINE_PUBLIC_WRITE_OPEN==='1',publicPhotosOpen:env.SKYLINE_PUBLIC_PHOTOS_OPEN==='1',cityName:config.cityDisplayName,layout:waterfrontLayout(config.city.openDistricts,config.city.capacities)};
  context.photoIO=async(createdAt,job)=>{
    const day=shanghaiMidnight(createdAt);activeUploads.set(day,(activeUploads.get(day)??0)+1);
    try{return await job();}
    finally{
      const left=(activeUploads.get(day)??1)-1;if(left)activeUploads.set(day,left);else activeUploads.delete(day);
      if(day<shanghaiMidnight(clock())){
        endedOldUploadRevision++;
        if(!closed){if(maintenance)void maintenance.finally(()=>{if(!closed)void maintain();});else void maintain();}
      }
    }
  };
  const health={ready:false,get cleanupPending(){return physicalPending+(endedOldUploadRevision>sweptUploadRevision?1:0)+[...activeUploads].reduce((n,[day,count])=>n+(day<shanghaiMidnight(clock())?count:0),0);},lastMaintenanceAt:0,dayStart:0,resetAt:0,lastError:null as string|null};
  let maintenance:Promise<void>|undefined,midnightTimer:ReturnType<typeof setTimeout>|undefined,interval:ReturnType<typeof setInterval>|undefined,closed=false;
  function maintain(){
    if(maintenance)return maintenance;
    maintenance=(async()=>{
      const ioRevision=endedOldUploadRevision,pendingBefore=health.cleanupPending;
      let logicalComplete=false;
      try{
        const day=await gameOperation(context,async(_now,day)=>day);
        health.dayStart=day.dayStart;health.resetAt=day.resetAt;health.ready=true;
        logicalComplete=true;
        if(day.reset)log({event:'logical_reset',at:clock(),dayStart:day.dayStart});
        let expired=0,pending=0;
        for(let page=0;page<50;page++){const cleaned=await cleanupPhotos({...context,publicPhotosOpen:context.publicPhotosOpen===true});expired+=cleaned.removed;pending+=cleaned.pending;if(cleaned.removed<200||cleaned.pending)break;}
        const files=await removePastDayFiles(bucket.asR2(),clock()),temporary=await bucket.sweepTemporary(clock());
        physicalPending=pending+files.pending+temporary.pending;sweptUploadRevision=ioRevision;health.lastError=health.cleanupPending?'cleanup_pending':null;health.lastMaintenanceAt=clock();
        if(day.reset||expired||files.removed||temporary.removed||health.cleanupPending||pendingBefore)log({event:'file_cleanup',at:clock(),removed:files.removed+expired+temporary.removed,pending:health.cleanupPending,dayStart:health.dayStart});
      }catch{
        health.lastError='maintenance_failed';physicalPending=Math.max(1,physicalPending);log({event:'maintenance_failed',at:clock()});
        // A request boundary still checks the current day; startup cannot be ready without its logical reset.
        if(!logicalComplete)health.ready=false;
      }finally{maintenance=undefined;}
    })();
    return maintenance;
  }
  await maintain();
  if(!health.ready){database.close();throw Error('startup_not_ready');}
  function scheduleMidnight(){
    if(closed||options.timers===false)return;
    midnightTimer=setTimeout(()=>void maintain().finally(scheduleMidnight),Math.max(1,nextShanghaiMidnight(clock())-clock()));
    midnightTimer.unref();
  }
  scheduleMidnight();
  if(options.timers!==false){interval=setInterval(()=>void maintain(),60_000);interval.unref();}
  const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.json':'application/json','.woff2':'font/woff2','.ico':'image/x-icon'};
  const webRoot=path.resolve(options.webRoot);
  const server=createServer(async(request,response)=>{
    try{
      const url=new URL(request.url??'/',origin);
      if(url.origin!==origin.origin){response.writeHead(400);response.end();return;}
      if(url.pathname==='/health/live'||url.pathname==='/health/ready'){
        response.writeHead(url.pathname.endsWith('ready')&&!health.ready?503:200,{'Content-Type':'application/json','Cache-Control':'no-store'});
        response.end(JSON.stringify({releaseId:RELEASE_ID,...health}));return;
      }
      if(request.headers.host!==origin.host){response.writeHead(421,{'Cache-Control':'no-store'});response.end();return;}
      if(Number(request.headers['content-length'])>(url.pathname==='/api/photos/draft'?512*1024:65_536)){
        request.resume();response.writeHead(413,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end('{"error":"body_too_large"}');return;
      }
      const headers=new Headers();for(const [key,value] of Object.entries(request.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);
      headers.delete('cf-connecting-ip');headers.delete('x-forwarded-for');
      const hasBody=!['GET','HEAD'].includes(request.method??'GET');
      const webRequest=new Request(url,{method:request.method,headers,...(hasBody?{body:Readable.toWeb(request) as ReadableStream<Uint8Array>,duplex:'half'}:{})} as RequestInit);
      let result:Response;
      if(url.pathname.startsWith('/api/')){
        if(!health.ready)result=Response.json({error:'storage_unavailable'},{status:503});
        else result=await handleApi(webRequest,{...context,clientAddress:requestAddress(request,env.SKYLINE_TRUST_PROXY==='1')});
      }else if(url.pathname==='/runtime-config.json')result=Response.json(config);
      else if(!['GET','HEAD'].includes(request.method??'GET'))result=new Response(null,{status:405});
      else{
        const decoded=decodeURIComponent(url.pathname);
        const file=path.resolve(webRoot,'.'+(decoded==='/'?'/index.html':decoded));
        if(!file.startsWith(webRoot+path.sep)||decoded.includes('\0'))result=new Response(null,{status:404});
        else try{const info=await stat(file);result=info.isFile()?new Response(await readFile(file),{headers:{'Content-Type':types[path.extname(file)]??'application/octet-stream','X-Content-Type-Options':'nosniff'}}):new Response(null,{status:404});}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')result=new Response(null,{status:404});else throw error;}
      }
      result=cachePolicy(webRequest,result);
      response.writeHead(result.status,Object.fromEntries(result.headers));
      if(request.method==='HEAD'||!result.body){response.end();return;}
      const reader=result.body.getReader();
      for(;;){const {done,value}=await reader.read();if(done)break;if(response.destroyed){await reader.cancel();return;}if(!response.write(value))await new Promise<void>(resolve=>response.once('drain',resolve));}
      response.end();
    }catch{if(!response.headersSent)response.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end('{"error":"service_unavailable"}');}
  });
  server.requestTimeout=30_000;server.headersTimeout=15_000;server.maxHeadersCount=100;
  return {server,context,database,bucket,health,maintain,async close(){closed=true;if(midnightTimer)clearTimeout(midnightTimer);if(interval)clearInterval(interval);await new Promise<void>(resolve=>server.listening?server.close(()=>resolve()):resolve());await maintenance;database.close();}};
}
