import type {CityEvent} from '../shared/protocol.ts';

/** Notices never hold or replay tower data; the latest snapshot is authoritative. */
export class NoticeQueue {
  private items:Array<{event:CityEvent;received:number}>=[];
  push(event:CityEvent,now:number){
    const old=this.items.find(i=>i.event.playerId===event.playerId);
    if(old){if(event.id>old.event.id)old.event=event;return;}
    this.items.push({event,received:now});
    if(this.items.length>20){const ordinary=this.items.findIndex(i=>!i.event.globalRecord);this.items.splice(ordinary<0?0:ordinary,1);}
  }
  take(now:number,valid:(event:CityEvent)=>boolean){
    this.items=this.items.filter(i=>now-i.received<=20_000&&valid(i.event));
    const index=this.items.findIndex(i=>i.event.globalRecord);
    return this.items.splice(index<0?0:index,1)[0]?.event;
  }
  clear(){this.items=[];}
  get length(){return this.items.length;}
}

/** All camera callers share this priority boundary, including data refresh. */
export class CameraControl {
  paused=false;dragging=false;
  private manualUntil=0;
  private noticeUntil=0;
  manual(now:number,idle:number){this.manualUntil=now+idle;this.noticeUntil=0;}
  automatic(now:number){return !this.paused&&!this.dragging&&now>=this.manualUntil;}
  busy(now:number){return now<this.noticeUntil;}
  notice(now:number,duration:number){if(!this.automatic(now)||this.busy(now))return false;this.noticeUntil=now+duration;return true;}
  toggle(){this.paused=!this.paused;this.noticeUntil=0;if(!this.paused)this.manualUntil=0;return this.paused;}
  clear(){this.noticeUntil=0;}
}

export interface Box {minX:number;maxX:number;minY:number;maxY:number;minZ:number;maxZ:number}
export interface Point {x:number;y:number;z:number}
/** Segment/expanded AABB test for preset camera paths, not general navigation. */
export function intersectsBox(a:Point,b:Point,box:Box,margin=.7){
  let low=0,high=1;
  for(const [key,min,max] of [['x','minX','maxX'],['y','minY','maxY'],['z','minZ','maxZ']] as const){
    const delta=b[key]-a[key],lo=box[min]-margin,hi=box[max]+margin;
    if(Math.abs(delta)<1e-9){if(a[key]<lo||a[key]>hi)return false;continue;}
    let t0=(lo-a[key])/delta,t1=(hi-a[key])/delta;if(t0>t1)[t0,t1]=[t1,t0];low=Math.max(low,t0);high=Math.min(high,t1);if(low>high)return false;
  }
  return true;
}
