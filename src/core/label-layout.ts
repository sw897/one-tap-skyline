export interface Rect{x:number;y:number;width:number;height:number}
export interface LabelAnchor{id:string;x:number;y:number;width:number;height:number;priority:number}
export const overlaps=(a:Rect,b:Rect)=>a.x<b.x+b.width+5&&a.x+a.width+5>b.x&&a.y<b.y+b.height+5&&a.y+a.height+5>b.y;
const overlapArea=(a:Rect,b:Rect)=>Math.max(0,Math.min(a.x+a.width+5,b.x+b.width+5)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height+5,b.y+b.height+5)-Math.max(a.y,b.y));
/** Every visible building keeps its own name; dense scenes choose least overlap. */
export function arrangeLabels(anchors:LabelAnchor[],width:number,height:number,blocked:Rect[],previous=new Map<string,{dx:number;dy:number}>()){
  const placed=new Map<string,{dx:number;dy:number}>(),occupied:Rect[]=[];
  for(const a of [...anchors].sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id))){
    const offsets:Array<{dx:number;dy:number}>=[];
    const old=previous.get(a.id);if(old)offsets.push(old);
    offsets.push({dx:0,dy:0});
    for(let ring=1;ring<=8;ring++)for(const direction of [-1,1]){
      offsets.push({dx:0,dy:direction*ring*34},{dx:-ring*48,dy:direction*ring*25},{dx:ring*48,dy:direction*ring*25});
    }
    const rect=(o:{dx:number;dy:number}):Rect=>({x:Math.max(8,Math.min(Math.max(8,width-a.width-8),a.x-a.width/2+o.dx)),y:Math.max(8,Math.min(Math.max(8,height-a.height-8),a.y-a.height+o.dy)),width:a.width,height:a.height});
    const candidates=offsets.map(o=>rect(o));
    let chosen=candidates.find(r=>!blocked.some(b=>overlaps(r,b))&&!occupied.some(b=>overlaps(r,b)));
    if(!chosen){
      let cost=Infinity;
      for(const r of candidates){const score=blocked.reduce((sum,b)=>sum+overlapArea(r,b)*1000,0)+occupied.reduce((sum,b)=>sum+overlapArea(r,b),0);
        if(score<cost){chosen=r;cost=score;}
      }
    }
    const r=chosen!;placed.set(a.id,{dx:r.x+a.width/2-a.x,dy:r.y+a.height-a.y});occupied.push(r);
  }
  return {placed};
}
