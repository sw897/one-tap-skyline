import * as T from 'three';
import {waterfrontRoads} from './core/roads.ts';
import type {CityLayout} from './core/layout.ts';
import {islandPlan,shorePoint} from './core/island.ts';
export function createAmbient(layout:CityLayout){
 const root=new T.Group(),network=waterfrontRoads(layout),island=islandPlan(layout),motions:Array<{object:T.Group;a:T.Vector3;b:T.Vector3;phase:number;boat:boolean}>=[];
 const geometry=new T.BoxGeometry(1,1,1),body=new T.MeshStandardMaterial({color:'#f7dfae',roughness:.7}),glass=new T.MeshStandardMaterial({color:'#7bafbe',roughness:.35});
 function vehicle(a:T.Vector3,b:T.Vector3,boat:boolean,phase:number){const group=new T.Group(),base=new T.Mesh(geometry,body),roof=new T.Mesh(geometry,glass);base.scale.set(boat?1:.48,boat?.24:.24,boat?2.4:1.05);roof.scale.set(boat?.65:.38,.18,boat?1.1:.55);roof.position.y=.2;group.add(base,roof);group.position.copy(a);root.add(group);motions.push({object:group,a,b,phase,boat});}
 const segments=network.roads.filter(r=>r.id==='avenue'||r.id==='island-loop').flatMap(r=>r.points.slice(1).map((b,i)=>({a:r.points[i],b})));
 for(const {a,b} of segments){if(motions.length>=3)break;const length=Math.hypot(b.x-a.x,b.z-a.z);if(length<9)continue;
  // Entire segment must stay well away from every bridge, not merely its ends.
  if(network.bridges.some(p=>{const t=T.MathUtils.clamp(((p.x-a.x)*(b.x-a.x)+(p.z-a.z)*(b.z-a.z))/(length*length),0,1);return Math.hypot(p.x-a.x-t*(b.x-a.x),p.z-a.z-t*(b.z-a.z))<p.length/2+4;}))continue;
  const av=new T.Vector3(a.x,.23,a.z),bv=new T.Vector3(b.x,.23,b.z),direction=bv.clone().sub(av).normalize();av.addScaledVector(direction,1.3);bv.addScaledVector(direction,-1.3);vehicle(av,bv,false,motions.length*1.8);
 }
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
