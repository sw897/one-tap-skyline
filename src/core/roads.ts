import {allPlots,districtPoint,districtsFor,streetCurve,type CityLayout} from './layout.ts';
import {islandPlan,shoreLoop,shorePoint} from './island.ts';
import {routeStreet,pointPlotDistance,type GroundPoint} from './ground.ts';

export interface Road {id:string;points:GroundPoint[];width:number;shoulder:number}
export interface RoadBridge {roadId:string;x:number;z:number;rotation:number;length:number;width:number}
const distance=(a:GroundPoint,b:GroundPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
const cross=(a:GroundPoint,b:GroundPoint)=>a.x*b.z-a.z*b.x;

/** One connected road network: each end of every district street joins the island loop. */
export function waterfrontRoads(layout:CityLayout){
  const island=islandPlan(layout),plots=allPlots(layout);
  const obstacles=[...plots,{x:0,z:0,rotation:0,halfWidth:9.6,halfDepth:6.2},
    ...[[-15,47],[-20,-42],[20,48]].map(([x,z])=>({x,z,rotation:0,halfWidth:4,halfDepth:3}))];
  const loop=shoreLoop(island,.919,64);loop[loop.length-1]=loop[0];
  const ring:Road={id:'island-loop',points:routeStreet(loop,obstacles,4.8),width:3.25,shoulder:4.8};
  const roads:Road[]=[ring];
  for(const d of districtsFor(layout)){
    const reach=(Math.ceil(d.capacity/2)-1)*3.9/2+2.2;
    const end=(sign:number)=>{let x=sign*reach;for(let i=0;i<30;i++){
      const p=districtPoint(d,x,streetCurve(x));if(obstacles.every(plot=>pointPlotDistance(p,plot)>=2.2))return x;x-=sign*.5;
    }return 0;};
    const left=end(-1),right=end(1);
    const points=Array.from({length:9},(_,i)=>{const x=left+(right-left)*i/8;return districtPoint(d,x,streetCurve(x));});
    const street:Road={id:`district-${d.id}`,points:routeStreet(points,obstacles,3.9),width:2.5,shoulder:3.9};roads.push(street);
    for(const [side,end] of [[0,street.points[0]],[1,street.points.at(-1)!]] as const){
      const sign=side?1:-1,dir={x:Math.cos(d.rotation)*sign,z:-Math.sin(d.rotation)*sign};
      const score=(p:GroundPoint)=>{const delta={x:p.x-end.x,z:p.z-end.z},length=distance(p,end),forward=delta.x*dir.x+delta.z*dir.z;
        return forward<=0?Infinity:Math.abs(cross(dir,delta))/length*500+length;
      };
      const anchor=ring.points.reduce((best,p)=>score(p)<score(best)?p:best,ring.points[0]);
      roads.push({id:`district-${d.id}-link-${side}`,points:routeStreet([end,anchor],obstacles,3.9),width:2.5,shoulder:3.9});
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
