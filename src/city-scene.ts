import * as T from 'three';
import {allPlots,districtPoint,districtsFor,streetCurve,type CityLayout} from './core/layout.ts';
import {islandPlan,shoreLoop,shorePoint} from './core/island.ts';
const v=(x:number,z:number,y=.035)=>new T.Vector3(x,y,z);
// Bias only ground overlays: intersections have a stable order while buildings
// and raised bridges still occlude them through the normal depth buffer.
function surfaceMaterial(color:string,order:number){
  return new T.MeshStandardMaterial({color,roughness:.9,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-order*.25,polygonOffsetUnits:-order*2});
}
function ribbon(points:T.Vector3[],width:number,color:string,y=.035,order=2){
  const closed=points[0].distanceToSquared(points.at(-1)!)<.00001;
  const curve=new T.CatmullRomCurve3(closed?points.slice(0,-1):points,closed),p:number[]=[],uv:number[]=[];
  const count=Math.max(24,points.length*10);
  for(let i=0;i<count;i++){
    const a=curve.getPoint(i/count),b=curve.getPoint((i+1)/count),ta=curve.getTangent(i/count),tb=curve.getTangent((i+1)/count);
    const na=new T.Vector3(-ta.z,0,ta.x).normalize().multiplyScalar(width/2),nb=new T.Vector3(-tb.z,0,tb.x).normalize().multiplyScalar(width/2);
    const aa=a.clone().add(na),ab=a.clone().sub(na),ba=b.clone().add(nb),bb=b.clone().sub(nb);
    for(const q of [aa,ab,ba,ab,bb,ba])p.push(q.x,y,q.z);
    uv.push(0,i/count,1,i/count,0,(i+1)/count,1,i/count,1,(i+1)/count,0,(i+1)/count);
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
  const mesh=new T.Mesh(geometry,surfaceMaterial(color,order));mesh.renderOrder=order;return mesh;
}
export function disposeLandscape(group:T.Group){
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
  group.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o instanceof T.InstancedMesh)o.dispose();}});
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();group.removeFromParent();group.clear();
}
/** Original procedural scenery; public pavilions never enter player data or scores. */
export function createWaterfront(layout:CityLayout,publicBuildings=true){
  const root=new T.Group(),island=islandPlan(layout),ds=districtsFor(layout);
  const box=new T.BoxGeometry(1,1,1),stone=new T.MeshStandardMaterial({color:'#eee8d8',roughness:.9});
  const mint=new T.MeshStandardMaterial({color:'#9ac8af',roughness:1});
  // The sea extends beyond the camera's fog range; no visible board edge.
  const ocean=new T.Mesh(new T.CircleGeometry(10000,96),new T.MeshBasicMaterial({color:'#b8e1e7',toneMapped:false}));ocean.rotation.x=-Math.PI/2;ocean.position.set(island.x,-.33,island.z);root.add(ocean);
  const landShape=(scale:number)=>new T.Shape(shoreLoop(island,scale).slice(0,-1).map(p=>new T.Vector2(p.x,p.z)));
  const beach=new T.Mesh(new T.ShapeGeometry(landShape(1.035)),stone);beach.rotation.x=Math.PI/2;beach.material.side=T.DoubleSide;beach.position.y=-.19;root.add(beach);
  const land=new T.Mesh(new T.ExtrudeGeometry(landShape(1),{depth:.15,bevelEnabled:true,bevelThickness:.025,bevelSize:.09,bevelSegments:2}),new T.MeshStandardMaterial({color:'#dce7cc',roughness:1,side:T.DoubleSide}));
  land.rotation.x=Math.PI/2;land.position.y=-.075;root.add(land);
  const coast=shoreLoop(island,.958).map(p=>v(p.x,p.z));
  root.add(ribbon(coast,1.8,'#f2e8d8',.01),ribbon(shoreLoop(island,.976).map(p=>v(p.x,p.z)),.17,'#fff8e5',.02));
  // Main boulevard and short links connect the differently oriented neighborhood streets.
  if(layout.version==='waterfront-1'){
    const avenue=[v(-52,46),v(-22,41),v(-16,19),v(-19,-4),v(4,-8),v(30,0),v(54,19),v(55,48)];
    root.add(ribbon(avenue,4.8,'#eef0e7',.012,3),ribbon(avenue,3.25,'#a7b6b7',.04,4),ribbon(avenue,.06,'#fff2c1',.065,5));
    const links:[number,number][]=[[-19,-4],[4,-8],[30,0],[54,19],[-16,19],[-22,41],[-37,-21],[28,-32],[55,48],[-52,46]];
    ds.forEach((d,i)=>{
      const local=Array.from({length:9},(_,j)=>{const x=(j-4)*4,p=districtPoint(d,x,streetCurve(x));return v(p.x,p.z);});
      const [x,z]=links[i];const link=[v(d.x,d.z),v((d.x+x)/2,(d.z+z)/2),v(x,z)];
      root.add(ribbon(link,3.9,'#eef0e7',.012,3),ribbon(link,2.5,'#a7b6b7',.04,4));
      root.add(ribbon(local,3.9,'#eef0e7',.012,3),ribbon(local,2.5,'#a7b6b7',.04,4),ribbon(local,.05,'#fff4ce',.065,5));
    });
    const outlet=shorePoint(island,Math.PI*.45,1.045);
    const canal=[v(18,7),v(19,25),v(18,36),v(10,49),v(outlet.x,outlet.z)];
    root.add(ribbon(canal,5.5,'#ede4d2',.09,6),ribbon(canal,3.8,'#6ac8dd',.12,7));
    const lake=new T.Mesh(new T.CircleGeometry(1,64),surfaceMaterial('#6ac8dd',7));lake.renderOrder=7;lake.rotation.x=-Math.PI/2;lake.scale.set(9,5.6,1);lake.position.set(0,.12,0);root.add(lake);
    const lakeWalk=new T.Mesh(new T.RingGeometry(1,1.14,64),surfaceMaterial('#eee8d8',6));lakeWalk.renderOrder=6;lakeWalk.rotation.x=-Math.PI/2;lakeWalk.scale.set(9.1,5.7,1);lakeWalk.position.set(0,.09,0);root.add(lakeWalk);
    for(const [x,z,angle] of [[18,35,0],[outlet.x,outlet.z*.88,.12]] as const){const bridge=new T.Mesh(box,stone);bridge.position.set(x,.14,z);bridge.rotation.y=angle;bridge.scale.set(8,.18,2.5);root.add(bridge);}
  }else{
    const side=Math.max(4,Math.ceil(Math.sqrt(layout.capacities[0]+1)));
    for(let i=0;i<=side;i++){const offset=(i-side/2)*4.6;root.add(ribbon([v(offset,-side*2.3),v(offset,side*2.3)],.65,'#adbcbb'),ribbon([v(-side*2.3,offset),v(side*2.3,offset)],.65,'#adbcbb'));}
  }
  const plots=allPlots(layout),paving=new T.InstancedMesh(box,stone,plots.length),dummy=new T.Object3D();
  plots.forEach((p,i)=>{dummy.position.set(p.x,.035,p.z);dummy.rotation.set(0,p.rotation,0);dummy.scale.set(3.15,.07,3.15);dummy.updateMatrix();paving.setMatrixAt(i,dummy.matrix);});root.add(paving);
  const treePoints:{x:number;z:number}[]=[];
  for(const d of ds)for(let j=0;j<12;j++){const x=(j%6-2.5)*5.3,z=(j<6?8.4:-8.4)+streetCurve(x);treePoints.push(districtPoint(d,x,z));}
  for(let i=0;i<40;i++)treePoints.push(shorePoint(island,Math.PI*(.1+i*.8/39),.91));
  const trunks=new T.InstancedMesh(box,new T.MeshStandardMaterial({color:'#ac9e82'}),treePoints.length);
  const crowns=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),mint,treePoints.length);
  treePoints.forEach((p,i)=>{dummy.rotation.set(0,0,0);dummy.position.set(p.x,.48,p.z);dummy.scale.set(.13,.85,.13);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);dummy.position.y=1.05;dummy.scale.set(.56,.76,.56);dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);crowns.setColorAt(i,new T.Color(i%3===0?'#80b5a0':'#a7cca5'));});root.add(trunks,crowns);
  for(const [x,z,sx,sz] of [[-15,47,9,5],[-20,-42,9,6],[20,48,5,5]] as const){
    const park=new T.Mesh(new T.CircleGeometry(1,40),surfaceMaterial('#9ac8af',1));park.renderOrder=1;park.rotation.x=-Math.PI/2;park.position.set(x,.005,z);park.scale.set(sx,sz,1);root.add(park);
    root.add(ribbon([v(x-sx,z),v(x,z-1),v(x+sx,z)],.6,'#f1e7d5',.043));
    if(publicBuildings){
      const hall=new T.Group(),shell=new T.Mesh(new T.CylinderGeometry(1.8,1.8,1.05,8),new T.MeshStandardMaterial({color:'#b4d7e0',roughness:.36,metalness:.1}));shell.position.y=.59;hall.add(shell);
      const roof=new T.Mesh(new T.CylinderGeometry(2.05,2.05,.12,8),stone);roof.position.y=1.18;hall.add(roof);
      const base=new T.Mesh(new T.CylinderGeometry(2.25,2.25,.13,24),stone);base.position.y=.07;hall.add(base);hall.position.set(x,.04,z);root.add(hall);
    }
  }
  // Small waterfront pier, benches and warm lamp posts give the empty city a scale.
  for(const angle of [Math.PI*.32,Math.PI*.73]){const p=shorePoint(island,angle,1.035),pier=new T.Mesh(box,stone);pier.scale.set(3,.18,9);pier.rotation.y=Math.PI/2-angle;pier.position.set(p.x,.03,p.z);root.add(pier);}
  for(let i=0;i<24;i++){
    const angle=Math.PI*(.12+i*.78/23),p=shorePoint(island,angle,.949),{x,z}=p;
    const seat=new T.Mesh(box,stone);seat.scale.set(1,.18,.32);seat.rotation.y=-angle;seat.position.set(x,.25,z);root.add(seat);
    const lamp=new T.Mesh(box,new T.MeshStandardMaterial({color:'#809da3'}));lamp.scale.set(.065,1.9,.065);lamp.position.set(x+1,.95,z);root.add(lamp);
    const light=new T.Mesh(new T.SphereGeometry(.14,8,6),new T.MeshBasicMaterial({color:'#fff1c9'}));light.position.set(x+1,1.93,z);root.add(light);
  }
  const ripples=new T.InstancedMesh(new T.CircleGeometry(1,16),new T.MeshBasicMaterial({color:'#b8e4e9',transparent:true,opacity:.22,depthWrite:false}),80);
  for(let i=0;i<80;i++){const angle=i*2.39996,p=shorePoint(island,angle,1.25+i%8*.19);dummy.position.set(p.x,-.325,p.z);dummy.rotation.set(-Math.PI/2,0,angle*.3);dummy.scale.set(1.6+(i%4)*.55,.035,1);dummy.updateMatrix();ripples.setMatrixAt(i,dummy.matrix);}
  root.add(ripples);
  return root;
}
