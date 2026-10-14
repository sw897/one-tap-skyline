import {RELEASE_ID} from '../release.ts';
import {requestJson} from '../shared/client.ts';
import {canUpdate,type EntryInfo,type UpdateState} from '../shared/entry.ts';
/** One metadata request per minute while visible; no all-city fetch on phones. */
export class ReleaseUpdate {
 private pending?:EntryInfo;private busy?:Promise<boolean>;private disposed=false;private timer:ReturnType<typeof setInterval>;
 private abort=new AbortController();
 constructor(private root:HTMLElement,private city:string,private state:()=>UpdateState,private onEntry:(info:EntryInfo)=>void){
  this.timer=setInterval(()=>{if(!document.hidden)void this.check();},60_000);
  document.addEventListener('visibilitychange',this.resume);window.addEventListener('pageshow',this.resume);
  this.button.onclick=()=>{if(!this.pending||!canUpdate(this.state()))return;const url=new URL(location.href);url.searchParams.set('v',this.pending.releaseId);location.replace(url.href);};
 }
 private get button(){return this.root.querySelector<HTMLButtonElement>('#release-update-button')!;}
 private resume=()=>{if(!document.hidden)void this.check();};
 paint(){if(!this.pending||this.disposed)return;const safe=canUpdate(this.state());this.root.querySelector<HTMLElement>('#release-update')!.hidden=false;this.button.disabled=!safe;this.root.querySelector<HTMLElement>('#release-update-note')!.textContent=safe?'体验已更新，点击加载新版。':'体验已更新，完成本局和照片保存后可更新。';}
 check():Promise<boolean>{
  if(this.busy)return this.busy;
  this.busy=requestJson<EntryInfo>('/api/game/entry?city='+this.city,undefined,AbortSignal.any([this.abort.signal,AbortSignal.timeout(10_000)])).then(info=>{
   if(this.disposed)return false;this.onEntry(info);
   if(info.releaseId!==RELEASE_ID){this.pending=info;this.paint();return false;}return true;
  }).catch(()=>!this.pending).finally(()=>{this.busy=undefined;});return this.busy;
 }
 dispose(){this.disposed=true;this.abort.abort();clearInterval(this.timer);document.removeEventListener('visibilitychange',this.resume);window.removeEventListener('pageshow',this.resume);this.button.onclick=null;}
}
