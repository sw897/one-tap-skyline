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
    if(view==='city'){
      const {default:QRCode}=await import('qrcode');
      const preview=new URL('?mode=practice',location.href).href;
      const project='https://github.com/sw897/one-tap-skyline';
      const makeLink=(href:string,label:string)=>{
        const link=document.createElement('a');link.href=href;link.textContent=label;
        link.target='_blank';link.rel='noopener noreferrer';return link;
      };
      const qrOptions={width:240,margin:4,errorCorrectionLevel:'M' as const,color:{dark:'#244659',light:'#ffffff'}};
      const playQR=root.querySelector<HTMLCanvasElement>('#entry-qr');
      const playCard=root.querySelector<HTMLElement>('.city-qr');
      if(playQR&&playCard){
        await QRCode.toCanvas(playQR,preview,qrOptions);
        playQR.hidden=false;playCard.hidden=false;playCard.classList.add('demo-play-qr');
        playCard.querySelector('strong')!.textContent='手机模拟试玩';
        const note=playCard.querySelector<HTMLElement>('#qr-note')!;
        note.textContent='单机体验 · 不同步本大屏';
        const entry=playCard.querySelector<HTMLAnchorElement>('#entry-link')!;
        entry.href=preview;entry.textContent='打开模拟试玩 ↗';entry.hidden=false;
      }
      const disclosure=root.querySelector<HTMLElement>('#city-disclosure');
      if(disclosure){
        disclosure.classList.add('demo-promotion');
        const caption=document.createElement('span');caption.textContent='查看源码 · 欢迎 Star';
        const qr=document.createElement('canvas');qr.id='project-qr';qr.setAttribute('aria-label','GitHub 开源项目二维码');
        await QRCode.toCanvas(qr,project,qrOptions);
        disclosure.replaceChildren(caption,qr,makeLink(project,'GitHub · One-Tap Skyline ↗'));
      }
    }
  }catch{
    disposeGame?.();
    if(!root.querySelector('.compatibility-message'))root.innerHTML='<main class="compatibility-message"><h1>暂时无法打开模拟试玩</h1><p>请刷新重试，或使用支持 WebGL2 的新版浏览器。</p><a href="./">返回体验说明</a></main>';
  }
}
