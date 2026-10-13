import {allPlots,layoutBounds,type CityLayout} from './layout.ts';
export interface IslandPlan{x:number;z:number;radiusX:number;radiusZ:number}
const radius=(angle:number)=>1+.055*Math.sin(3*angle)+.035*Math.cos(5*angle)+.022*Math.sin(7*angle);
export function shorePoint(island:IslandPlan,angle:number,inset=1){const r=radius(angle)*inset;return {x:island.x+Math.cos(angle)*island.radiusX*r,z:island.z+Math.sin(angle)*island.radiusZ*r};}
export function insideIsland(island:IslandPlan,x:number,z:number,inset=1){const nx=(x-island.x)/island.radiusX,nz=(z-island.z)/island.radiusZ;return Math.hypot(nx,nz)<=radius(Math.atan2(nz,nx))*inset;}
export function islandPlan(layout:CityLayout):IslandPlan{
  const bounds=layoutBounds(layout),island={x:bounds.x,z:bounds.z,radiusX:Math.max(66,bounds.width*.60+14),radiusZ:Math.max(68,bounds.depth*.60+16)};
  const protectedPoints=allPlots(layout).flatMap(p=>[-2.4,2.4].flatMap(dx=>[-2.4,2.4].map(dz=>({x:p.x+dx,z:p.z+dz}))));
  protectedPoints.push({x:-20,z:-48},{x:-24,z:47},{x:26,z:48},{x:55,z:48},{x:-52,z:46});
  for(let i=0;i<100&&protectedPoints.some(p=>!insideIsland(island,p.x,p.z,.9));i++){island.radiusX*=1.025;island.radiusZ*=1.025;}
  return island;
}
export function shoreLoop(island:IslandPlan,inset=1,segments=160){return Array.from({length:segments+1},(_,i)=>shorePoint(island,i/segments*Math.PI*2,inset));}
export function islandBounds(island:IslandPlan){const points=shoreLoop(island),minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));return {minX,maxX,minZ,maxZ,x:(minX+maxX)/2,z:(minZ+maxZ)/2,width:maxX-minX,depth:maxZ-minZ};}
