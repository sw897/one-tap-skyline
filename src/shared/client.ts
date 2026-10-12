import type { CompletedRun } from '../core/game.ts';
import type { CityBuilding, CityUpdate } from '../core/city.ts';
import type { RunTrace } from '../core/trace.ts';
import type { CitySnapshot, SharedCityId, SharedSession, StartReceipt, SubmissionResponse, SnapshotScope } from './protocol.ts';

export class SharedError extends Error {
  readonly code:string;
  constructor(code:string){super(code);this.code=code;}
}
const messages:Record<string,string>={session_required:'身份已过期，请刷新后重新开局。',city_write_closed:'共享体验暂未开放，可以先进入练习。',rate_limited:'操作有些频繁，请稍等再试。',active_run_exists:'上一局仍有效，请结束或重新开局。',run_expired_or_cancelled:'本局已过期或取消，请重新盖一局。',invalid_trace:'本局暂未通过验证，作品仍保留，可再开一局。',impossible_run_time:'本局时长暂未通过验证，请重新开局。',submission_conflict:'这一局已有提交结果，请刷新城市查看。',service_unavailable:'共享服务暂时不可用，作品仍保留，请稍后重试。'};
export const sharedMessage=(error:unknown)=>error instanceof SharedError?(messages[error.code]??'共享暂未成功，请稍后重试。'):'网络暂时不通，作品仍保留，请重试。';
messages.city_full='城市已满，已有楼仍可继续长高；本局作品保留在结算页。';
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
  constructor(session:SharedSession){this.cityId=session.snapshot.cityId;this.playerId=session.playerId;this.snapshot=session.snapshot;this.scope=session.snapshot.scope??'all';}
  all(){return this.snapshot.buildings;}
  get(playerId:string){return this.snapshot.buildings.find(b=>b.playerId===playerId);}
  apply(incoming:CitySnapshot):boolean {
    if(this.disposed||incoming.cityId!==this.cityId||incoming.epoch!==this.snapshot.epoch||(incoming.scope??'all')!==this.scope||incoming.revision<=this.snapshot.revision)return false;
    const previous=new Map(this.snapshot.buildings.map(b=>[b.playerId,b]));
    incoming.buildings=incoming.buildings.map(b=>{const old=previous.get(b.playerId);return old&&old.bestRunId===b.bestRunId&&old.plotId===b.plotId&&old.color===b.color&&old.name===b.name?{...old,rank:b.rank}:b;});
    this.snapshot=incoming;return true;
  }
  async refresh(signal?:AbortSignal){
    const generation=this.generation;
    const incoming=await requestJson<CitySnapshot|{unchanged:true;writeOpen:boolean;name:string}>(`/api/city?city=${this.cityId}&scope=${this.scope}&epoch=${encodeURIComponent(this.snapshot.epoch)}&since=${this.snapshot.revision}`,undefined,signal);
    if(generation!==this.generation||this.disposed)return false;
    if('unchanged'in incoming){const changed=this.snapshot.name!==incoming.name;this.snapshot.writeOpen=incoming.writeOpen;this.snapshot.name=incoming.name;return changed;}
    return this.apply(incoming);
  }
  async submit(_player:string,name:string,run:CompletedRun,trace:RunTrace):Promise<CityUpdate>{
    const value=await requestJson<SubmissionResponse>(`/api/runs/${run.runId}/submit?scope=${this.scope}`,{name,trace});
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
export const loadSession=(city:SharedCityId,signal?:AbortSignal,scope:SnapshotScope='all')=>requestJson<SharedSession>(`/api/session?city=${city}&scope=${scope}`,undefined,signal);
export const startSharedRun=(city:SharedCityId,startKey:string,replaceRunId:string|null)=>requestJson<StartReceipt>('/api/runs',{city,startKey,replaceRunId});
