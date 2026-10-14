import '../src/style.css';
import {mountSkyline} from '../src/main.ts';
mountSkyline(document.querySelector<HTMLElement>('#app')!).catch(()=>{
  document.querySelector<HTMLElement>('#app')!.textContent='暂时无法打开城市，请刷新重试。';
});
