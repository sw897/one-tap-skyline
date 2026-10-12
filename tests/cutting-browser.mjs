import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const repo=process.cwd(),baseURL=process.env.SKYLINE_BASE_URL||'http://127.0.0.1:5173/';
const out=path.resolve(process.env.SKYLINE_EVIDENCE_DIR||path.join(os.tmpdir(),'skyline-cutting-evidence',new Date().toISOString().replaceAll(':','-')));
if(out===repo||out.startsWith(repo+path.sep))throw new Error('Raw evidence must be outside source repository');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:process.env.SKYLINE_BROWSER_CHANNEL||'chrome',headless:true});
const report={timestamp:new Date().toISOString(),scope:'Actual trusted browser touch input, both modes, unmodified 60-second defaults; Chrome phone-size emulation, not iPhone hardware',baseURL,browser:browser.version(),physicalPhone:'not executed; awaits user',android:'not scheduled; unverified',checks:[],cases:[],errors:[],passed:false};
const contexts=[],snap=page=>page.evaluate(()=>window.__SKYLINE_QA__.snapshot());
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const check=(name,data={})=>{report.checks.push({name,passed:true,...data});console.log('PASS '+name);};
let active;
try{
 for(const mode of ['single-x','alternate-xz']){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,recordVideo:{dir:out+'/videos',size:{width:390,height:844}}});contexts.push(context);
  const page=await context.newPage();active=page;page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(new URL(`?qa=1&cut=${mode}`,baseURL).href,{waitUntil:'networkidle'});
  const initial=await snap(page);assert.equal(initial.config.game.cutMode,mode);assert.equal(initial.config.game.roundSeconds,60);assert.equal(initial.config.game.baseSpeed,2.7);assert.equal(initial.config.game.perfectRatio,0.035);
  await page.locator('#start-button').tap();
  const drop=await page.locator('#drop-button').boundingBox(),pause=await page.locator('#pause-button').boundingBox();
  const cuts=[];
  for(let n=1;n<=4;n++){
   await page.waitForFunction(()=>{
    const g=window.__SKYLINE_QA__.snapshot().game,t=g.tower.layers.at(-1)||{x:0,z:0,width:g.tower.baseWidth,depth:g.tower.depth};
    const fraction=Math.abs(g.movingPosition-t[g.activeAxis])/(g.activeAxis==='x'?t.width:t.depth);
    return g.phase==='moving'&&fraction>0.24&&fraction<0.32;
   },null,{polling:'raf',timeout:12000});
   const before=await snap(page);await page.touchscreen.tap(drop.x+drop.width/2,drop.y+drop.height/2);
   await page.waitForFunction(n=>window.__SKYLINE_QA__.snapshot().game.tower.layers.length===n,n,{polling:'raf',timeout:3000});
   const after=await snap(page),layer=after.game.tower.layers.at(-1),previous=before.game.tower.layers.at(-1)||{x:0,z:0,width:2.8,depth:2.2},f=after.cutting.fragment;
   assert.ok(f,'Actual trim fragment missing');assert.equal(f.axis,before.game.activeAxis);assert.equal(f.color,before.cutting.moving.color);
   close(layer.width*layer.depth+f.scale[0]*f.scale[2],previous.width*previous.depth);
   if(f.axis==='x'){close(layer.z,previous.z);close(layer.depth,previous.depth);}else{close(layer.x,previous.x);close(layer.width,previous.width);}
   assert.equal(after.cutting.cutGlow.visible,true);
   cuts.push({axis:f.axis,previous,kept:layer,fragment:f,glow:after.cutting.cutGlow});
   if(n<=2)await page.screenshot({path:`${out}/${mode}-cut-${n}.png`});
   if(n===2){
    await page.touchscreen.tap(pause.x+pause.width/2,pause.y+pause.height/2);const held=await snap(page);
    await page.waitForTimeout(650);const still=await snap(page);assert.equal(still.game.elapsed,held.game.elapsed);
    assert.deepEqual(still.cutting.fragment,held.cutting.fragment);assert.deepEqual(still.cutting.cutGlow,held.cutting.cutGlow);
    await page.setViewportSize({width:844,height:390});await page.waitForTimeout(200);
    assert.equal(await page.locator('#move-direction').isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`${out}/${mode}-landscape.png`});await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);await page.locator('#resume-button').tap();
   }
  }
  assert.deepEqual(cuts.map(c=>c.axis),mode==='single-x'?['x','x','x','x']:['x','z','x','z']);
  const final=await snap(page),top=final.game.tower.layers.at(-1);
  if(mode==='single-x'){assert.equal(top.z,0);assert.equal(top.depth,2.2);}else{assert.ok(top.depth<2.2);assert.ok(top.width<2.8);}
  await page.waitForFunction(()=>{const g=window.__SKYLINE_QA__.snapshot().game,t=g.tower.layers.at(-1);return g.phase==='moving'&&Math.abs(g.movingPosition-t[g.activeAxis])>(g.activeAxis==='x'?t.width:t.depth)+0.2;},null,{polling:'raf',timeout:12000});
  const canvas=await page.locator('#viewport canvas').boundingBox();await page.touchscreen.tap(canvas.x+canvas.width/2,canvas.y+canvas.height/2);
  await page.locator('[data-screen=result]').waitFor({state:'visible'});await page.waitForTimeout(1300);const result=await snap(page);
  assert.deepEqual(result.completed.tower,final.game.tower);await page.screenshot({path:`${out}/${mode}-result.png`});
  await page.locator('#skip-sticker').tap();await page.locator('#submit-button').tap();await page.waitForTimeout(1900);const city=await snap(page);
  assert.deepEqual(city.own.tower,result.completed.tower);close(city.rendered.displayedHeight,city.rendered.logicalHeight);await page.screenshot({path:`${out}/${mode}-city.png`});
  report.cases.push({mode,config:initial.config,cuts,completed:result.completed,city:city.own,rendered:city.rendered});
  check(`${mode}: real cuts, matching fragment color/area, pause, visible orientation cue, result and city model`,{floors:4});
  const video=page.video();await context.close();contexts.splice(contexts.indexOf(context),1);if(video)await copyFile(await video.path(),`${out}/${mode}.webm`);
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.failure=e.stack||String(e);console.error(report.failure);if(active){await active.screenshot({path:out+'/failure-state.png'}).catch(()=>{});report.failureSnapshot=await snap(active).catch(()=>null);}process.exitCode=1;}
finally{for(const c of contexts)await c.close();await browser.close();await writeFile(out+'/cutting-browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,errors:report.errors.length,evidence:out}));}
