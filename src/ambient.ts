import * as T from 'three';
import {waterfrontRoads} from './core/roads.ts';
import type {CityLayout} from './core/layout.ts';
import {islandPlan,shorePoint} from './core/island.ts';
export function createAmbient(layout:CityLayout){
 const root=new T.Group(),network=waterfrontRoads(layout),island=islandPlan(layout),motions:Array<{object:T.Group;a:T.Vector3;b:T.Vector3;phase:number;boat:boolean}>=[];
 const staticCars:T.Group[]=[];
 const geometry=new T.BoxGeometry(1,1,1),bodies=['#f5ce86','#e59880','#8caed6'].map(color=>new T.MeshStandardMaterial({color,roughness:.7})),glass=new T.MeshStandardMaterial({color:'#7bafbe',roughness:.35});
 function vehicle(a:T.Vector3,b:T.Vector3,boat:boolean,phase:number,moving=true){const group=new T.Group(),base=new T.Mesh(geometry,bodies[Math.floor(phase)%3]),roof=new T.Mesh(geometry,glass);base.scale.set(boat?1:.72,boat?.24:.34,boat?2.4:1.55);roof.scale.set(boat?.65:.57,boat?.18:.24,boat?1.1:.82);roof.position.y=boat?.2:.26;group.add(base,roof);group.position.copy(a);group.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);root.add(group);if(moving)motions.push({object:group,a,b,phase,boat});else staticCars.push(group);}
 const segments=network.roads.filter(r=>r.id==='avenue').flatMap(r=>r.points.slice(1).map((b,i)=>({a:r.points[i],b})));
 const safeSegments=segments.filter(({a,b})=>{const length=Math.hypot(b.x-a.x,b.z-a.z);return length>=4&&!network.bridges.some(p=>{const t=T.MathUtils.clamp(((p.x-a.x)*(b.x-a.x)+(p.z-a.z)*(b.z-a.z))/(length*length),0,1);return Math.hypot(p.x-a.x-t*(b.x-a.x),p.z-a.z-t*(b.z-a.z))<p.length/2+4;});});
 const long=safeSegments.filter(({a,b})=>Math.hypot(b.x-a.x,b.z-a.z)>=9);
 // Spread the moving cars across the avenue, rather than taking its first three western segments.
 const selected=[...new Set([0,Math.floor((long.length-1)/2),long.length-1])].filter(i=>i>=0&&i<long.length);
 for(const index of selected){const {a,b}=long[index],av=new T.Vector3(a.x,.32,a.z),bv=new T.Vector3(b.x,.32,b.z),direction=bv.clone().sub(av).normalize(),side=new T.Vector3(direction.z,0,-direction.x).multiplyScalar(.65);av.add(side).addScaledVector(direction,1.3);bv.add(side).addScaledVector(direction,-1.3);vehicle(av,bv,false,motions.length*1.8);}
 // Six visible stationary vehicles remain when ambient movement is disabled.
 for(let i=0;i<safeSegments.length&&staticCars.length<6;i++){const index=Math.floor(i*safeSegments.length/Math.min(6,safeSegments.length));if(index>=safeSegments.length)break;const {a,b}=safeSegments[index],av=new T.Vector3(a.x,.32,a.z),bv=new T.Vector3(b.x,.32,b.z),direction=bv.clone().sub(av).normalize(),position=av.clone().lerp(bv,.5).add(new T.Vector3(-direction.z,0,direction.x).multiplyScalar(.65));if(staticCars.some(c=>c.position.distanceTo(position)<3))continue;vehicle(position,position.clone().add(direction),false,staticCars.length,false);}
 root.userData.staticCars=staticCars;
 for(const angle of [0,Math.PI]){const a=shorePoint(island,angle,1.28),b=shorePoint(island,angle+.12,1.28);vehicle(new T.Vector3(a.x,-.15,a.z),new T.Vector3(b.x,-.15,b.z),true,angle);}
 root.userData.motions=motions;root.userData.elapsed=0;stepAmbient(root,0,false);return root;
}
export function stepAmbient(root:T.Group,seconds:number,enabled:boolean,camera?:T.Vector3){
 if(!enabled&&root.userData.initialized)return;
 root.userData.initialized=true;
 const water=root.parent?.userData.oceanMaterial,base=root.parent?.userData.oceanColor;
 if(water&&base)water.color.copy(base).multiplyScalar(enabled?1+Math.sin(root.userData.elapsed*.12)*.008:1);
 if(enabled)root.userData.elapsed+=Math.min(.05,Math.max(0,seconds));
 for(const m of root.userData.motions){const phase=root.userData.elapsed*(m.boat?.07:.13)+m.phase,t=(1-Math.cos(phase))/2;
  const tick=Math.floor(root.userData.elapsed*10);
  if(camera&&camera.distanceTo(m.object.position)>100&&m.lastTick===tick)continue;
  m.lastTick=tick;
  m.object.position.lerpVectors(m.a,m.b,t);m.object.rotation.y=Math.atan2(m.b.x-m.a.x,m.b.z-m.a.z)+(Math.sin(phase)<0?Math.PI:0);
  if(m.boat)m.object.position.y+=enabled?Math.sin(phase*2)*.018:0;
 }
}
