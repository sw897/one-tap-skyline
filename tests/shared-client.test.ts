import test from 'node:test';
import assert from 'node:assert/strict';
import { SharedCityRepository } from '../src/shared/client.ts';
import { DEFAULT_CONFIG } from '../src/config.ts';
import { fixtureTower } from '../src/core/tower.ts';
import type { CitySnapshot, SharedSession } from '../src/shared/protocol.ts';

const snapshot=(revision:number,floors:number,run='run-'+revision):CitySnapshot=>({cityId:'test',epoch:'test-epoch',revision,name:'测试城',isTest:true,writeOpen:true,capacity:60,buildings:[{playerId:'public-player',plotId:0,color:'#75aaff',name:'测试楼',bestRunId:run,tower:fixtureTower(floors),source:'shared',rank:1}]});
const session=(s:CitySnapshot):SharedSession=>({playerId:'public-player',color:'#75aaff',snapshot:s,rules:DEFAULT_CONFIG.game,rulesetId:'test',activeRunId:null});
test('late snapshot cannot shrink a new best or change epoch/city',()=>{
  const city=new SharedCityRepository(session(snapshot(1,9)));assert.equal(city.apply(snapshot(3,16)),true);
  assert.equal(city.apply(snapshot(2,12)),false);assert.equal(city.apply(snapshot(3,12)),false);
  assert.equal(city.apply({...snapshot(4,20),cityId:'public'}),false);assert.equal(city.apply({...snapshot(4,20),epoch:'old-epoch'}),false);
  assert.equal(city.get('public-player')!.tower.layers.length,16);
});
test('unrelated revision keeps same tower reference; dispose rejects all stale responses',()=>{
  const city=new SharedCityRepository(session(snapshot(1,12,'same-run'))),tower=city.get('public-player')!.tower;
  assert.equal(city.apply(snapshot(2,12,'same-run')),true);assert.equal(city.get('public-player')!.tower,tower);
  city.dispose();assert.equal(city.apply(snapshot(3,26)),false);
});

test('personal snapshot cache rejects whole-city coverage even with newer revision',()=>{
  const city=new SharedCityRepository(session({...snapshot(1,12),scope:'own'}));
  assert.equal(city.apply({...snapshot(2,16),scope:'all'}),false);
  assert.equal(city.apply({...snapshot(2,16),scope:'own'}),true);assert.equal(city.all().length,1);
});
