import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const baseURL=process.env.SKYLINE_BASE_URL||'http://127.0.0.1:5173/';
const out=path.resolve(process.env.SKYLINE_EVIDENCE_DIR||path.join(os.tmpdir(),'skyline-visual-evidence',new Date().toISOString().replaceAll(':','-')));
const repo=process.cwd();if(out===repo||out.startsWith(repo+path.sep))throw new Error('Raw evidence must be outside repository');
await mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
const report={timestamp:new Date().toISOString(),scope:'Chrome phone-size emulation of candidate first-frame/camera/viewport; not real iPhone',checks:[],errors:[],passed:false};let context;
const sample=page=>page.evaluate(()=>new Promise(resolve=>{const frames=[],start=performance.now();const tick=()=>{const c=document.querySelector('#viewport canvas'),r=document.querySelector('#viewport').getBoundingClientRect();frames.push({ms:performance.now()-start,rect:[r.x,r.y,r.width,r.height],buffer:[c.width,c.height],opacity:getComputedStyle(c).opacity,presentation:window.__SKYLINE_QA__.snapshot().presentation});if(performance.now()-start<650)requestAnimationFrame(tick);else resolve(frames);};requestAnimationFrame(tick);}));
try{
 context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,recordVideo:{dir:out+'/videos',size:{width:390,height:844}}});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(new URL('?qa=1',baseURL).href,{waitUntil:'networkidle'});
 const initial=await page.evaluate(()=>window.__SKYLINE_QA__.snapshot().presentation);assert.equal(initial.cameraReady,true);assert.deepEqual(initial.target,initial.aim);
 report.initial=initial;
 for(let i=0;i<3;i++){
  await page.locator('#overview-button').tap();const frames=await sample(page);
  assert.equal(new Set(frames.map(f=>f.rect.join(','))).size,1);
  for(const f of frames){assert.equal(f.opacity,'1');assert.equal(f.presentation.view,'result');assert.deepEqual(f.presentation.target,f.presentation.aim);}
  report.checks.push({name:'city first frame and fixed viewport '+(i+1),passed:true,frames});await page.locator('#home-button').tap();
 }
 await page.locator('#start-button').tap();const drop=await page.locator('#drop-button').boundingBox();
 await page.waitForFunction(()=>{const g=window.__SKYLINE_QA__.snapshot().game;return g.phase==='moving'&&Math.abs(g.movingPosition)<0.04;},null,{polling:'raf',timeout:10000});
 await page.touchscreen.tap(drop.x+drop.width/2,drop.y+drop.height/2);await page.waitForFunction(()=>window.__SKYLINE_QA__.snapshot().game.tower.layers.length===1);
 await page.waitForFunction(()=>window.__SKYLINE_QA__.snapshot().game.phase==='moving');
 await page.touchscreen.tap(drop.x+drop.width/2,drop.y+drop.height/2);await page.locator('[data-screen=result]').waitFor({state:'visible'});
 const resultFrames=await sample(page);assert.equal(new Set(resultFrames.map(f=>f.rect.join(','))).size,1);assert.ok(resultFrames.every(f=>f.opacity==='1'&&f.presentation.view==='result'));
 assert.notEqual(resultFrames[0].presentation.span,resultFrames.at(-1).presentation.span);report.checks.push({name:'result camera remains animated without viewport churn',passed:true,frames:resultFrames});
 await page.setViewportSize({width:844,height:390});const rotation=await sample(page);assert.equal(new Set(rotation.map(f=>f.rect.join(','))).size,1);assert.ok(rotation.every(f=>f.opacity==='1'));report.checks.push({name:'orientation draws stable resized canvas',passed:true,frames:rotation});
 await page.screenshot({path:out+'/result-landscape.png'});const video=page.video();await context.close();context=null;await video.saveAs(out+'/visual-transitions.webm');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.failure=e.stack||String(e);console.error(report.failure);process.exitCode=1;}
finally{if(context)await context.close();await browser.close();await writeFile(out+'/visual-browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,errors:report.errors,evidence:out}));}
