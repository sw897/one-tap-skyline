export interface Rect{x:number;y:number;width:number;height:number}
export interface LabelAnchor{id:string;x:number;y:number;width:number;height:number;priority:number}
export const overlaps=(a:Rect,b:Rect)=>a.x<b.x+b.width+5&&a.x+a.width+5>b.x&&a.y<b.y+b.height+5&&a.y+a.height+5>b.y;
/** Stable priority layout; rejected members remain reachable via a cluster. */
export function arrangeLabels(anchors:LabelAnchor[],width:number,height:number,blocked:Rect[],previous=new Map<string,{dx:number;dy:number}>()){
  const placed=new Map<string,{dx:number;dy:number}>(),hidden:LabelAnchor[]=[],occupied=[...blocked];
  for(const a of [...anchors].sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id))){
    const offsets=[previous.get(a.id),{dx:0,dy:0},{dx:0,dy:-30},{dx:-55,dy:-20},{dx:55,dy:-20},{dx:0,dy:-65},{dx:-90,dy:-50},{dx:90,dy:-50}].filter((o):o is {dx:number;dy:number}=>!!o);
    const candidate=offsets.find(o=>{const r={x:a.x-a.width/2+o.dx,y:a.y-a.height+o.dy,width:a.width,height:a.height};return r.x>=8&&r.y>=8&&r.x+r.width<=width-8&&r.y+r.height<=height-8&&!occupied.some(b=>overlaps(r,b));});
    if(candidate){placed.set(a.id,candidate);occupied.push({x:a.x-a.width/2+candidate.dx,y:a.y-a.height+candidate.dy,width:a.width,height:a.height});}else hidden.push(a);
  }
  const clusters:Array<{ids:string[];x:number;y:number}>=[];
  for(const a of hidden){const group=clusters.find(c=>Math.hypot(c.x-a.x,c.y-a.y)<110);if(group)group.ids.push(a.id);else clusters.push({ids:[a.id],x:a.x,y:a.y});}
  for(const c of clusters){c.x=Math.max(35,Math.min(width-35,c.x));c.y=Math.max(40,Math.min(height-30,c.y));
    // Place count outside reserved UI where possible. The expanded list is the fallback.
    for(let i=0;i<12&&occupied.some(b=>overlaps({x:c.x-32,y:c.y-27,width:64,height:27},b));i++)c.y=Math.max(30,c.y-30);
  }
  return {placed,clusters};
}
