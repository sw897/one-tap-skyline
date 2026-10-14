import {allPlots,districtPoint,districtsFor,streetCurve,type CityLayout} from './layout.ts';
import {islandPlan,shoreLoop,shorePoint} from './island.ts';
import {routeStreet,pointPlotDistance,type GroundPoint} from './ground.ts';

export interface Road {id:string;points:GroundPoint[];width:number;shoulder:number}
export interface RoadBridge {roadId:string;x:number;z:number;rotation:number;length:number;width:number}
const distance=(a:GroundPoint,b:GroundPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
const cross=(a:GroundPoint,b:GroundPoint)=>a.x*b.z-a.z*b.x;

/** Keep the original curved boulevard and district streets; add short, safe connections. */
export function waterfrontRoads(layout:CityLayout){
  const island=islandPlan(layout),plots=allPlots(layout);
  const obstacles=[...plots,{x:0,z:0,rotation:0,halfWidth:9.6,halfDepth:6.2},
    ...[[-15,47],[-20,-42],[20,48]].map(([x,z])=>({x,z,rotation:0,halfWidth:4,halfDepth:3}))];
  const clear=(p:GroundPoint,width:number)=>obstacles.every(plot=>pointPlotDistance(p,plot)>=width/2+.4);
  const safeNode=(p:GroundPoint,width:number)=>{
    if(clear(p,width))return p;
    for(let radius=.5;radius<=18;radius+=.5)for(let i=0;i<32;i++){
      const q={x:p.x+Math.cos(i*Math.PI/16)*radius,z:p.z+Math.sin(i*Math.PI/16)*radius};
      if(clear(q,width))return q;
    }
    throw Error('No clear boulevard node');
  };
  const rounded=(points:GroundPoint[],width:number)=>{
    const result=[points[0]];
    for(let i=1;i<points.length-1;i++){
      const prev=points[i-1],p=points[i],next=points[i+1],a=distance(prev,p),b=distance(p,next);
      let bend:GroundPoint[]=[p];
      for(const scale of [1,.5,.25]){
        const cut=Math.min(3,a*.28,b*.28)*scale;if(cut<.01)break;
        const entry={x:p.x+(prev.x-p.x)*cut/a,z:p.z+(prev.z-p.z)*cut/a},exit={x:p.x+(next.x-p.x)*cut/b,z:p.z+(next.z-p.z)*cut/b};
        const samples=Array.from({length:17},(_,j)=>{const t=j/16;return {x:(1-t)**2*entry.x+2*t*(1-t)*p.x+t*t*exit.x,z:(1-t)**2*entry.z+2*t*(1-t)*p.z+t*t*exit.z};});
        if(samples.every(q=>clear(q,width))){bend=samples;break;}
      }
      result.push(...bend);
    }
    result.push(points.at(-1)!);return result;
  };
  const routed=(points:GroundPoint[],width:number)=>rounded(routeStreet(points,obstacles,width),width);
  const loop=shoreLoop(island,.926,96);loop[loop.length-1]=loop[0];
  const ring:Road={id:'island-loop',points:routeStreet(loop,obstacles,3.2),width:2.2,shoulder:3.2};
  const roads:Road[]=[ring];
  const original=[[-52,46],[-22,41],[-16,19],[-19,-4],[4,-8],[30,0],[54,19],[55,48]];
  const avenue:Road={id:'avenue',points:routed(original.map(([x,z])=>safeNode({x,z},3.9)),3.9),width:3.25,shoulder:3.9};roads.push(avenue);
  const nearest=(points:GroundPoint[],p:GroundPoint)=>points.reduce((best,q)=>distance(q,p)<distance(best,p)?q:best,points[0]);
  for(const [side,end] of [[0,avenue.points[0]],[1,avenue.points.at(-1)!]] as const){
    roads.push({id:`avenue-coast-${side}`,points:routed([end,nearest(ring.points,end)],3.9),width:2.5,shoulder:3.9});
  }
  for(const d of districtsFor(layout)){
    const reach=16;
    const end=(sign:number)=>{let x=sign*reach;for(let i=0;i<30;i++){
      const p=districtPoint(d,x,streetCurve(x));if(obstacles.every(plot=>pointPlotDistance(p,plot)>=2.2))return x;x-=sign*.5;
    }return 0;};
    const left=end(-1),right=end(1);
    const points=Array.from({length:9},(_,i)=>{const x=left+(right-left)*i/8;return districtPoint(d,x,streetCurve(x));});
    const street:Road={id:`district-${d.id}`,points:routed(points,3.9),width:2.5,shoulder:3.9};roads.push(street);
    for(const [side,end] of [[0,street.points[0]],[1,street.points.at(-1)!]] as const){
      const anchor=nearest([...avenue.points,...ring.points],end);
      const crossing=d.id===5&&side===1?safeNode({x:24,z:end.z},3.9):undefined;
      roads.push({id:`district-${d.id}-link-${side}`,points:routed(crossing?[end,crossing,anchor]:[end,anchor],3.9),width:2.5,shoulder:3.9});
    }
  }
  // Starts inside the central lake and ends beyond the shore, so water is continuous.
  const outlet=shorePoint(island,Math.PI*.45,1.045);
  const canal:GroundPoint[]=[{x:6,z:0},{x:16,z:4},{x:18,z:15},{x:18,z:31},{x:9,z:48},outlet];
  const bridges:RoadBridge[]=[];
  for(const road of roads)for(let i=1;i<road.points.length;i++)for(let j=1;j<canal.length;j++){
    const a=road.points[i-1],b=road.points[i],c=canal[j-1],d=canal[j],r={x:b.x-a.x,z:b.z-a.z},s={x:d.x-c.x,z:d.z-c.z};
    const determinant=cross(r,s);if(Math.abs(determinant)<1e-8)continue;
    const ca={x:c.x-a.x,z:c.z-a.z},t=cross(ca,s)/determinant,u=cross(ca,r)/determinant;
    if(t<0||t>1||u<0||u>1)continue;
    const x=a.x+t*r.x,z=a.z+t*r.z;if(bridges.some(bridge=>Math.hypot(x-bridge.x,z-bridge.z)<2))continue;
    const sine=Math.abs(determinant)/(Math.hypot(r.x,r.z)*Math.hypot(s.x,s.z));
    bridges.push({roadId:road.id,x,z,rotation:Math.atan2(r.x,r.z),length:5.5/sine+2,width:road.width+.35});
  }
  return {roads,canal,bridges};
}
