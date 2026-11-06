import test from 'node:test';
import assert from 'node:assert/strict';
import {demoView,demoSearch,demoBasePath,isDemoReadRequest,watchDemoDay} from '../pages-web/demo-state.ts';

test('public demo links select simulation only and discard shared-entry/debug options',()=>{
  assert.equal(demoView(''),'landing');
  assert.equal(demoSearch(demoView('?mode=practice&entry=private&cut=single-x&qa=1')),'?mode=practice');
  assert.equal(demoSearch(demoView('?mode=display&demo=full&city=test')),'?mode=display&view=city&demo=full');
  for(const query of ['?mode=shared&entry=a','?mode=display','?cut=single-x','?mode=practice&mode=shared','?mode=display&demo=full&demo=other'])assert.equal(demoView(query),'landing',query);
});

test('Pages project path stays compatible with the shared scope parser',()=>{
  assert.equal(demoBasePath(''),'/' );assert.equal(demoBasePath('/'),'/');
  assert.equal(demoBasePath('/one-tap-skyline'),'/one-tap-skyline/');
  for(const value of ['/nested/project/','/../','/Upper/','https://example.com','/a%2fb/'])assert.throws(()=>demoBasePath(value));
});

test('static target can read its files but cannot send scores, photos or reset requests',()=>{
  const config='https://demo.example/one-tap-skyline/runtime-config.json';
  assert.equal(isDemoReadRequest(config,config),true);
  assert.equal(isDemoReadRequest('https://demo.example/one-tap-skyline/assets/main-hash.js',config),true);
  for(const method of ['POST','PUT','DELETE'])assert.equal(isDemoReadRequest(config,config,method),false);
  for(const url of ['https://demo.example/one-tap-skyline/api/runs','https://demo.example/one-tap-skyline/api/photos/draft','https://demo.example/one-tap-skyline/api/game/reset-due','https://other.example/one-tap-skyline/runtime-config.json',config+'?entry=a','https://demo.example/runtime-config.json'])assert.equal(isDemoReadRequest(url,config),false,url);
});

function dayHarness(){
  let now=Date.parse('2026-11-06T15:59:59.999Z'),resets=0,cancels=0,poll=()=>{};
  const target=new EventTarget();
  const stop=watchDemoDay(()=>resets++,{now:()=>now,poll:check=>{poll=check;return()=>cancels++;},wakeTargets:[target]});
  return {setTime:(value:string)=>{now=Date.parse(value);},tick:()=>poll(),wake:(name:string)=>target.dispatchEvent(new Event(name)),stop,resets:()=>resets,cancels:()=>cancels};
}

test('demo resets once at Shanghai midnight, independently of the UTC date',()=>{
  const h=dayHarness();h.tick();assert.equal(h.resets(),0);
  h.setTime('2026-11-06T16:00:00.000Z');h.tick();assert.equal(h.resets(),1);
  h.tick();h.wake('focus');assert.equal(h.resets(),1);h.stop();
});

for(const event of ['visibilitychange','focus','pageshow'])test('sleeping demo compensates for a crossed day on '+event,()=>{
  const h=dayHarness();h.setTime('2026-11-08T02:00:00Z');h.wake(event);assert.equal(h.resets(),1);h.stop();
});

test('disposing the day watcher removes poll and wake-up behavior',()=>{
  const h=dayHarness();h.stop();h.stop();assert.equal(h.cancels(),1);
  h.setTime('2026-11-06T16:00:00Z');h.tick();h.wake('focus');assert.equal(h.resets(),0);
});
