import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {makeTrace} from './run-fixtures.ts';
import {validateTower} from '../src/core/tower.ts';

const base=process.env.SKYLINE_BASE_URL??'http://127.0.0.1:5173/';
const root=path.resolve(process.env.SKYLINE_EVIDENCE_DIR??path.join(os.tmpdir(),'skyline-load-'+Date.now()));
if(root===process.cwd()||root.startsWith(process.cwd()+path.sep))throw new Error('Private evidence path required');await mkdir(root,{recursive:true});
const origin=new URL(base).origin,delay=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
const report={timestamp:new Date().toISOString(),base,scope:'Actual HTTP/D1 test city with engine-generated valid event traces, 60 buildings, 20 clients/60s. Desktop Chrome rendering; not phone hardware.',requests:[],errors:[],propagationMs:[],checks:[],passed:false};
async function call(url,body,cookie,phase='load'){
  const start=performance.now();const response=await fetch(new URL(url,base),{method:body===undefined?'GET':'POST',headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json',Origin:origin})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json();report.requests.push({phase,kind:body===undefined?'read':'write',status:response.status,ms:performance.now()-start});
  if(!response.ok)throw new Error('HTTP '+response.status+' '+(value.error??''));return {value,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
const actors=[],targets=new Map(),seen=new Map();let browser,context;
try{
  const before=(await call('/api/city?city=test',undefined,undefined,'seed')).value;
  const missing=60-before.buildings.length;if(missing<20)throw new Error('Need at least20 free test plots; preserve old data then use an isolated empty test city');
  for(let i=0;i<missing;i++){
    const s=await call('/api/session?city=test',undefined,undefined,'seed');
    const start=await call('/api/runs',{city:'test',startKey:crypto.randomUUID()},s.cookie,'seed');
    const floors=12+i%15,fixture=makeTrace(floors,i);
    actors.push({cookie:s.cookie,playerId:s.value.playerId,runId:start.value.runId,floors,fixture,readyAt:Date.now()+fixture.trace.endUs/1000+60});
  }
  await delay(Math.max(...actors.map(a=>a.readyAt))-Date.now());
  for(let index=0;index<actors.length;index+=10)await Promise.all(actors.slice(index,index+10).map(async a=>{const r=await call('/api/runs/'+a.runId+'/submit',{trace:a.fixture.trace,name:'测试楼 '+String(actors.indexOf(a)+1).padStart(2,'0')},a.cookie,'seed');assert.equal(r.value.receipt.kind,'first');}));
  const populated=(await call('/api/city?city=test',undefined,undefined,'seed')).value;
  assert.equal(populated.buildings.length,60);assert.equal(new Set(populated.buildings.map(b=>b.plotId)).size,60);assert.ok(populated.buildings.every(b=>b.plotId!==13&&validateTower(b.tower)));
  populated.buildings.forEach((b,index)=>{const expected=populated.buildings.findIndex(other=>other.tower.layers.length===b.tower.layers.length)+1;assert.equal(b.rank,expected);});
  report.checks.push({name:'60 whole canonical buildings, unique plots, reserved park, tied ranks',passed:true});
  browser=await chromium.launch({headless:true,channel:process.env.SKYLINE_BROWSER_CHANNEL??'chrome'});context=await browser.newContext({viewport:{width:1440,height:900}});const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));page.on('response',async response=>{
    if(!response.url().includes('/api/city'))return;
    try{const s=await response.json();if(!s.buildings)return;const now=Date.now();for(const b of s.buildings){seen.set(b.bestRunId,now);if(targets.has(b.bestRunId)){report.propagationMs.push(Math.max(0,now-targets.get(b.bestRunId)));targets.delete(b.bestRunId);}}}catch{}
  });
  await page.goto(new URL('/?mode=shared&city=test&view=city',base).href,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('#city-count')?.textContent.startsWith('60 栋'));
  await page.screenshot({path:path.join(root,'city-60-desktop.png'),fullPage:true});
  const frameStats=await page.evaluate(()=>new Promise(resolve=>{const intervals=[];let previous=performance.now();function step(now){intervals.push(now-previous);previous=now;if(intervals.length===120){intervals.sort((a,b)=>a-b);resolve({medianMs:intervals[60],p95Ms:intervals[114],scope:'Desktop Chrome frame intervals only'});}else requestAnimationFrame(step);}requestAnimationFrame(step);}));report.frameStats=frameStats;
  const began=Date.now();
  const workers=actors.slice(0,20).map(async(a,index)=>{
    let first=true;
    while(Date.now()-began<60_000){
      const iteration=Date.now();
      if(index<10){await call('/api/city?city=test',undefined,a.cookie);}
      else{
        const started=await call('/api/runs',{city:'test',startKey:crypto.randomUUID()},a.cookie);
        const fixture=makeTrace(first?a.floors+1:1,index),ready=Date.now()+fixture.trace.endUs/1000+60;
        await delay(ready-Date.now());const submitted=await call('/api/runs/'+started.value.runId+'/submit',{trace:fixture.trace,name:'后续署名'},a.cookie);
        if(first){assert.equal(submitted.value.receipt.kind,'best');const when=Date.now(),id=submitted.value.receipt.runId;if(seen.has(id))report.propagationMs.push(Math.max(0,seen.get(id)-when));else targets.set(id,when);first=false;}
        else assert.equal(submitted.value.receipt.kind,'unchanged');
      }
      await delay(3000-(Date.now()-iteration));
    }
  });
  await Promise.all(workers);report.durationMs=Date.now()-began;
  await page.waitForTimeout(3500);const final=(await call('/api/city?city=test',undefined,undefined,'final')).value;
  assert.equal(final.buildings.length,60);assert.equal(final.revision,populated.revision+10);
  const old=new Map(populated.buildings.map(b=>[b.playerId,b]));for(const b of final.buildings){const p=old.get(b.playerId);for(const k of ['plotId','color','name'])assert.equal(b[k],p[k]);assert.ok(b.tower.layers.length>=p.tower.layers.length);}
  const samples=report.requests.filter(r=>r.phase==='load'),percentile=list=>{list.sort((a,b)=>a-b);return list[Math.max(0,Math.ceil(list.length*.95)-1)]??0;};
  report.summary={requests:samples.length,unexpectedErrors:report.errors.length,readP95Ms:percentile(samples.filter(r=>r.kind==='read').map(r=>r.ms)),writeP95Ms:percentile(samples.filter(r=>r.kind==='write').map(r=>r.ms)),propagationSamples:report.propagationMs.length,within5Seconds:report.propagationMs.filter(ms=>ms<=5000).length};
  assert.equal(report.errors.length,0);assert.ok(report.summary.readP95Ms<=1500);assert.ok(report.summary.writeP95Ms<=2000);assert.equal(targets.size,0);assert.ok(report.summary.propagationSamples>=10);assert.ok(report.summary.within5Seconds/report.summary.propagationSamples>=.95);
  await page.screenshot({path:path.join(root,'city-60-final.png'),fullPage:true});report.passed=true;report.checks.push({name:'20 mixed concurrent clients/60s, atomic best, latency and spectator3s polling',passed:true});
}catch(error){report.failure=String(error);report.errors.push(String(error));console.error(String(error));process.exitCode=1;}
finally{await context?.close();await browser?.close();await writeFile(path.join(root,'shared-load-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,summary:report.summary,errors:report.errors,evidenceDir:root}));}
