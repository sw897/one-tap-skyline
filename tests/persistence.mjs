import assert from 'node:assert/strict';
import { writeFile,mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import {makeTrace} from './run-fixtures.ts';

const beforeBase=process.env.SKYLINE_BASE_URL??'http://127.0.0.1:5173/',afterBase=process.env.SKYLINE_RESTART_URL??'http://127.0.0.1:5174/';
const root=path.resolve(process.env.SKYLINE_EVIDENCE_DIR);if(root===process.cwd()||root.startsWith(process.cwd()+path.sep))throw new Error('Private evidence required');await mkdir(root,{recursive:true});
let cookie;
async function call(base,url,body){
  const response=await fetch(new URL(url,base),{method:body===undefined?'GET':'POST',headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{Origin:new URL(base).origin,'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.equal(response.status,200);cookie??=response.headers.get('set-cookie')?.split(';')[0];return response.json();
}
const before=await call(beforeBase,'/api/session?city=test');
const original=before.snapshot;
console.log('Ready for controlled service stop/restart; anonymous cookie held in process memory only.');
const input=createInterface({input:process.stdin});await new Promise(resolve=>input.once('line',resolve));input.close();
const after=await call(afterBase,'/api/session?city=test');assert.equal(after.playerId,before.playerId);assert.deepEqual(after.snapshot,original);
await writeFile(path.join(root,'service-restart-report.json'),JSON.stringify({passed:true,timestamp:new Date().toISOString(),scope:'Local Vinext dev stopped, compiled production Worker started against the same actual local D1 state',beforeBase,afterBase,playerId:after.playerId,epoch:after.snapshot.epoch,revision:after.snapshot.revision,buildings:after.snapshot.buildings.length,identityPreserved:true,wholeSnapshotPreserved:true},null,2));
console.log('PASS same anonymous identity and complete city survive service stop/restart');
