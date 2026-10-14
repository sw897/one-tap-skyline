import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteD1} from './sqlite-d1.ts';
import {CityStore} from '../src/server/store.ts';
import {makeTrace} from './run-fixtures.ts';
import {randomId} from '../src/server/policy.ts';
import {waterfrontLayout} from '../src/core/layout.ts';
import {ensureGameDay} from '../src/server/daily-reset.ts';
import {nextShanghaiMidnight} from '../src/core/photo.ts';
import {parseRuntimeConfig} from '../src/config.ts';

const setup=async()=>{
  const db=new SqliteD1(),store=new CityStore(db.asD1()),now=Date.now();
  await ensureGameDay(db.asD1(),now);await store.ensureCity('test','模拟测试',waterfrontLayout(1));
  const person=()=>store.createPlayer(randomId(),randomId(),randomId(),now,nextShanghaiMidnight(now));
  const run=async(player:Awaited<ReturnType<typeof person>>,floors:number)=>{
    const start=await store.start('test',player.id,randomId(),null,now),row=await store.getRun(start.runId,player.id,now),f=makeTrace(floors);
    return {row,submit:()=>store.submit(row,player,'模拟作品',f.trace,{...f.completed,runId:row.id},'hash-'+row.id,now)};
  };
  const entrants=[];
  for(let i=0;i<10;i++){const p=await person();await (await run(p,4)).submit();entrants.push(p);}
  return {db,store,now,person,run,entrants};
};

test('event runtime is fixed at six districts / 76 slots even with stale expansion config',()=>{
  const config=parseRuntimeConfig({city:{openDistricts:10,capacities:Array(10).fill(16)}});
  assert.equal(config.city.openDistricts,6);assert.equal(config.city.capacities.slice(0,6).reduce((a,b)=>a+b,0),76);
});

test('equal timestamps still obey achievement arrival order; displaced facade survives and returns',async()=>{
  const h=await setup();try{
    const old=h.entrants.at(-1)!,building=h.db.connection.prepare('SELECT * FROM buildings WHERE player_id=?').get(old.id)!;
    h.db.connection.prepare(`INSERT INTO photo_assets(id,city_id,player_id,upload_key,request_hash,status,created_at,expires_at,image_key,thumbnail_key)
      VALUES('synthetic-photo','test',?,'synthetic-upload','hash','active',?,?,'synthetic/image','synthetic/thumbnail')`).run(old.id,h.now,h.now+60_000);
    h.db.connection.prepare("INSERT INTO building_facades(building_id,asset_id,version) VALUES(?,'synthetic-photo',3)").run(building.id);
    const a=await h.person(),b=await h.person();
    await (await h.run(a,4)).submit();await (await h.run(b,4)).submit();
    assert.equal((await h.store.snapshot('test',true,a.id)).buildings[0].plotId,-1);
    const contender=await h.run(a,5);await contender.submit();
    const evicted=(await h.store.snapshot('test',true,old.id)).buildings[0];
    assert.equal(evicted.plotId,-1);assert.equal(evicted.photo?.id,'synthetic-photo');assert.equal(evicted.appearanceVersion,3);
    assert.deepEqual(evicted.tower,JSON.parse(building.tower_json as string));
    assert.equal((await h.store.snapshot('test',true)).buildings.find(x=>x.playerId===a.public_id)?.plotId,building.plot_id);
    const after=await h.store.snapshot('test',true);assert.equal((await contender.submit()).duplicate,true);assert.deepEqual(await h.store.snapshot('test',true),after);
    await (await h.run(old,6)).submit();const returned=(await h.store.snapshot('test',true,old.id)).buildings[0];
    assert.ok(returned.plotId>=0);assert.equal(returned.photo?.id,'synthetic-photo');assert.equal(returned.appearanceVersion,3);
    const orders=h.db.connection.prepare('SELECT achieved_order FROM buildings').all().map(x=>x.achieved_order);assert.equal(new Set(orders).size,12);
    await ensureGameDay(h.db.asD1(),nextShanghaiMidnight(h.now)+1);
    for(const table of ['buildings','building_facades','photo_assets','players','runs'])assert.equal(h.db.connection.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n,0);
  }finally{h.db.close();}
});

test('every mutating submission step rolls back displacement, personal model, revision and receipt together',async()=>{
  const h=await setup();try{
    const p=await h.person(),candidate=await h.run(p,9),before=JSON.stringify(h.db.connection.prepare('SELECT * FROM buildings ORDER BY id').all()),city=JSON.stringify(await h.store.snapshot('test',true));
    for(let step=0;step<=8;step++){
      h.db.failAt=step;await assert.rejects(candidate.submit(),/Injected transaction failure/);h.db.failAt=undefined;
      assert.equal(JSON.stringify(h.db.connection.prepare('SELECT * FROM buildings ORDER BY id').all()),before);
      assert.equal(JSON.stringify(await h.store.snapshot('test',true)),city);
      const row=h.db.connection.prepare('SELECT status,receipt_json FROM runs WHERE id=?').get(candidate.row.id)!;assert.equal(row.status,'active');assert.equal(row.receipt_json,null);
    }
    await candidate.submit();assert.equal((await h.store.snapshot('test',true)).buildings.length,10);
  }finally{h.db.close();}
});

test('concurrent contenders serialize slot allocation and preserve all saved works',async()=>{
  const h=await setup();try{
    const candidates=[];for(let i=0;i<15;i++){const p=await h.person();candidates.push(await h.run(p,5+i%4));}
    await Promise.all(candidates.map(c=>c.submit()));
    const s=await h.store.snapshot('test',true);assert.equal(s.buildings.length,10);assert.equal(s.totalBuildings,25);assert.equal(new Set(s.buildings.map(b=>b.plotId)).size,10);
    const expected=h.db.connection.prepare('SELECT player_id FROM buildings ORDER BY floors DESC,achieved_order LIMIT 10').all().map(x=>x.player_id);
    const displayed=h.db.connection.prepare('SELECT player_id FROM buildings WHERE plot_id>=0 ORDER BY floors DESC,achieved_order').all().map(x=>x.player_id);
    assert.deepEqual(displayed,expected);
  }finally{h.db.close();}
});
