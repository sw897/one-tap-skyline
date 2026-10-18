import '../src/style.css';
import {mountSkyline} from '../src/main.ts';
import {loadRuntimeConfig} from '../src/config.ts';
import {applyBranding} from '../src/ui/branding.ts';
const root=document.querySelector<HTMLElement>('#app')!;
mountSkyline(root).catch(async()=>{
  if(root.querySelector('.compatibility-message'))return;
  root.innerHTML='<main class="compatibility-message"><h1>暂时无法打开城市</h1><p>请刷新重试。</p></main>';
  applyBranding(root,await loadRuntimeConfig());
});
