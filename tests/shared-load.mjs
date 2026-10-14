import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {makeTrace} from './run-fixtures.ts';
import {validateTower} from '../src/core/tower.ts';
const base=process.env.SKYLINE_BASE_URL??'http://127.0.0.1:5187/',origin=new URL(base).origin;
const root=path.resolve(process.env.SKYLINE_EVIDENCE_DIR??path.join(os.tmpdir(),'skyline-load-'+Date.now()));
if(root===process.cwd()||root.startsWith(process.cwd()+path.sep))throw Error('Private evidence path required');
await mkdir(root,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
const target=Number(process.env.SKYLINE_LOAD_TARGET??100),seconds=Number(process.env.SKYLINE_LOAD_SECONDS??60);
assert.ok([0,1,60,76,100].includes(target));assert.ok(seconds>=60&&seconds<=300);
const p95=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)]??null;};
const report={at:new Date().toISOString(),base,scope:'Isolated test city, generated protocol traces; actual desktop browser renderer calls, not phone hardware or pixel recognition. Formal run only after candidate freeze.',target,requests:[],scenes:[],propagationMs:[],errors:[],passed:false};
let browser,context,page;
const actors=[],draws=new Map(),starts=new Map(),expected=new Map();
async function call(route,body,cookie,phase='load'){
  const start=performance.now();
  const response=await fetch(new URL(route,base),{method:body===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{Origin:origin,'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json();report.requests.push({phase,kind:body===undefined?'read':'write',status:response.status,ms:performance.now()-start});
  if(!response.ok)throw Error('HTTP '+response.status+' '+(value.error??''));
  return {value,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
function compareDraw(id){
  if(!expected.has(id)||!draws.has(id)||!starts.has(id))return;
  const draw=draws.get(id),building=expected.get(id);
  assert.deepEqual(draw.tower,building.tower);assert.equal(draw.color,building.color);assert.equal(draw.logicalHeight,draw.displayedHeight);
  report.propagationMs.push(Math.max(0,draw.masterTime-starts.get(id)));starts.delete(id);
}
try{
  assert.equal((await call('/api/city?city=test',undefined,undefined,'precondition')).value.totalBuildings,0,'Use a new isolated test volume; never clear public or reuse populated test city');
  browser=await chromium.launch({headless:true,channel:process.env.SKYLINE_BROWSER_CHANNEL??'chrome'});
  context=await browser.newContext({viewport:{width:1920,height:1080}});page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.exposeFunction('skylineDraw',detail=>{draws.set(detail.runId,{...detail,masterTime:performance.now()});try{compareDraw(detail.runId);}catch(e){report.errors.push(String(e));}});
  await page.addInitScript(()=>window.addEventListener('skyline:test-draw',e=>void window.skylineDraw(e.detail)));
  await page.goto(new URL('/?mode=display&view=city&city=test&measure=1',base).href);
  await page.waitForFunction(()=>window.__SKYLINE_MEASURE__?.frames.length>30);
  for(const count of [0,1,60,76,100].filter(n=>n<=target)){
    const added=[];
    for(let i=actors.length;i<count;i++){
      const s=await call('/api/session?city=test',undefined,undefined,'seed');
      const begun=await call('/api/runs',{city:'test',startKey:crypto.randomUUID()},s.cookie,'seed'),fixture=makeTrace(12+i%15,i);
      const actor={cookie:s.cookie,playerId:s.value.playerId,runId:begun.value.runId,floors:12+i%15,fixture,ready:performance.now()+fixture.trace.endUs/1000+80};
      actors.push(actor);added.push(actor);
    }
    if(added.length)await delay(Math.max(...added.map(a=>a.ready))-performance.now());
    for(let index=0;index<added.length;index+=10)await Promise.all(added.slice(index,index+10).map(async a=>{
      await call('/api/runs/'+a.runId+'/submit',{name:'模拟测试楼 '+(actors.indexOf(a)+1),trace:a.fixture.trace},a.cookie,'seed');
    }));
    const snapshot=(await call('/api/city?city=test',undefined,undefined,'scene')).value;
    assert.equal(snapshot.totalBuildings,count);assert.equal(snapshot.displayedBuildings,Math.min(count,76));assert.equal(snapshot.buildings.length,Math.min(count,76));
    assert.equal(new Set(snapshot.buildings.map(b=>b.plotId)).size,snapshot.buildings.length);assert.ok(snapshot.buildings.every(b=>validateTower(b.tower)&&b.plotId!==13));
    if(count)await page.waitForFunction(ids=>ids.every(id=>window.__SKYLINE_MEASURE__?.drawn[id]),snapshot.buildings.map(b=>b.bestRunId),{timeout:15_000});
    const observed=await page.evaluate(()=>{const m=window.__SKYLINE_MEASURE__;m.frames=[];return {ambient:m.ambient,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches};});
    assert.equal(observed.reduced,false,'Default motion sample must not use reduced-motion');assert.equal(observed.ambient,true);
    await delay(10_000);const intervals=await page.evaluate(()=>window.__SKYLINE_MEASURE__.frames.slice(20));
    const frame={saved:count,displayed:snapshot.buildings.length,frameCount:intervals.length,p95Ms:p95(intervals),ambient:true,viewport:'1920x1080',scope:'renderer frame interval; GPU/network metadata captured by runner separately'};
    report.scenes.push(frame);await page.screenshot({path:path.join(root,'city-'+count+'.png')});
    if(count>76){
      const outside=actors.find(a=>!snapshot.buildings.some(b=>b.playerId===a.playerId));assert.ok(outside);
      const own=(await call('/api/city?city=test&scope=own',undefined,outside.cookie,'own-check')).value;
      assert.equal(own.buildings.length,1);assert.equal(own.buildings[0].plotId,-1);
    }
  }
  if(target>=60){
    const before=(await call('/api/city?city=test',undefined,undefined,'load-start')).value;
    const eligible=actors.filter(a=>before.buildings.some(b=>b.playerId===a.playerId)).slice(0,20);assert.equal(eligible.length,20);
    const began=performance.now();
    await Promise.all(eligible.map(async(a,index)=>{
      if(index<10){while(performance.now()-began<seconds*1000){await call('/api/city?city=test&scope=own',undefined,a.cookie);await delay(3000);}}
      else{
        const started=await call('/api/runs',{city:'test',startKey:crypto.randomUUID()},a.cookie),fixture=makeTrace(a.floors+1,index);
        await delay(fixture.trace.endUs/1000+80);const id=started.value.runId;
        starts.set(id,performance.now());
        const reply=(await call('/api/runs/'+id+'/submit',{trace:fixture.trace,name:'模拟更新楼 '+index},a.cookie)).value;
        assert.equal(reply.receipt.kind,'best');const building=reply.receipt.building;
        if(building.plotId<0)starts.delete(id);else{expected.set(id,building);compareDraw(id);}
        while(performance.now()-began<seconds*1000){await call('/api/city?city=test&scope=own',undefined,a.cookie);await delay(3000);}
      }
    }));
    await delay(5000);assert.equal(starts.size,0);
    report.summary={clients:20,durationSeconds:seconds,readP95Ms:p95(report.requests.filter(r=>r.phase==='load'&&r.kind==='read').map(r=>r.ms)),writeP95Ms:p95(report.requests.filter(r=>r.phase==='load'&&r.kind==='write').map(r=>r.ms)),renderConfirmP95Ms:p95(report.propagationMs),eligibleUpdates:report.propagationMs.length,latencyClock:'master performance.now before submission to callback after renderer draw, including browser binding delivery'};
    assert.ok(report.propagationMs.length>=10);assert.ok(report.summary.renderConfirmP95Ms<=5000);
  }
  assert.ok(report.scenes.every(s=>s.p95Ms!==null&&s.p95Ms<=33.3));assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{await context?.close();await browser?.close();await writeFile(path.join(root,'shared-load-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,summary:report.summary,failure:report.failure,evidence:root}));}
