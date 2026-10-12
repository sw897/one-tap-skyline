import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const base=process.env.SKYLINE_BASE_URL,root=path.resolve(process.env.SKYLINE_EVIDENCE_DIR);
if(!base||root===process.cwd()||root.startsWith(process.cwd()+path.sep))throw new Error('Hosted URL and private evidence required');await mkdir(root,{recursive:true});
const artifact=JSON.parse(await readFile(process.env.SKYLINE_ARTIFACT_AUDIT,'utf8')),files=new Map(artifact.files.map(f=>['/'+f.name.replace(/^\.?\/?dist\/client\//,''),f]));
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext(),page=await context.newPage();const tasks=[],checked=[];
page.on('response',response=>{const url=new URL(response.url());if(url.origin===new URL(base).origin&&/\.(js|css)$/.test(url.pathname)&&files.has(url.pathname)){tasks.push((async()=>{const body=await response.body(),sha=createHash('sha256').update(body).digest('hex'),expected=files.get(url.pathname).sha256;assert.equal(response.status(),200);assert.equal(sha,expected);checked.push({path:url.pathname,status:response.status(),sha256:sha});})());}});
try{
  await page.goto(new URL('/?mode=shared&view=city',base).href,{waitUntil:'networkidle'});await page.waitForSelector('#city-count');
  const publicSnapshot=await page.evaluate(()=>fetch('/api/city?city=public').then(r=>r.json()));
  let publicWriteVerification;
  if(process.env.SKYLINE_VERIFY_PUBLIC_WRITE==='1'){
    assert.equal(publicSnapshot.writeOpen,true);
    publicWriteVerification=await page.evaluate(async()=>{const start=await fetch('/api/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({city:'public',startKey:crypto.randomUUID()})});const run=await start.json();if(!start.ok)return {startStatus:start.status};const cancelled=await fetch('/api/runs/'+run.runId+'/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});return {startStatus:start.status,cancelStatus:cancelled.status,cancelled:(await cancelled.json()).cancelled};});
    assert.equal(publicWriteVerification.startStatus,200);assert.equal(publicWriteVerification.cancelStatus,200);assert.equal(publicWriteVerification.cancelled,true);
  }
  await Promise.all(tasks);assert.ok(checked.some(f=>f.path.endsWith('.js')));assert.ok(checked.some(f=>f.path.endsWith('.css')));
  const report={passed:true,timestamp:new Date().toISOString(),scope:'Fresh anonymous real Chrome; loaded JS/CSS exact SHA256 vs supported source-workflow archive',sourceCommit:artifact.sourceCommit,checked,publicWriteVerification,publicCity:{name:publicSnapshot.name,buildings:publicSnapshot.buildings.length,writeOpen:publicSnapshot.writeOpen,epoch:publicSnapshot.epoch,revision:publicSnapshot.revision},qaInterface:await page.evaluate(()=>typeof window.__SKYLINE_QA__)};
  assert.equal(report.qaInterface,'undefined');await page.screenshot({path:path.join(root,'public-city.png'),fullPage:true});await writeFile(path.join(root,'release-assets-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,assets:checked.length,publicCity:report.publicCity}));
}finally{await context.close();await browser.close();}
