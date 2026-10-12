import assert from 'node:assert/strict';
import { writeFile,mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import {makeTrace} from './run-fixtures.ts';
import {chromium} from 'playwright';

const beforeBase=process.env.SKYLINE_BASE_URL??'http://127.0.0.1:5173/',afterBase=process.env.SKYLINE_RESTART_URL??'http://127.0.0.1:5174/';
const root=path.resolve(process.env.SKYLINE_EVIDENCE_DIR);if(root===process.cwd()||root.startsWith(process.cwd()+path.sep))throw new Error('Private evidence required');await mkdir(root,{recursive:true});
let cookie;
const browserTransport=process.env.SKYLINE_PERSISTENCE_TRANSPORT==='browser';let browser,context,page;
if(browserTransport){browser=await chromium.launch({headless:true,channel:'chrome'});context=await browser.newContext();page=await context.newPage();await page.goto(new URL('/favicon.svg',beforeBase).href);}
async function call(base,url,body){
  if(browserTransport){const reply=await page.evaluate(async({url,body})=>{const r=await fetch(url,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};},{url:new URL(url,base).href,body});assert.equal(reply.status,200);return reply.body;}
  const response=await fetch(new URL(url,base),{method:body===undefined?'GET':'POST',headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{Origin:new URL(base).origin,'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.equal(response.status,200);cookie??=response.headers.get('set-cookie')?.split(';')[0];return response.json();
}
const before=await call(beforeBase,'/api/session?city=test');
const original=before.snapshot;
console.log('Ready for controlled service stop/restart; anonymous cookie held in process memory only.');
const input=createInterface({input:process.stdin});await new Promise(resolve=>input.once('line',resolve));input.close();
const after=await call(afterBase,'/api/session?city=test');assert.equal(after.playerId,before.playerId);assert.deepEqual(after.snapshot,original);
await writeFile(path.join(root,'service-restart-report.json'),JSON.stringify({passed:true,timestamp:new Date().toISOString(),scope:browserTransport?'Real anonymous Chrome, same saved Sites Worker redeployed with the same hosted D1':'Local Vinext dev stopped, compiled production Worker started against the same actual local D1 state',beforeBase,afterBase,playerId:after.playerId,epoch:after.snapshot.epoch,revision:after.snapshot.revision,buildings:after.snapshot.buildings.length,identityPreserved:true,wholeSnapshotPreserved:true,ownBuilding:Boolean(after.snapshot.buildings.find(b=>b.playerId===after.playerId))},null,2));
console.log('PASS same anonymous identity and complete city survive service stop/restart');
await context?.close();await browser?.close();
