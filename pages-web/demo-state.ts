import {shanghaiMidnight} from '../src/core/photo.ts';

export type DemoView='landing'|'play'|'city';

export function demoView(search:string):DemoView{
  const query=new URLSearchParams(search),keys=[...query.keys()];
  if(new Set(keys).size!==keys.length)return 'landing';
  if(query.get('mode')==='practice')return 'play';
  return query.get('mode')==='display'&&query.get('demo')==='full'?'city':'landing';
}
export const demoSearch=(view:DemoView)=>view==='play'?'?mode=practice':view==='city'?'?mode=display&view=city&demo=full':'';

export function demoBasePath(value:string){
  const base=value===''||value==='/'?'/':'/'+value.replace(/^\/+|\/+$/g,'')+'/';
  if(!/^\/(?:[a-z][a-z0-9-]{0,31}\/)?$/.test(base))throw Error('Invalid Pages project path');
  return base;
}

export function isDemoReadRequest(requestUrl:string,configUrl:string,method='GET'){
  if(method.toUpperCase()!=='GET')return false;
  const request=new URL(requestUrl),config=new URL(configUrl);
  if(request.href===config.href)return true;
  const assets=new URL('assets/',config);
  return request.origin===assets.origin&&request.pathname.startsWith(assets.pathname)&&!request.search&&!request.hash;
}

/** Device-clock day checks; no server, stored scores or scheduled Actions task. */
export function watchDemoDay(reset:()=>void,options:{now?:()=>number;poll?:(check:()=>void)=>()=>void;wakeTargets?:EventTarget[]}={}){
  const now=options.now??Date.now,day=shanghaiMidnight(now());let resetStarted=false,stopped=false;
  const check=()=>{if(!stopped&&!resetStarted&&shanghaiMidnight(now())!==day){resetStarted=true;reset();}};
  const poll=options.poll??((callback:()=>void)=>{const timer=globalThis.setInterval(callback,250);return()=>globalThis.clearInterval(timer);});
  const stopPoll=poll(check),targets=options.wakeTargets??[document,window];
  for(const target of targets)for(const name of ['visibilitychange','focus','pageshow'])target.addEventListener(name,check);
  return()=>{if(stopped)return;stopped=true;stopPoll();for(const target of targets)for(const name of ['visibilitychange','focus','pageshow'])target.removeEventListener(name,check);};
}
