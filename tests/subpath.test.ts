import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,stat,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {request} from 'node:http';
import jpeg from 'jpeg-js';
import {createGameServer} from '../src/node/runtime.ts';
import {gameScope} from '../src/shared/app-scope.ts';
import {mobileEntryUrl} from '../src/shared/entry.ts';
import {nextShanghaiMidnight} from '../src/core/photo.ts';
import {randomId} from '../src/server/policy.ts';
import {makeTrace} from './run-fixtures.ts';

async function fixture(id='skyline'){
  const base=path.resolve(process.env.SKYLINE_NODE_TEST_ROOT??path.join(os.tmpdir(),'skyline-subpath-tests'));
  if(base===process.cwd()||base.startsWith(process.cwd()+path.sep))throw Error('private_test_root_required');
  await mkdir(base,{recursive:true});const root=await mkdtemp(path.join(base,'scope-')),web=path.join(root,'web');
  await mkdir(path.join(web,'assets'),{recursive:true});
  await writeFile(path.join(web,'index.html'),'<html><head></head><body>fixture</body></html>');
  await writeFile(path.join(web,'assets/index-abcdefgh.js'),'fixture');
  let now=Date.parse('2030-10-01T02:00:00Z');
  const options={origin:'https://game.example.com',dataRoot:path.join(root,'data'),webRoot:web,migrations:path.resolve('drizzle'),env:{GAME_ID:id,SKYLINE_PUBLIC_WRITE_OPEN:'1',SKYLINE_PUBLIC_PHOTOS_OPEN:'1'},now:()=>now,timers:false,log:()=>{}};
  const runtime=await createGameServer(options);
  await new Promise<void>(resolve=>runtime.server.listen(0,'127.0.0.1',resolve));
  const port=(runtime.server.address() as {port:number}).port;
  const call=(route:string,body?:unknown,cookie?:string,extra:Record<string,string>={})=>new Promise<{status:number;headers:Headers;value:any;bytes:Buffer}>((resolve,reject)=>{
    const bytes=body===undefined?undefined:body instanceof Uint8Array?body:JSON.stringify(body);
    const headers={Host:'game.example.com',...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{Origin:options.origin,'Content-Type':body instanceof Uint8Array?'image/jpeg':'application/json'}),...extra};
    const req=request({hostname:'127.0.0.1',port,path:route,method:body===undefined?'GET':'POST',headers},res=>{
      const chunks:Buffer[]=[];res.on('data',x=>chunks.push(x));res.on('end',()=>{const output=Buffer.concat(chunks),h=new Headers();for(const [k,v] of Object.entries(res.headers))if(v!==undefined)h.set(k,Array.isArray(v)?v.join(', '):v);let value;try{value=JSON.parse(output.toString())}catch{value=output.toString()}resolve({status:res.statusCode!,headers:h,value,bytes:output});});
    });req.on('error',reject);req.end(bytes);
  });
  const api=(route:string,body?:unknown,cookie?:string)=>call('/'+id+route,body,cookie);
  const entry=async()=>{const r=await api('/api/game/entry');assert.equal(r.status,200);return r.value;};
  const session=async()=>{const info=await entry(),r=await api('/api/session?scope=own&entry='+info.entry);assert.equal(r.status,200);return {info,cookie:r.headers.get('set-cookie')!.split(';')[0],response:r};};
  const play=async(cookie:string,entry:string,floors=4)=>{
    const started=await api('/api/runs?entry='+entry,{city:'public',startKey:randomId()},cookie);assert.equal(started.status,200);
    const trace=makeTrace(floors).trace;now+=Math.ceil(trace.endUs/1000)+1;
    const body={name:'模拟检查楼',trace};
    const saved=await api('/api/runs/'+started.value.runId+'/submit?scope=own',body,cookie);assert.equal(saved.status,200);
    return {started,saved,body};
  };
  return {root,options,runtime,call,api,entry,session,play,now:()=>now,setNow:(n:number)=>now=n};
}
const photo=()=>Uint8Array.from(Buffer.concat([jpeg.encode({data:Buffer.alloc(512*768*4,200),width:512,height:768},70).data,Buffer.alloc(70_000)]));

test('invalid Docker identity fails before opening data; Sites URL helper remains root based',async()=>{
  const f=await fixture();await f.runtime.close();
  const dataRoot=path.join(f.root,'must-not-exist');
  for(const id of ['', '../other','A','skyline/other'])await assert.rejects(createGameServer({...f.options,dataRoot,env:{...f.options.env,GAME_ID:id}}),/invalid_game_id/);
  await assert.rejects(stat(dataRoot),{code:'ENOENT'});
  const meta={entry:'day & code',releaseId:'build-new',dayStart:1,resetAt:2};
  assert.equal(mobileEntryUrl(f.options.origin,meta).pathname,'/');
  const qr=mobileEntryUrl(f.options.origin,meta,'public',gameScope('skyline'));
  assert.equal(qr.pathname,'/skyline/');assert.equal(qr.searchParams.get('entry'),meta.entry);assert.equal(qr.searchParams.get('v'),meta.releaseId);
});

test('new paths preserve query and cache, old/other/encoded paths and ambiguous parameters are rejected',async()=>{
  const f=await fixture();try{
    const canonical=await f.call('/skyline?mode=shared&v=build-old&entry=a%2Bb');
    assert.equal(canonical.status,308);assert.equal(canonical.headers.get('location'),'/skyline/?mode=shared&v=build-old&entry=a%2Bb');
    for(const route of ['/','/api/game/entry','/runtime-config.json','/assets/index-abcdefgh.js','/theme/logo','/skyline-other/','/route-check/','/skyline/%2e%2e/runtime-config.json','/skyline/api%2fgame/entry'])assert.equal((await f.call(route)).status,404,route);
    for(const route of ['/skyline/?entry=a&entry=b','/skyline/api/session?city=test','/skyline/api/game/entry?city=test-mobile'])assert.equal((await f.call(route)).status,400,route);
    assert.equal((await f.call('/skyline/')).headers.get('cache-control'),'no-store');
    assert.match((await f.call('/skyline/assets/index-abcdefgh.js')).headers.get('cache-control')!,/immutable/);
    const config=await f.call('/skyline/runtime-config.json');assert.deepEqual(config.value.deployment,gameScope('skyline'));
    assert.equal(config.headers.get('cache-control'),'no-store');
    assert.equal((await f.call('/health/ready')).value.gameId,'skyline');
  }finally{await f.runtime.close();}
});

test('only same-game current entry starts a round; old cookies and test body cannot bypass; submit retries need no entry',async()=>{
  const f=await fixture();try{
    const player=await f.session();assert.match(player.cookie,/^skyline_session=/);assert.match(player.response.headers.get('set-cookie')!,/Path=\/skyline\/;/);
    assert.match(player.response.headers.get('set-cookie')!,/HttpOnly.*SameSite=Lax.*Secure/);
    for(const route of ['/api/session?scope=own','/api/session?entry=wrong','/api/session?entry='+player.info.entry+'&entry='+player.info.entry])assert.ok((await f.api(route,undefined,player.cookie)).status>=400);
    const legacy=player.cookie.replace('skyline_session=','skyline_player=');
    assert.equal((await f.api('/api/runs?entry='+player.info.entry,{city:'public',startKey:randomId()},legacy)).status,401);
    assert.equal((await f.api('/api/runs',{city:'public',startKey:randomId()},player.cookie)).status,403);
    assert.equal((await f.api('/api/runs?entry='+player.info.entry,{city:'test',startKey:randomId()},player.cookie)).status,400);
    const played=await f.play(player.cookie,player.info.entry);
    const repeated=await f.api('/api/runs/'+played.started.value.runId+'/submit?scope=own',played.body,player.cookie);
    assert.equal(repeated.status,200);assert.equal(repeated.value.duplicate,true);
    assert.equal((await f.call('/skyline/?v=build-old')).status,200);
    assert.equal((await f.api('/api/game/entry')).value.releaseId,(await f.entry()).releaseId);
  }finally{await f.runtime.close();}
});

test('two live instances isolate credentials, runs, photo URLs/files and midnight cleanup',async()=>{
  const a=await fixture(),b=await fixture('route-check');try{
    const pa=await a.session(),pb=await b.session();
    assert.notEqual(pa.info.entry,pb.info.entry);
    assert.equal((await b.api('/api/session?entry='+pa.info.entry,undefined,pb.cookie)).status,403);
    const aAsB=pa.cookie.replace('skyline_session=','route-check_session=');
    assert.equal((await b.api('/api/runs?entry='+pb.info.entry,{city:'public',startKey:randomId()},aAsB)).status,401);
    const aa=await a.play(pa.cookie,pa.info.entry),bb=await b.play(pb.cookie,pb.info.entry);
    assert.equal((await b.api('/api/runs/'+aa.started.value.runId+'/submit',aa.body,pb.cookie)).status,404);
    const attach=async(f:typeof a,cookie:string)=>{
      const draft=await f.api('/api/photos/draft?uploadKey='+randomId(),photo(),cookie);assert.equal(draft.status,200);
      const saved=await f.api('/api/photos/save',{id:draft.value.id,version:0},cookie);assert.equal(saved.status,200);
      const media=saved.value.snapshot.buildings[0].photo;
      assert.ok(media.imageUrl.startsWith('/'+f.options.env.GAME_ID+'/api/photos/media/'));
      assert.equal((await f.call(media.imageUrl)).status,200);return {draft,media};
    };
    const ap=await attach(a,pa.cookie),bp=await attach(b,pb.cookie);
    assert.equal((await b.api('/api/photos/media/'+ap.draft.value.id+'/image')).status,404);
    assert.equal((await b.api('/api/photos/remove',{version:1},aAsB)).status,401);
    const bFile=await readFile(path.join(b.options.dataRoot,'photos','photos',String(pb.info.dayStart),bp.draft.value.id,'image.jpg'));
    a.setNow(nextShanghaiMidnight(a.now())+1);await a.runtime.maintain();
    assert.equal(a.runtime.database.connection.prepare('SELECT COUNT(*) n FROM buildings').get()!.n,0);
    assert.equal((await a.runtime.bucket.list()).objects.length,0);assert.equal((await a.call(ap.media.imageUrl)).status,404);
    assert.equal((await a.api('/api/session?entry='+pa.info.entry,undefined,pa.cookie)).status,403);
    assert.notEqual((await a.entry()).entry,pa.info.entry);
    assert.equal(b.runtime.database.connection.prepare('SELECT COUNT(*) n FROM buildings').get()!.n,1);
    assert.equal((await b.entry()).entry,pb.info.entry);assert.equal((await b.call(bp.media.imageUrl)).status,200);
    assert.deepEqual(await readFile(path.join(b.options.dataRoot,'photos','photos',String(pb.info.dayStart),bp.draft.value.id,'image.jpg')),bFile);
    const removed=await b.api('/api/photos/remove',{version:1},pb.cookie);assert.equal(removed.status,200);
    assert.equal((await b.call(bp.media.imageUrl)).status,404);
  }finally{await a.runtime.close();await b.runtime.close();}
});
