import type { CompletedRun } from '../core/game.ts';
import type { CityBuilding, CityUpdate } from '../core/city.ts';
import type { RunTrace } from '../core/trace.ts';
import type { CitySnapshot, CityEvent, SharedCityId, SharedSession, StartReceipt, SubmissionResponse, SnapshotScope } from './protocol.ts';
import {DEFAULT_CONFIG} from '../config.ts';

export class SharedError extends Error {
  readonly code:string;
  constructor(code:string){super(code);this.code=code;}
}
const messages:Record<string,string>={entry_expired:'今日入口已更新，请扫描现场大屏上的二维码。',session_required:'身份已过期，请刷新后重新开局。',city_write_closed:'共享体验暂未开放，请稍后重试。',rate_limited:'操作有些频繁，请稍等再试。',active_run_exists:'上一局仍有效，请结束或重新开局。',run_expired_or_cancelled:'本局已过期或取消，请重新盖一局。',invalid_trace:'本局暂未通过验证，作品仍保留，可再开一局。',impossible_run_time:'本局时长暂未通过验证，请重新开局。',submission_conflict:'这一局已有提交结果，请刷新城市查看。',service_unavailable:'共享服务暂时不可用，作品仍保留，请稍后重试。'};
export const sharedMessage=(error:unknown)=>error instanceof SharedError?(messages[error.code]??'共享暂未成功，请稍后重试。'):'网络暂时不通，作品仍保留，请重试。';
messages.city_full='城市已满，已有楼仍可继续长高；本局作品保留在结算页。';
Object.assign(messages,{city_reset:'新的一天，城市已经重新开始。',photos_closed:'照片体验暂未开放。',no_saved_building:'先把有效成绩保存到城市，再装饰你的楼。',photo_too_large:'压缩后的照片仍然较大，请换一张。',invalid_photo:'这张照片暂时无法处理，请重新选择。',photo_expired:'照片草稿已失效，请重新选择。',photo_conflict:'照片状态已更新，请查看我的楼后再试。',photo_service_unavailable:'照片暂未保存，请稍后重试。',photo_storage_unavailable:'照片存储暂时不可用。'});
export async function requestJson<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T>{
  const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),signal});
  const value=await response.json() as T&{error?:string};if(!response.ok)throw new SharedError(value.error??'service_unavailable');return value as T;
}
export class SharedCityRepository {
  readonly cityId:SharedCityId; readonly playerId:string;
  readonly scope:SnapshotScope;
  snapshot:CitySnapshot;
  private generation=0;private disposed=false;
  private shownRuns=new Set<string>();
  private cursor=0;private pending:CityEvent[]=[];private skipEvents=false;
  constructor(session:SharedSession){this.cityId=session.snapshot.cityId;this.playerId=session.playerId;this.snapshot=session.snapshot;this.scope=session.snapshot.scope??'all';this.cursor=session.snapshot.latestEventId??0;}
  takeEvents(){return this.pending.splice(0);}
  silenceNextEvents(){this.skipEvents=true;this.pending=[];this.generation++;}
  prime(incoming:CitySnapshot){this.snapshot=incoming;this.cursor=incoming.latestEventId??0;this.pending=[];}
  all(){return this.snapshot.buildings;}
  get(playerId:string){return this.snapshot.buildings.find(b=>b.playerId===playerId);}
  apply(incoming:CitySnapshot):boolean {
    if(this.disposed||incoming.cityId!==this.cityId||incoming.epoch!==this.snapshot.epoch||(incoming.scope??'all')!==this.scope||incoming.revision<=this.snapshot.revision)return false;
    const previous=new Map(this.snapshot.buildings.map(b=>[b.playerId,b]));
    incoming.buildings=incoming.buildings.map(b=>{const old=previous.get(b.playerId);return old&&old.bestRunId===b.bestRunId&&old.plotId===b.plotId&&old.color===b.color&&old.name===b.name?{...b,tower:old.tower}:b;});
    this.snapshot=incoming;return true;
  }
  async refresh(signal?:AbortSignal){
    const generation=this.generation,resuming=this.skipEvents;
    const path=`/api/city?city=${this.cityId}&scope=${this.scope}`+(resuming?'':`&epoch=${encodeURIComponent(this.snapshot.epoch)}&since=${this.snapshot.revision}&after=${this.cursor}`);
    const incoming=await requestJson<CitySnapshot|{unchanged:true;writeOpen:boolean;name:string;latestEventId?:number}>(path,undefined,signal);
    if(generation!==this.generation||this.disposed)return false;
    if('epoch' in incoming&&incoming.epoch!==this.snapshot.epoch)throw new SharedError('city_reset');
    if('unchanged'in incoming){const changed=this.snapshot.name!==incoming.name;this.snapshot.writeOpen=incoming.writeOpen;this.snapshot.name=incoming.name;if(this.skipEvents){this.cursor=incoming.latestEventId??this.cursor;this.skipEvents=false;}return changed;}
    if(incoming.revision<this.snapshot.revision)return false;
    if(incoming.eventGap||resuming){this.pending=[];this.cursor=incoming.latestEventId??this.cursor;this.skipEvents=false;incoming.eventGap=true;}
    else for(const event of incoming.events??[]){if(event.epoch===this.snapshot.epoch&&event.id>this.cursor){this.pending.push(event);this.cursor=event.id;}}
    // Coalesce pending notices per building; the renderer always uses the latest snapshot.
    this.pending=[...new Map(this.pending.map(e=>[e.playerId,e])).values()].slice(-20);
    if(incoming.revision===this.snapshot.revision){this.snapshot.events=incoming.events;this.snapshot.latestEventId=incoming.latestEventId;this.snapshot.eventGap=incoming.eventGap;return !!incoming.eventGap||this.pending.length>0;}
    return this.apply(incoming);
  }
  async submit(_player:string,name:string,run:CompletedRun,trace:RunTrace,color?:string):Promise<CityUpdate>{
    const value=await requestJson<SubmissionResponse>(`/api/runs/${run.runId}/submit?scope=${this.scope}`,{name,trace,...(color!==undefined?{color}:{})});
    this.apply(value.snapshot);
    const receipt=value.receipt;
    if(receipt.kind==='zero'||receipt.kind==='full')throw new SharedError(receipt.kind==='full'?'city_full':'invalid_trace');
    const building=this.get(this.playerId),seen=this.shownRuns.has(run.runId);
    this.shownRuns.add(run.runId);
    if(!building)return {kind:'invalid'};
    if(value.duplicate||seen)return {kind:'duplicate',building};
    if(building.bestRunId!==run.runId)return {kind:'unchanged',building,previous:building};
    return {kind:receipt.kind,building,previous:receipt.previous};
  }
  dispose(){this.disposed=true;this.generation++;}
}
export class DisplayCityRepository extends SharedCityRepository {
  constructor(snapshot:CitySnapshot){super({snapshot,playerId:'',color:'#75aaff',rules:DEFAULT_CONFIG.game,rulesetId:'',activeRunId:null});}
  override async submit():Promise<CityUpdate>{throw new SharedError('city_write_closed');}
  override async refresh(signal?:AbortSignal){
    if(this.snapshot.epoch==='pending'){this.prime(await loadDisplay(this.cityId,signal));return true;}
    return super.refresh(signal);
  }
}
export const loadDisplay=(city:SharedCityId,signal?:AbortSignal)=>requestJson<CitySnapshot>(`/api/city?city=${city}&scope=all`,undefined,signal);
export const loadSession=(city:SharedCityId,signal?:AbortSignal,scope:SnapshotScope='all',entry?:string)=>requestJson<SharedSession>(`/api/session?city=${city}&scope=${scope}`+(entry?'&entry='+encodeURIComponent(entry):''),undefined,signal?AbortSignal.any([signal,AbortSignal.timeout(12_000)]):AbortSignal.timeout(12_000));
export const startSharedRun=(city:SharedCityId,startKey:string,replaceRunId:string|null,entry?:string)=>requestJson<StartReceipt>('/api/runs'+(entry?'?entry='+encodeURIComponent(entry):''),{city,startKey,replaceRunId});
