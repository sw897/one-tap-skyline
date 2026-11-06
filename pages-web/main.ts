import './style.css';
import {demoView,demoSearch,isDemoReadRequest,watchDemoDay} from './demo-state.ts';

declare const __PAGES_DEMO_RELEASE__:string;

const view=demoView(location.search),url=new URL(location.href);
url.search=demoSearch(view);url.hash='';
if(url.href!==location.href)history.replaceState(null,'',url);
document.documentElement.dataset.pagesView=view==='landing'?'landing':'game';
document.querySelector('#demo-version')!.textContent=__PAGES_DEMO_RELEASE__;
let disposeGame:(()=>void)|undefined;
watchDemoDay(()=>{disposeGame?.();location.reload();});

if(view!=='landing')void openDemo();

async function openDemo(){
  const root=document.querySelector<HTMLElement>('#app')!;
  document.querySelector<HTMLElement>('#pages-landing')!.hidden=true;
  document.querySelector<HTMLElement>('#demo-notice')!.hidden=false;root.hidden=false;
  document.title=view==='city'?'城市天际线 · 公开模拟大屏':'一指盖楼 · 单机模拟试玩';

  // This target can read its static files and has no backend.
  // Blocking other fetches also contains the shared app's midnight API attempt.
  const configUrl=new URL('runtime-config.json',location.href).href,nativeFetch=window.fetch.bind(window);
  window.fetch=(input,init)=>{
    const requested=input instanceof Request?input.url:new URL(String(input),location.href).href;
    const method=init?.method??(input instanceof Request?input.method:'GET');
    return isDemoReadRequest(requested,configUrl,method)?nativeFetch(input,init):Promise.reject(new Error('Static simulation has no backend'));
  };
  try{
    const [,module]=await Promise.all([import('../src/style.css'),import('../src/main.ts')]);
    disposeGame=await module.mountSkyline(root);
    const photoInput=root.querySelector<HTMLInputElement>('#photo-file');if(photoInput)photoInput.disabled=true;
  }catch{
    disposeGame?.();
    if(!root.querySelector('.compatibility-message'))root.innerHTML='<main class="compatibility-message"><h1>暂时无法打开模拟试玩</h1><p>请刷新重试，或使用支持 WebGL2 的新版浏览器。</p><a href="./">返回体验说明</a></main>';
  }
}
