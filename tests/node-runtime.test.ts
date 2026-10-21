import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import jpeg from 'jpeg-js';
import {NodeDatabase} from '../src/node/database.ts';
import {createGameServer,requestAddress} from '../src/node/runtime.ts';
import {handleApi,type ServerContext} from '../src/server/service.ts';
import {nextShanghaiMidnight,shanghaiMidnight} from '../src/core/photo.ts';
import {randomId} from '../src/server/policy.ts';
import {makeTrace} from './run-fixtures.ts';
import type {R2Bucket} from '@cloudflare/workers-types';
import type {IncomingMessage} from 'node:http';
import {request as httpRequest} from 'node:http';
async function http(url:string,options:{method?:string;headers?:Record<string,string>;body?:string}={}):Promise<Response>{
  return new Promise((resolve,reject)=>{
    const request=httpRequest(url,{method:options.method??'GET',headers:options.headers},response=>{
      const chunks:Buffer[]=[];response.on('data',chunk=>chunks.push(chunk));
      response.on('end',()=>{const headers=new Headers();for(const [key,value] of Object.entries(response.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers}));});
    });
    request.on('error',reject);request.end(options.body);
  });
}

async function fixture(){
  const base=path.resolve(process.env.SKYLINE_NODE_TEST_ROOT??path.join(os.tmpdir(),'skyline-node-tests'));
  if(base===process.cwd()||base.startsWith(process.cwd()+path.sep))throw Error('private_test_root_required');
  await mkdir(base,{recursive:true});const root=await mkdtemp(path.join(base,'case-')),web=path.join(root,'web');
  await mkdir(path.join(web,'assets'),{recursive:true});await writeFile(path.join(web,'index.html'),'<html>fixture</html>');await writeFile(path.join(web,'assets/index-abcdefgh.js'),'fixture');
  let now=Date.parse('2030-10-01T02:00:00Z');
  const options={origin:'https://game.example.com',dataRoot:root,webRoot:web,migrations:path.resolve('drizzle'),env:{GAME_ID:'skyline',SKYLINE_ALLOW_TEST_CITIES:'1',SKYLINE_PUBLIC_WRITE_OPEN:'1',SKYLINE_PUBLIC_PHOTOS_OPEN:'1'},now:()=>now,timers:false,log:()=>{}};
  const runtime=await createGameServer(options);
  const call=async(route:string,body?:unknown,cookie?:string,ctx:ServerContext=runtime.context)=>{
    const response=await handleApi(new Request(options.origin+route,{method:body===undefined?'GET':'POST',headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{Origin:options.origin,'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}),ctx);
    return {response,status:response.status,body:await response.json() as any};
  };
  const session=async()=>{const r=await call('/api/session?city=test');assert.equal(r.status,200);return r.response.headers.get('set-cookie')!.split(';')[0];};
  const play=async(cookie:string,floors=4)=>{const started=await call('/api/runs',{city:'test',startKey:randomId()},cookie);assert.equal(started.status,200);const f=makeTrace(floors);now+=Math.ceil(f.trace.endUs/1000)+1;const body={name:'模拟测试楼',trace:f.trace};const saved=await call('/api/runs/'+started.body.runId+'/submit',body,cookie);assert.equal(saved.status,200);return {saved,started,body};};
  const upload=async(cookie:string,ctx=runtime.context)=>{
    const response=await handleApi(new Request(options.origin+'/api/photos/draft?city=test&uploadKey='+randomId(),{method:'POST',headers:{cookie,Origin:options.origin,'Content-Type':'image/jpeg'},body:photo() as BodyInit}),ctx);
    return {response,status:response.status,body:await response.json() as any};
  };
  return {root,options,runtime,call,session,play,upload,setNow:(value:number)=>now=value,now:()=>now};
}
let jpegBytes:Uint8Array|undefined;
function photo(){if(!jpegBytes){const data=new Uint8Array(512*768*4);for(let i=0;i<data.length;i+=4){data[i]=60;data[i+1]=170;data[i+2]=220;data[i+3]=255;}jpegBytes=Uint8Array.from(jpeg.encode({data,width:512,height:768},70).data);}return jpegBytes;}

test('production SQLite contract returns rows/changes and rolls back a failed batch',async()=>{
  const f=await fixture();try{const db=f.runtime.database;
    await db.prepare('CREATE TABLE contract(id INTEGER PRIMARY KEY,value TEXT UNIQUE)').run();
    const inserted=await db.prepare('INSERT INTO contract(value) VALUES(?) RETURNING id,value').bind('one').run();
    assert.equal(inserted.meta.changes,1);assert.equal(inserted.results[0].id,1);
    assert.equal(await db.prepare('SELECT value FROM contract WHERE id=1').first('value'),'one');
    assert.equal(await db.prepare('SELECT value FROM contract WHERE id=99').first(),null);
    await assert.rejects(db.batch([db.prepare("INSERT INTO contract(value) VALUES('two')"),db.prepare("INSERT INTO contract(value) VALUES('one')")]));
    assert.equal((await db.prepare('SELECT * FROM contract').all()).results.length,1);
    await assert.rejects(db.atomic(async()=>{await db.prepare("INSERT INTO contract(value) VALUES('rollback')").run();throw Error('deliberate');}));
    assert.equal((await db.prepare('SELECT * FROM contract').all()).results.length,1);
  }finally{await f.runtime.close();}
});
test('same-day restart retains data, applies each migration once, changed ledger fails without deleting DB',async()=>{
  const f=await fixture();const cookie=await f.session();await f.play(cookie);await f.runtime.close();
  const again=await createGameServer(f.options);
  assert.equal(again.database.connection.prepare('SELECT COUNT(*) n FROM buildings').get()!.n,1);
  assert.equal(again.database.connection.prepare('SELECT COUNT(*) n FROM skyline_migrations').get()!.n,4);
  again.database.connection.prepare("UPDATE skyline_migrations SET sha256='invalid' WHERE name=(SELECT MIN(name) FROM skyline_migrations)").run();
  await again.close();
  assert.throws(()=>new NodeDatabase(path.join(f.root,'db/game.sqlite'),path.resolve('drizzle')),/applied_migration_changed/);
  assert.ok((await readFile(path.join(f.root,'db/game.sqlite'))).length>0);
});
test('HTTP bridge preserves cache/cookie/origin behavior and rejects forged direct proxy addresses',async()=>{
  const f=await fixture();try{
    await new Promise<void>(resolve=>f.runtime.server.listen(0,'127.0.0.1',resolve));
    const address=f.runtime.server.address() as {port:number},base='http://127.0.0.1:'+address.port;
    const get=(route:string,headers:Record<string,string>={})=>http(base+'/skyline'+route,{headers:{Host:'game.example.com',...headers}});
    assert.equal((await get('/')).headers.get('Cache-Control'),'no-store');
    assert.match((await get('/assets/index-abcdefgh.js')).headers.get('Cache-Control')!,/immutable/);
    assert.equal((await get('/runtime-config.json')).headers.get('Cache-Control'),'no-store');
    assert.equal((await get('/api/session?city=test')).headers.get('Set-Cookie')!.includes('Secure'),true);
    assert.equal((await http(base+'/',{headers:{Host:'wrong.example.com'}})).status,421);
    assert.equal((await http(base+'/skyline/api/runs',{method:'POST',headers:{Host:'game.example.com',Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'})).status,403);
    assert.equal((await http(base+'/skyline/api/runs',{method:'POST',headers:{Host:'game.example.com','Content-Type':'application/json','Content-Length':'70000'},body:'x'.repeat(70_000)})).status,413);
    const incoming=(ip:string,header:string)=>({socket:{remoteAddress:ip},headers:{'x-skyline-client-ip':header}} as unknown as IncomingMessage);
    assert.equal(requestAddress(incoming('198.51.100.1','203.0.113.1'),true),'198.51.100.1');
    assert.equal(requestAddress(incoming('172.18.0.2','203.0.113.1'),true),'203.0.113.1');
    assert.equal(requestAddress(incoming('172.18.0.2','203.0.113.1'),false),'172.18.0.2');
  }finally{await f.runtime.close();}
});
test('slow JSON body across midnight is rejected; maintenance never waits for its body',async()=>{
  const f=await fixture();try{const cookie=await f.session();let release!:()=>void,started!:()=>void;
    const startedPromise=new Promise<void>(r=>started=r),wait=new Promise<void>(r=>release=r);
    const stream=new ReadableStream<Uint8Array>({async start(controller){started();await wait;controller.enqueue(new TextEncoder().encode(JSON.stringify({city:'test',startKey:randomId()})));controller.close();}});
    const reply=handleApi(new Request(f.options.origin+'/api/runs',{method:'POST',headers:{cookie,Origin:f.options.origin,'Content-Type':'application/json'},body:stream,duplex:'half'} as RequestInit),f.runtime.context);
    await startedPromise;f.setNow(nextShanghaiMidnight(f.now())+1);
    await f.runtime.maintain();release();
    assert.equal((await reply).status,410);
    assert.equal(f.runtime.database.connection.prepare('SELECT COUNT(*) n FROM runs').get()!.n,0);
    assert.equal(f.runtime.database.connection.prepare('SELECT COUNT(*) n FROM players').get()!.n,0);
  }finally{await f.runtime.close();}
});
test('late upload cannot revive yesterday; midnight clears DB while file IO is suspended and preserves new-day file',async()=>{
  const f=await fixture();try{const cookie=await f.session();await f.play(cookie);
    let release!:()=>void,started!:()=>void;const wait=new Promise<void>(r=>release=r),began=new Promise<void>(r=>started=r);let first=true;
    const intercepted=new Proxy(f.runtime.bucket,{get(target,key){if(key==='put')return async(...args:Parameters<typeof target.put>)=>{if(first){first=false;started();await wait;}return target.put(...args);};const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});
    const uploading=f.upload(cookie,{...f.runtime.context,bucket:intercepted as unknown as R2Bucket});
    await began;f.setNow(nextShanghaiMidnight(f.now())+1);
    assert.ok(f.runtime.health.cleanupPending>0,'Old-day in-flight upload must count as unfinished physical cleanup');
    await f.runtime.maintain();
    assert.ok(f.runtime.health.cleanupPending>0,'Logical reset does not imply a suspended old upload is finished');
    assert.equal(f.runtime.database.connection.prepare('SELECT COUNT(*) n FROM photo_assets').get()!.n,0);
    const newKey='photos/'+shanghaiMidnight(f.now())+'/'+randomId()+'/image.jpg';await f.runtime.bucket.put(newKey,photo());
    release();assert.equal((await uploading).status,410);await f.runtime.maintain();
    const listed=await f.runtime.bucket.list();assert.deepEqual(listed.objects.map(x=>x.key),[newKey]);
    assert.equal(f.runtime.health.cleanupPending,0);
    assert.equal(f.runtime.database.connection.prepare('SELECT COUNT(*) n FROM buildings').get()!.n,0);
  }finally{await f.runtime.close();}
});
test('draft expires after four hours without participant requests, deletion failure stays pending then retries',async()=>{
  const f=await fixture();try{const cookie=await f.session();await f.play(cookie);const draft=await f.upload(cookie);assert.equal(draft.status,200);
    const realDelete=f.runtime.bucket.delete.bind(f.runtime.bucket);f.runtime.bucket.delete=async()=>{throw Error('injected_delete_failure');};
    f.setNow(f.now()+4*3_600_000+1);await f.runtime.maintain();
    assert.ok(f.runtime.health.cleanupPending>0);
    assert.equal((await f.runtime.bucket.list()).objects.length,2);
    f.runtime.bucket.delete=realDelete;await f.runtime.maintain();
    assert.equal(f.runtime.health.cleanupPending,0);assert.equal((await f.runtime.bucket.list()).objects.length,0);
    assert.equal(f.runtime.database.connection.prepare('SELECT COUNT(*) n FROM photo_assets').get()!.n,0);
  }finally{await f.runtime.close();}
});
test('cross-day startup compensates before readiness and retains only infrastructure markers',async()=>{
  const f=await fixture();const cookie=await f.session();await f.play(cookie);assert.equal((await f.upload(cookie)).status,200);await f.runtime.close();
  f.setNow(nextShanghaiMidnight(f.now())+1);const again=await createGameServer(f.options);
  try{assert.equal(again.health.ready,true);
    for(const table of ['city_events','building_facades','photo_assets','buildings','runs','players','rate_limits','cities'])assert.equal(again.database.connection.prepare('SELECT COUNT(*) n FROM '+table).get()!.n,0);
    assert.equal((await again.bucket.list()).objects.length,0);
    assert.equal(again.database.connection.prepare('SELECT COUNT(*) n FROM skyline_migrations').get()!.n,4);
    assert.equal(again.database.connection.prepare('SELECT day_start FROM game_clock').get()!.day_start,shanghaiMidnight(f.now()));
  }finally{await again.close();}
});
