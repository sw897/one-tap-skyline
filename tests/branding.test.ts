import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {request} from 'node:http';
import jpeg from 'jpeg-js';
import {parseRuntimeConfig} from '../src/config.ts';
import {loadNodeTheme,renderNodeHtml} from '../src/node/theme.ts';
import {createGameServer} from '../src/node/runtime.ts';
import {handleApi} from '../src/server/service.ts';
import {nextShanghaiMidnight} from '../src/core/photo.ts';
import {randomId} from '../src/server/policy.ts';
import {makeTrace} from './run-fixtures.ts';

const theme={title:'一指盖楼：共建示例城',activityLabel:'示例培训',headline:'每一次尝试，成就共同的高度。',pavilionName:'示例培训中心',accent:'#f2c230'};
const html='<!doctype html><html><head><title>一指盖楼：城市天际线</title><meta name="theme-color" content="#d8effb"></head><body><div id="app"></div></body></html>';
async function fixture(){
  const base=path.resolve(process.env.SKYLINE_NODE_TEST_ROOT??path.join(os.tmpdir(),'skyline-theme-tests'));
  if(base===process.cwd()||base.startsWith(process.cwd()+path.sep))throw Error('private_test_root_required');
  await mkdir(base,{recursive:true});const root=await mkdtemp(path.join(base,'theme-'));
  const themeDir=path.join(root,'private-theme'),web=path.join(root,'web'),data=path.join(root,'game-data');
  await mkdir(themeDir);await mkdir(web);await writeFile(path.join(web,'index.html'),html);
  const file=path.join(themeDir,'theme.json');await writeFile(file,JSON.stringify(theme));
  const env:Record<string,string|undefined>={GAME_ID:'skyline',SKYLINE_THEME_FILE:file,CITY_DISPLAY_NAME:'示例城市',SKYLINE_PUBLIC_WRITE_OPEN:'1',SKYLINE_PUBLIC_PHOTOS_OPEN:'1'};
  let now=Date.parse('2030-10-01T02:00:00Z');
  const options={origin:'https://game.example.com',dataRoot:data,webRoot:web,migrations:path.resolve('drizzle'),env,now:()=>now,timers:false,log:()=>{}};
  return {root,themeDir,web,data,file,env,options,now:()=>now,setNow:(value:number)=>now=value};
}
function get(url:string,method='GET'):Promise<Response>{
  return new Promise((resolve,reject)=>{
    const req=request(url,{method,headers:{Host:'game.example.com'}},res=>{
      const chunks:Buffer[]=[];res.on('data',chunk=>chunks.push(chunk));
      res.on('end',()=>resolve(new Response(method==='HEAD'?null:Buffer.concat(chunks),{status:res.statusCode,headers:res.headers as Record<string,string>})));
    });req.on('error',reject);req.end();
  });
}

test('neutral defaults remain neutral and branding projection discards unknown fields and external logo URLs',()=>{
  const neutral=parseRuntimeConfig(null);assert.equal(neutral.cityDisplayName,'城市天际线');assert.equal(neutral.branding.enabled,false);
  const config=parseRuntimeConfig({cityDisplayName:'示例城市',branding:{...theme,enabled:true,logoUrl:'https://external.example/logo.png',secret:'not-public'}});
  assert.equal(config.branding.logoUrl,null);assert.equal('secret' in config.branding,false);
  assert.deepEqual(config.game,neutral.game);assert.deepEqual(config.city,neutral.city);
});

test('explicit invalid theme fails before creating or maintaining game data; no configured theme uses defaults',async()=>{
  const f=await fixture();
  for(const [value,expected] of [[{...theme,title:''},'theme_field_invalid:title'],[{...theme,accent:'red;display:none'},'theme_field_invalid:accent'],[{...theme,logoFile:'../private.json'},'theme_logo_path_invalid'],[{...theme,headline:'<img src=x>'},'theme_field_invalid:headline']] as const){
    await writeFile(f.file,JSON.stringify(value));await assert.rejects(createGameServer(f.options),new RegExp(expected));
    await assert.rejects(stat(f.data),{code:'ENOENT'});
  }
  await writeFile(f.file,'{broken');await assert.rejects(createGameServer(f.options),/theme_file_invalid/);
  f.env.SKYLINE_THEME_FILE=path.join(f.root,'missing.json');await assert.rejects(createGameServer(f.options),/theme_file_invalid/);
  f.env.SKYLINE_THEME_FILE=f.file;await writeFile(f.file,JSON.stringify(theme));f.env.CITY_DISPLAY_NAME='';await assert.rejects(createGameServer(f.options),/theme_city_name_invalid/);
  const neutral=await loadNodeTheme({},()=>{});assert.equal(neutral.config.branding.enabled,false);assert.equal(neutral.logo,null);
});

test('city name comes only from its environment and private-only fields never enter rendered HTML or JSON',async()=>{
  const f=await fixture();await writeFile(f.file,JSON.stringify({...theme,cityDisplayName:'ignored private city',privateNote:'private-marker',logoFile:'logo.png'}));
  const events:unknown[]=[];const loaded=await loadNodeTheme(f.env,event=>events.push(event));
  assert.equal(loaded.config.cityDisplayName,'示例城市');assert.equal(loaded.config.branding.logoUrl,null);
  assert.deepEqual(events,[{event:'theme_logo_unavailable'}]);
  assert.doesNotMatch(JSON.stringify(loaded.config),/private-marker|ignored private city|logoFile|SKYLINE_THEME_FILE/);
  const config=parseRuntimeConfig({...loaded.config,branding:{...loaded.config.branding,title:'一指盖楼：测试 $& "示例"'}});
  const output=renderNodeHtml(html,config);
  assert.ok(output.includes('<title>一指盖楼：测试 $&amp; &quot;示例&quot;</title>'));
  assert.match(output,/id="skyline-runtime" type="application\/json"/);
  const bootstrap=JSON.parse(output.match(/type="application\/json">(.*?)<\/script>/)![1]);
  assert.equal(bootstrap.branding.title,config.branding.title);assert.doesNotMatch(output,/private-marker/);
});

test('HTTP exposes a no-store public projection and the selected logo only; midnight leaves private theme assets intact',async()=>{
  const f=await fixture(),image=jpeg.encode({data:Buffer.alloc(8*8*4,255),width:8,height:8},60).data;
  await writeFile(path.join(f.themeDir,'logo.jpg'),image);await writeFile(f.file,JSON.stringify({...theme,logoFile:'logo.jpg',privateNote:'never-serve-me'}));
  const runtime=await createGameServer(f.options);
  try{
    await new Promise<void>(resolve=>runtime.server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+(runtime.server.address() as {port:number}).port;
    const home=await get(base+'/skyline/');assert.equal(home.status,200);assert.equal(home.headers.get('Cache-Control'),'no-store');assert.match(await home.text(),new RegExp(theme.title));
    const config=await get(base+'/skyline/runtime-config.json');assert.equal(config.headers.get('Cache-Control'),'no-store');const publicConfig=await config.json();assert.equal(publicConfig.branding.logoUrl,'/skyline/theme/logo');assert.doesNotMatch(JSON.stringify(publicConfig),/never-serve-me|private-theme|logoFile/);
    const logo=await get(base+'/skyline/theme/logo');assert.equal(logo.headers.get('Content-Type'),'image/jpeg');assert.equal(logo.headers.get('Cache-Control'),'no-store');assert.deepEqual(Buffer.from(await logo.arrayBuffer()),image);
    assert.equal((await get(base+'/skyline/theme/logo','HEAD')).status,200);assert.equal((await get(base+'/skyline/theme/logo','POST')).status,405);
    for(const route of ['/theme/','/theme/theme.json','/theme/logo.jpg','/private-theme/theme.json'])assert.equal((await get(base+'/skyline'+route)).status,404);
    f.setNow(nextShanghaiMidnight(f.now())+1);await runtime.maintain();assert.equal((await get(base+'/skyline/theme/logo')).status,200);assert.deepEqual(await readFile(path.join(f.themeDir,'logo.jpg')),image);assert.equal(JSON.parse(await readFile(f.file,'utf8')).title,theme.title);
  }finally{await runtime.close();}
});

test('same-day theme restart retains works and current entry; normal midnight still clears works and rotates entry',async()=>{
  const f=await fixture();let runtime=await createGameServer(f.options);
  const call=async(route:string,body?:unknown,cookie?:string)=>{
    const response=await handleApi(new Request(f.options.origin+route,{method:body===undefined?'GET':'POST',headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{Origin:f.options.origin,'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}),runtime.context);
    return {response,status:response.status,body:await response.json() as any};
  };
  try{
    const entry=(await call('/api/game/entry')).body.entry;
    assert.equal((await call('/api/session?scope=own')).status,403);
    const session=await call('/api/session?scope=own&entry='+entry);assert.equal(session.status,200);
    const cookie=session.response.headers.get('Set-Cookie')!.split(';')[0];
    const started=await call('/api/runs?entry='+entry,{city:'public',startKey:randomId()},cookie);assert.equal(started.status,200);
    const trace=makeTrace(4).trace;f.setNow(f.now()+Math.ceil(trace.endUs/1000)+1);
    assert.equal((await call('/api/runs/'+started.body.runId+'/submit',{name:'模拟作品',trace},cookie)).status,200);
    await runtime.close();await writeFile(f.file,JSON.stringify({...theme,title:'一指盖楼：新版示例城'}));f.env.CITY_DISPLAY_NAME='新版示例城市';runtime=await createGameServer(f.options);
    const again=await call('/api/session?scope=own&entry='+entry,undefined,cookie);assert.equal(again.status,200);assert.equal(again.body.snapshot.name,'新版示例城市');assert.equal(again.body.snapshot.buildings[0].tower.layers.length,4);assert.equal((await call('/api/game/entry')).body.entry,entry);
    f.setNow(nextShanghaiMidnight(f.now())+1);await runtime.maintain();const next=(await call('/api/game/entry')).body.entry;assert.notEqual(next,entry);assert.equal((await call('/api/session?scope=own&entry='+entry,undefined,cookie)).status,403);assert.equal(runtime.database.connection.prepare('SELECT COUNT(*) n FROM buildings').get()!.n,0);
  }finally{await runtime.close();}
});
