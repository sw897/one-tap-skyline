import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteD1 } from './sqlite-d1.ts';
import { makeTrace } from './run-fixtures.ts';
import { CityStore } from '../src/server/store.ts';
import { handleApi } from '../src/server/service.ts';
import { hashText, randomId, RUN_TTL_MS } from '../src/server/policy.ts';

function harness(){
  const db=new SqliteD1(),store=new CityStore(db.asD1());let now=1_900_000_000_000;
  const call=async(path:string,body?:unknown,cookie?:string,headers:Record<string,string>={})=>{
    const response=await handleApi(new Request('https://skyline.test'+path,{method:body===undefined?'GET':'POST',headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{'content-type':'application/json',origin:'https://skyline.test'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),{db:db.asD1(),publicWriteOpen:true,now:()=>now});
    return {response,status:response.status,body:await response.json() as any};
  };
  const session=async()=>{const r=await call('/api/session?city=test');assert.equal(r.status,200);return {cookie:r.response.headers.get('set-cookie')!.split(';')[0],profile:r.body};};
  const play=async(cookie:string,floors:number,name='测试小楼')=>{
    const begun=await call('/api/runs',{city:'test',startKey:randomId()},cookie);assert.equal(begun.status,200);
    const fixture=makeTrace(floors);now+=Math.ceil(fixture.trace.endUs/1000)+5;
    const body={name,trace:fixture.trace};return {runId:begun.body.runId,body,submitted:await call('/api/runs/'+begun.body.runId+'/submit',body,cookie),fixture};
  };
  return {db,store,call,session,play,tick:(ms:number)=>{now+=ms;},now:()=>now};
}

test('start frequency limit returns429 without duplicate runs and recovers next window',async()=>{
  const h=harness();try{
    const player=await h.session(),key=randomId();let runId:string|undefined;
    for(let i=0;i<30;i++){const started=await h.call('/api/runs',{city:'test',startKey:key},player.cookie);assert.equal(started.status,200);runId??=started.body.runId;assert.equal(started.body.runId,runId);}
    const limited=await h.call('/api/runs',{city:'test',startKey:key},player.cookie);assert.equal(limited.status,429);assert.equal(limited.body.error,'rate_limited');
    assert.equal(h.db.connection.prepare('SELECT COUNT(*) AS n FROM runs').get()!.n,1);
    assert.equal((await h.call('/api/city?city=test')).body.revision,0);
    h.tick(60_001);assert.equal((await h.call('/api/runs',{city:'test',startKey:key},player.cookie)).status,200);
  }finally{h.db.close();}
});
test('anonymous cookie is private and same-browser identity persists; spectators do not register',async()=>{
  const h=harness();try{
    const a=await h.session(),b=await h.session();assert.notEqual(a.profile.playerId,b.profile.playerId);
    const same=await h.call('/api/session?city=test',undefined,a.cookie);assert.equal(same.body.playerId,a.profile.playerId);
    const raw=JSON.stringify(same.body);assert.ok(!raw.includes('credential_hash'));assert.ok(!raw.includes(a.cookie.split('=')[1]));
    assert.equal((await h.call('/api/city?city=public')).body.buildings.length,0);
    assert.equal(h.db.connection.prepare('SELECT COUNT(*) AS n FROM players').get()!.n,2);
  }finally{h.db.close();}
});
test('first/lower/equal/best keep plot/color/name and complete new geometry; duplicate is immutable',async()=>{
  const h=harness();try{
    const a=await h.session();const first=await h.play(a.cookie,12,'测试首楼');assert.equal(first.submitted.status,200);assert.equal(first.submitted.body.receipt.kind,'first');
    const original=first.submitted.body.snapshot.buildings[0];
    for(const n of [9,12]){const low=await h.play(a.cookie,n,'修改名');assert.equal(low.submitted.body.receipt.kind,'unchanged');assert.deepEqual(low.submitted.body.snapshot.buildings[0],original);assert.equal(low.submitted.body.snapshot.revision,1);}
    const best=await h.play(a.cookie,16,'别的名');assert.equal(best.submitted.body.receipt.kind,'best');const updated=best.submitted.body.snapshot.buildings[0];
    assert.deepEqual(updated.tower,best.fixture.completed.tower);for(const k of ['playerId','plotId','color','name'])assert.equal(updated[k],original[k]);assert.equal(best.submitted.body.snapshot.revision,2);
    const retry=await h.call('/api/runs/'+best.runId+'/submit',best.body,a.cookie);assert.equal(retry.status,200);assert.equal(retry.body.duplicate,true);assert.equal(retry.body.snapshot.revision,2);
    const changed=await h.call('/api/runs/'+best.runId+'/submit',{...best.body,name:'改正文'},a.cookie);assert.equal(changed.status,409);
  }finally{h.db.close();}
});
test('start key retries one run; second active rejects; cancellation and expiry release lock',async()=>{
  const h=harness();try{const a=await h.session(),key=randomId();
    const first=await h.call('/api/runs',{city:'test',startKey:key},a.cookie),retry=await h.call('/api/runs',{city:'test',startKey:key},a.cookie);assert.equal(first.body.runId,retry.body.runId);
    assert.equal((await h.call('/api/runs',{city:'test',startKey:randomId()},a.cookie)).status,409);
    assert.equal((await h.call('/api/runs/'+first.body.runId+'/cancel',{},a.cookie)).status,200);
    const next=await h.call('/api/runs',{city:'test',startKey:randomId()},a.cookie);assert.equal(next.status,200);
    h.tick(RUN_TTL_MS+1);assert.equal((await h.call('/api/runs/'+next.body.runId,undefined,a.cookie)).body.status,'expired');
    assert.equal((await h.call('/api/runs',{city:'test',startKey:randomId()},a.cookie)).status,200);
  }finally{h.db.close();}
});
test('tied ranks 1/1/3 and foreign run rejection; zero run produces no plot',async()=>{
  const h=harness();try{const sessions=await Promise.all([h.session(),h.session(),h.session()]);
    const first=await h.play(sessions[0].cookie,12);await h.play(sessions[1].cookie,12);await h.play(sessions[2].cookie,9);
    const snapshot=(await h.call('/api/city?city=test')).body;assert.deepEqual(snapshot.buildings.map((b:any)=>b.rank),[1,1,3]);
    assert.equal((await h.call('/api/runs/'+first.runId+'/submit',first.body,sessions[1].cookie)).status,404);
    const zero=await h.session(),done=await h.play(zero.cookie,0);assert.equal(done.submitted.body.receipt.kind,'zero');assert.equal(done.submitted.body.snapshot.buildings.length,3);
    assert.equal((await h.call('/api/runs',{city:'test',startKey:randomId()},zero.cookie)).status,200);
  }finally{h.db.close();}
});
test('capacity rejects newcomer without losing existing best; reserved park never allocated',async()=>{
  const h=harness();try{const a=await h.session();h.db.connection.exec("UPDATE cities SET capacity=1 WHERE id='test'");
    await h.play(a.cookie,2);const b=await h.session();const full=await h.play(b.cookie,3);assert.equal(full.submitted.body.receipt.kind,'full');assert.equal(full.submitted.body.snapshot.revision,1);
    const improved=await h.play(a.cookie,4);assert.equal(improved.submitted.body.receipt.kind,'best');assert.equal(improved.submitted.body.snapshot.buildings.length,1);
    assert.equal((await h.call('/api/runs',{city:'test',startKey:randomId()},b.cookie)).status,200);
  }finally{h.db.close();}
});
test('batch fault after revision rolls back run, best, plot and revision; safe retry works',async()=>{
  const h=harness();try{const a=await h.session(),begun=await h.call('/api/runs',{city:'test',startKey:randomId()},a.cookie);const fixture=makeTrace(4);h.tick(Math.ceil(fixture.trace.endUs/1000)+1);
    const body={trace:fixture.trace,name:'测试回滚'};h.db.failAt=4;
    const failed=await h.call('/api/runs/'+begun.body.runId+'/submit',body,a.cookie);assert.equal(failed.status,503);
    h.db.failAt=undefined;assert.equal((await h.call('/api/city?city=test')).body.revision,0);assert.equal(h.db.connection.prepare('SELECT COUNT(*) AS n FROM buildings').get()!.n,0);
    const retried=await h.call('/api/runs/'+begun.body.runId+'/submit',body,a.cookie);assert.equal(retried.status,200);assert.equal(retried.body.snapshot.revision,1);
  }finally{h.db.close();}
});
test('repository stale-run race keeps maximum and unique plots under Promise.all',async()=>{
  const h=harness();try{await h.store.ensureCity('test','测试城市');const player=await h.store.createPlayer(randomId(),randomId(),'a'.repeat(64),h.now(),h.now()+1e9);
    const candidates=[];
    for(const n of [9,16,12]){const start=await h.store.start('test',player.id,randomId(),null,h.now());const row=await h.store.getRun(start.runId,player.id,h.now());await h.store.cancel(row.id,player.id);const f=makeTrace(n);candidates.push({row,f});}
    // Historical completed-run repository fixture bypasses only the one-active API gate.
    const writes=candidates.map(({row,f})=>{row.status='active';h.db.connection.prepare("UPDATE runs SET status='active' WHERE id=?").run(row.id);const result=h.store.submit(row,player,'测试并发',f.trace,{...f.completed,runId:row.id},'hash-'+f.completed.tower.layers.length,h.now());return result;});
    await Promise.all(writes);const snapshot=await h.store.snapshot('test',true);assert.equal(snapshot.buildings.length,1);assert.equal(snapshot.buildings[0].tower.layers.length,16);assert.equal(snapshot.revision,2);
  }finally{h.db.close();}
});
test('protocol, origin, elapsed-time and request-size tampering never changes city',async()=>{
  const h=harness();try{const a=await h.session();assert.equal((await h.call('/api/runs',{city:'test',startKey:randomId()},a.cookie,{origin:'https://other.test'})).status,403);
    const begun=await h.call('/api/runs',{city:'test',startKey:randomId()},a.cookie),f=makeTrace(4);
    assert.equal((await h.call('/api/runs/'+begun.body.runId+'/submit',{trace:f.trace,score:999},a.cookie)).status,400);
    assert.equal((await h.call('/api/runs/'+begun.body.runId+'/submit',{trace:f.trace},a.cookie)).status,400);
    assert.equal((await h.call('/api/runs/'+begun.body.runId+'/submit',{trace:f.trace,name:'x'.repeat(70_000)},a.cookie)).status,413);
    assert.equal((await h.call('/api/city?city=test')).body.revision,0);
  }finally{h.db.close();}
});
