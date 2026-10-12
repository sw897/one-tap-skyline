import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { replayTrace } from '../src/core/trace.ts';
import { OFFICIAL_RULES } from '../src/server/policy.ts';

const base=process.env.SKYLINE_BASE_URL??'http://127.0.0.1:5173/';
const root=path.resolve(process.env.SKYLINE_EVIDENCE_DIR??path.join(os.tmpdir(),'skyline-shared-'+Date.now()));
if(root===process.cwd()||root.startsWith(process.cwd()+path.sep))throw new Error('Private evidence path required');
await mkdir(root,{recursive:true});
const report={timestamp:new Date().toISOString(),base,scope:'Two independent desktop Chrome processes; one phone-size/touch emulation. No physical iPhone/Android.',checks:[],errors:[],expectedNetworkFailures:[],screenshots:[],propagationMs:[],passed:false};
const browser=await chromium.launch({headless:true,channel:process.env.SKYLINE_BROWSER_CHANNEL??'chrome'});
const observerBrowser=await chromium.launch({headless:true,channel:process.env.SKYLINE_BROWSER_CHANNEL??'chrome'});
report.browser=browser.version();
const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,recordVideo:{dir:path.join(root,'video'),size:{width:390,height:844}}});
const desktop=await observerBrowser.newContext({viewport:{width:1440,height:900}});
const page=await phone.newPage(),screen=await desktop.newPage();
let expectFailure=false;
for(const p of [page,screen]){
  p.on('pageerror',e=>report.errors.push(e.message));
  p.on('console',m=>{if(m.type()==='error'){if(expectFailure&&m.text().includes('ERR_FAILED'))report.expectedNetworkFailures.push(m.text());else report.errors.push(m.text());}});
}
await page.addInitScript(()=>{
  window.__INPUT_TIMES__={started:0,last:0,paused:0,pausedAt:null,lastPaused:0,trusted:[]};
  let previous='';
  new MutationObserver(()=>{const view=document.documentElement?.dataset.view;if(view!==previous){previous=view;if(view==='play'&&document.querySelector('#floor-count')?.textContent==='0'){const s=window.__INPUT_TIMES__;s.started=performance.now();s.last=0;s.paused=0;s.pausedAt=null;s.lastPaused=0;}}}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-view']});
  document.addEventListener('pointerdown',event=>{if(event.target instanceof Element&&event.target.closest('#drop-button')){const s=window.__INPUT_TIMES__;s.last=performance.now();s.lastPaused=s.paused;s.trusted.push(event.isTrusted);}},true);
  document.addEventListener('click',event=>{if(!(event.target instanceof Element))return;const s=window.__INPUT_TIMES__;if(event.target.closest('#pause-button'))s.pausedAt=performance.now();if(event.target.closest('#resume-button')&&s.pausedAt!==null){s.paused+=performance.now()-s.pausedAt;s.pausedAt=null;}},true);
});
const record=(name,detail={})=>{report.checks.push({name,passed:true,...detail});console.log('PASS '+name);};
const shot=async(p,name)=>{await p.screenshot({path:path.join(root,name),fullPage:true});report.screenshots.push(name);};
const url=(view='intro')=>new URL(`/?mode=shared&city=test${view==='city'?'&view=city':''}`,base).href;
const settle=async(p)=>{await p.waitForSelector('#prototype-badge',{state:'attached'});assert.equal(await p.locator('#prototype-badge').textContent(),'共享试玩');assert.equal(await p.locator('#scene-data-mark').isVisible(),true);};
async function waitUntil(p,target){await p.evaluate(target=>new Promise(resolve=>{const frame=()=>performance.now()>=target?resolve():requestAnimationFrame(frame);frame();}),target);}
async function build(floors,rotate=false){
  const view=await page.locator('html').getAttribute('data-view');await page.locator(view==='result'?'#replay-button':view==='city'?'#city-play':'#start-button').tap();
  await page.waitForFunction(()=>document.documentElement.dataset.view==='play');
  for(let n=0;n<floors;n++){
    const t=await page.evaluate(()=>({...window.__INPUT_TIMES__}));
    const target=n===0?t.started+1380:t.last+240+3780/(2.7+n*0.035)-20+(t.paused-t.lastPaused);
    await waitUntil(page,target);await page.locator('#drop-button').tap();
    await page.waitForFunction(n=>Number(document.querySelector('#floor-count')?.textContent)===n+1,n,{timeout:4000});
    if(rotate&&n===1){
      await page.locator('#pause-button').tap();const before=await page.locator('#seconds').textContent();
      await page.setViewportSize({width:844,height:390});await page.waitForTimeout(160);assert.equal(await page.locator('#seconds').textContent(),before);
      await shot(page,'shared-paused-landscape.png');await page.setViewportSize({width:390,height:844});await page.locator('#resume-button').tap();
    }
  }
  const t=await page.evaluate(()=>({...window.__INPUT_TIMES__}));await waitUntil(page,t.last+280);await page.locator('#drop-button').tap();
  await page.waitForFunction(()=>document.documentElement.dataset.view==='result');assert.equal(await page.locator('#result-floors').textContent(),String(floors));
  await page.waitForTimeout(160);assert.equal(await page.locator('html').getAttribute('data-view'),'result','The final touch must not activate a newly visible replay button');
  assert.ok((await page.evaluate(()=>window.__INPUT_TIMES__.trusted)).every(Boolean));
}
async function submit(name){
  await page.locator('#signature').fill(name);
  const responded=page.waitForResponse(r=>r.url().includes('/submit')&&r.request().method()==='POST');
  await page.locator('#submit-button').tap();const response=await responded;assert.equal(response.status(),200);
  const input=response.request().postDataJSON(),value=await response.json();
  const expected=replayTrace(OFFICIAL_RULES,input.trace,value.receipt.runId);
  assert.equal(value.receipt.floors,expected.tower.layers.length);
  const own=value.snapshot.buildings.find(b=>b.bestRunId===value.receipt.runId);
  if(own)assert.deepEqual(own.tower,expected.tower);
  await page.waitForFunction(()=>document.documentElement.dataset.view==='city');return value;
}
try{
  await screen.goto(url('city'),{waitUntil:'networkidle'});await settle(screen);
  await page.goto(url(),{waitUntil:'networkidle'});await settle(page);
  await page.route('**/api/city?**',async route=>{const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,250));await route.fulfill({response});});
  await page.locator('#overview-button').tap();await page.locator('#home-button').tap();await page.waitForTimeout(400);
  assert.equal(await page.locator('html').getAttribute('data-view'),'intro');await page.unroute('**/api/city?**');
  record('late city response cannot navigate after returning home');
  const session=await page.evaluate(()=>fetch('/api/session?city=test').then(r=>r.json()));
  const ownId=session.playerId;
  await build(12,true);await shot(page,'shared-first-result.png');const started=Date.now(),first=await submit('测试手机作品');
  assert.equal(first.receipt.kind,'first');const original=first.snapshot.buildings.find(b=>b.playerId===ownId);
  assert.equal(original.color,session.color);await screen.waitForFunction(()=>document.querySelector('#city-ranking')?.textContent.includes('测试手机作品'),undefined,{timeout:6000});report.propagationMs.push(Date.now()-started);
  await shot(page,'shared-first-city-phone.png');await shot(screen,'shared-first-city-desktop.png');
  record('trusted touch, pause/rotation, first entry and independent observer polling',{floors:12,propagationMs:report.propagationMs.at(-1),color:original.color});
  await build(9);const lower=await submit('修改名不变');assert.equal(lower.receipt.kind,'unchanged');assert.deepEqual(lower.snapshot.buildings.find(b=>b.playerId===ownId),original);record('lower score leaves complete stable building unchanged',{floors:9});
  await build(16);await shot(page,'shared-best-result.png');const best=await submit('新最佳名字');assert.equal(best.receipt.kind,'best');const taller=best.snapshot.buildings.find(b=>b.playerId===ownId);
  for(const k of ['playerId','plotId','color','name'])assert.equal(taller[k],original[k]);assert.equal(taller.tower.layers.length,16);record('new best replaces complete canonical model on same plot',{floors:16});
  await page.reload({waitUntil:'networkidle'});await settle(page);const same=await page.evaluate(()=>fetch('/api/session?city=test').then(r=>r.json()));assert.equal(same.playerId,ownId);assert.deepEqual(same.snapshot.buildings.find(b=>b.playerId===ownId),taller);record('reload preserves browser identity and whole best');
  await build(3);await page.locator('#signature').fill('重试名字');let committed;
  expectFailure=true;
  await page.route('**/api/runs/*/submit',async route=>{const upstream=await route.fetch();assert.equal(upstream.status(),200);committed=await upstream.json();await route.abort('failed');});
  await page.locator('#submit-button').tap();await page.waitForFunction(()=>document.querySelector('#submit-note')?.textContent.includes('可重试'));assert.equal(await page.locator('html').getAttribute('data-view'),'result');
  await page.unroute('**/api/runs/*/submit');expectFailure=false;
  const responsePromise=page.waitForResponse(r=>r.url().includes('/submit'));await page.locator('#submit-button').tap();const retried=await(await responsePromise).json();assert.equal(retried.duplicate,true);assert.equal(retried.snapshot.revision,committed.snapshot.revision);
  await page.waitForFunction(()=>document.documentElement.dataset.view==='city');assert.equal(await page.locator('#city-event').getAttribute('data-kind'),'duplicate');record('lost success response leaves result and retries same run without growth');
  const cookies=await phone.cookies(),credential=cookies.find(c=>c.name==='skyline_player');assert.ok(credential?.httpOnly);assert.equal(credential.sameSite,'Lax');if(base.startsWith('https:'))assert.equal(credential.secure,true);
  report.cookieProperties={httpOnly:credential.httpOnly,secure:credential.secure,sameSite:credential.sameSite,path:credential.path};
  if(process.env.SKYLINE_PRODUCTION==='1')assert.equal(await page.evaluate(()=>typeof window.__SKYLINE_QA__),'undefined');
  record('cookie properties and production QA boundary',report.cookieProperties);
  await shot(page,'shared-final-city.png');report.playerId=ownId;report.best=taller;report.passed=report.errors.length===0;
  assert.equal(report.passed,true,JSON.stringify(report.errors));
}catch(error){report.failure=String(error);console.error(String(error));process.exitCode=1;}
finally{
  await phone.close();await desktop.close();await browser.close();await observerBrowser.close();
  await writeFile(path.join(root,'shared-browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,errors:report.errors,scope:report.scope,evidenceDir:root}));
}
