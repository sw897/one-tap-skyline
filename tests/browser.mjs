import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const base=new URL(process.env.SKYLINE_BASE_URL??'http://127.0.0.1:5173/');
if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw Error('Local smoke checks only');
const out=path.resolve(process.env.SKYLINE_EVIDENCE_DIR??path.join(os.tmpdir(),'skyline-browser-'+Date.now()));
const repo=process.cwd();if(out===repo||out.startsWith(repo+path.sep))throw Error('Evidence must be outside the checkout');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.SKYLINE_BROWSER_CHANNEL?{channel:process.env.SKYLINE_BROWSER_CHANNEL}:{})});
const checks=[],errors=[];
try{
  const desktop=await browser.newPage({viewport:{width:1920,height:1080}});
  desktop.on('pageerror',error=>errors.push(error.message));
  await desktop.goto(new URL('?mode=display&view=city&demo=full',base).href,{waitUntil:'networkidle'});
  await desktop.locator('#data-badge').waitFor({state:'visible'});
  assert.match(await desktop.locator('#data-badge').innerText(),/模拟/);
  assert.match(await desktop.locator('#city-count').innerText(),/^76 \/ 76/);
  assert.equal(await desktop.locator('.city-qr').isVisible(),false);
  await desktop.screenshot({path:path.join(out,'city-simulated.png')});checks.push('full simulated city and disclosure');
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const phone=await context.newPage();phone.on('pageerror',error=>errors.push(error.message));
  await phone.goto(new URL('?mode=practice&qa=1',base).href,{waitUntil:'networkidle'});
  await phone.waitForFunction(()=>!!window.__SKYLINE_QA__);
  await phone.locator('#start-button').tap();
  await phone.waitForFunction(()=>{const g=window.__SKYLINE_QA__.snapshot().game;return g?.phase==='moving'&&Math.abs(g.movingPosition)<.025;},null,{polling:'raf'});
  const button=await phone.locator('#drop-button').boundingBox();await phone.touchscreen.tap(button.x+button.width/2,button.y+button.height/2);
  await phone.waitForFunction(()=>window.__SKYLINE_QA__.snapshot().game.tower.layers.length===1);
  await phone.waitForTimeout(350);await phone.screenshot({path:path.join(out,'phone-simulated.png')});checks.push('trusted touch input places a real simulated floor');
  assert.deepEqual(errors,[]);
  await writeFile(path.join(out,'report.json'),JSON.stringify({pass:true,checks,errors,physicalPhone:'not used'},null,2));
  console.log(JSON.stringify({pass:true,checks,evidence:out}));
}finally{await browser.close();}
