import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteD1} from './sqlite-d1.ts';
import {CityStore} from '../src/server/store.ts';
import {randomId} from '../src/server/policy.ts';
import {makeTrace} from './run-fixtures.ts';
import {exportCityData,importCityData} from '../src/server/transfer.ts';

test('versioned structured data restores to empty schema with stable identity, geometry, rank and plots',async()=>{
  const source=new SqliteD1(),destination=new SqliteD1();
  try{
    const store=new CityStore(source.asD1());await store.ensureCity('test','测试迁移城');
    for(const n of [12,12,9]){const p=await store.createPlayer(randomId(),randomId(),randomId(),1000,1e12),r=await store.start('test',p.id,randomId(),null,1000),row=await store.getRun(r.runId,p.id,1000),fixture=makeTrace(n);await store.submit(row,p,'测试迁移楼',fixture.trace,{...fixture.completed,runId:r.runId},randomId(),2000);}
    const bundle=await exportCityData(source.asD1());await importCityData(destination.asD1(),bundle);
    const restored=await exportCityData(destination.asD1());assert.deepEqual(restored.tables,bundle.tables);
    assert.deepEqual(await new CityStore(destination.asD1()).snapshot('test',true),await store.snapshot('test',true));
    await assert.rejects(()=>importCityData(destination.asD1(),bundle),/empty/);
  }finally{source.close();destination.close();}
});
test('invalid geometry/version and injected restore failure leave destination empty',async()=>{
  const source=new SqliteD1(),destination=new SqliteD1();
  try{const store=new CityStore(source.asD1());await store.ensureCity('test','测试迁移');const p=await store.createPlayer(randomId(),randomId(),randomId(),1000,1e12),r=await store.start('test',p.id,randomId(),null,1000),row=await store.getRun(r.runId,p.id,1000),f=makeTrace(3);await store.submit(row,p,'测试楼',f.trace,{...f.completed,runId:r.runId},randomId(),2000);
    const bundle=await exportCityData(source.asD1()),bad=structuredClone(bundle);bad.tables.buildings[0].floors=999;await assert.rejects(()=>importCityData(destination.asD1(),bad),/geometry/);
    destination.failAt=2;destination.failOnBatch=destination.batchCalls+2;await assert.rejects(()=>importCityData(destination.asD1(),bundle));destination.failAt=undefined;
    for(const rows of Object.values((await exportCityData(destination.asD1())).tables))assert.equal(rows.length,0);
  }finally{source.close();destination.close();}
});
