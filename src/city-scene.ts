import * as T from 'three';
import {allPlots,districtPoint,districtsFor,streetCurve,type CityLayout} from './core/layout.ts';
import {islandPlan,shoreLoop,shorePoint} from './core/island.ts';
export interface SceneryLabel {name:string;x:number;z:number;height:number}
const v=(x:number,z:number,y=.035)=>new T.Vector3(x,y,z);
// Ordered ground overlays still use depth testing: bridges/buildings occlude them.
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
    for(const q of [a.clone().add(na),a.clone().sub(na),b.clone().add(nb),a.clone().sub(na),b.clone().sub(nb),b.clone().add(nb)])p.push(q.x,y,q.z);
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

/** Original procedural scenery; public architecture never enters scores/player data. */
export function createWaterfront(layout:CityLayout,publicBuildings=true){
  const root=new T.Group(),island=islandPlan(layout),ds=districtsFor(layout),plots=allPlots(layout);
  const stone=new T.MeshStandardMaterial({color:'#ece6d5',roughness:.9,side:T.DoubleSide});
  const labels:SceneryLabel[]=[];root.userData.labels=labels;root.userData.publicFootprints=[];
  type Kind='box'|'glass'|'metal'|'leaf'|'cone'|'sphere'|'shadow';
  type Item={x:number;y:number;z:number;w:number;h:number;d:number;color:string;ry:number;rz:number};
  const batches=new Map<Kind,Item[]>();
  function add(kind:Kind,x:number,y:number,z:number,w:number,h:number,d:number,color:string,ry=0,rz=0){
    if(!batches.has(kind))batches.set(kind,[]);batches.get(kind)!.push({x,y,z,w,h,d,color,ry,rz});
  }
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:string,ry=0,rz=0)=>add('box',x,y,z,w,h,d,color,ry,rz);
  const clear=(x:number,z:number,r=3)=>plots.every(p=>Math.hypot(x-p.x,z-p.z)>r);
  // Ocean and shallow-water bands extend into an open horizon, without a board edge.
  const ocean=new T.Mesh(new T.CircleGeometry(10000,96),new T.MeshBasicMaterial({color:'#88d4e0',toneMapped:false}));ocean.rotation.x=-Math.PI/2;ocean.position.set(island.x,-.33,island.z);root.add(ocean);
  const shape=(scale:number)=>new T.Shape(shoreLoop(island,scale).slice(0,-1).map(p=>new T.Vector2(p.x,p.z)));
  const waterBand=shape(1.115);waterBand.holes.push(new T.Path(shoreLoop(island,1.036).slice(0,-1).reverse().map(p=>new T.Vector2(p.x,p.z))));
  const shallows=new T.Mesh(new T.ShapeGeometry(waterBand),new T.MeshBasicMaterial({color:'#ade5dd',side:T.DoubleSide}));shallows.rotation.x=Math.PI/2;shallows.position.y=-.265;root.add(shallows);
  const beach=new T.Mesh(new T.ShapeGeometry(shape(1.035)),stone);beach.rotation.x=Math.PI/2;beach.position.y=-.19;root.add(beach);
  const land=new T.Mesh(new T.ExtrudeGeometry(shape(1),{depth:.15,bevelEnabled:true,bevelThickness:.025,bevelSize:.09,bevelSegments:2}),new T.MeshStandardMaterial({color:'#b7d19e',roughness:1,side:T.DoubleSide}));
  land.rotation.x=Math.PI/2;land.position.y=-.075;root.add(land);
  root.add(ribbon(shoreLoop(island,.958).map(p=>v(p.x,p.z)),1.8,'#eee3cb',.01),ribbon(shoreLoop(island,.976).map(p=>v(p.x,p.z)),.18,'#faf3df',.025));

  const avenue=[v(-52,46),v(-22,41),v(-16,19),v(-19,-4),v(4,-8),v(30,0),v(54,19),v(55,48)];
  // A smooth boulevard links the districts; repeated street furniture is batched below.
  if(layout.version==='waterfront-1'){
    root.add(ribbon(avenue,4.8,'#e6e7d9',.012,3),ribbon(avenue,3.25,'#788f92',.04,4),ribbon(avenue,.07,'#f6d482',.065,5));
    const links:[number,number][]=[[-19,-4],[4,-8],[30,0],[54,19],[-16,19],[-22,41],[-37,-21],[28,-32],[55,48],[-52,46]];
    ds.forEach((d,i)=>{
      const local=Array.from({length:9},(_,j)=>{const x=(j-4)*4,p=districtPoint(d,x,streetCurve(x));return v(p.x,p.z);});
      const [x,z]=links[i],link=[v(d.x,d.z),v((d.x+x)/2,(d.z+z)/2),v(x,z)];
      root.add(ribbon(link,3.9,'#e6e7d9',.012,3),ribbon(link,2.5,'#859b9c',.04,4));
      root.add(ribbon(local,3.9,'#e6e7d9',.012,3),ribbon(local,2.5,'#859b9c',.04,4),ribbon(local,.05,'#fff1c4',.065,5));
      for(let j=0;j<6;j++){const p=districtPoint(d,-12+j*.3,streetCurve(-12));box(p.x,.087,p.z,.16,.02,2.1,'#f7f4e5',d.rotation);}
      for(const sign of [-1,1]){const p=districtPoint(d,0,sign*7.55);box(p.x,.12,p.z,1.8,.2,.5,'#cad9bb',d.rotation);box(p.x,.27,p.z,1.65,.18,.43,'#61977b',d.rotation);}
    });
    const outlet=shorePoint(island,Math.PI*.45,1.045),canal=[v(18,7),v(19,25),v(18,36),v(10,49),v(outlet.x,outlet.z)];
    root.add(ribbon(canal,5.5,'#e7ddc7',.09,6),ribbon(canal,3.8,'#42b7cb',.12,7));
    const lake=new T.Mesh(new T.CircleGeometry(1,64),surfaceMaterial('#42b7cb',7));lake.renderOrder=7;lake.rotation.x=-Math.PI/2;lake.scale.set(9,5.6,1);lake.position.set(0,.12,0);root.add(lake);
    const walk=new T.Mesh(new T.RingGeometry(1,1.14,64),surfaceMaterial('#efe3ce',6));walk.renderOrder=6;walk.rotation.x=-Math.PI/2;walk.scale.set(9.1,5.7,1);walk.position.set(0,.09,0);root.add(walk);
    for(const [x,z,angle] of [[18,35,0],[outlet.x,outlet.z*.88,.12]] as const){
      box(x,.25,z,8,.25,2.5,'#e9e3d3',angle);
      for(const sign of [-1,1]){box(x,.72,z+sign*1.12,7.8,.055,.055,'#7a9ba0',angle);for(let j=0;j<5;j++)box(x-3.6+j*1.8,.5,z+sign*1.12,.06,.43,.06,'#a2b6af');}
    }
    const curve=new T.CatmullRomCurve3(avenue);
    for(let i=0;i<9;i++){
      const t=.06+i*.095,p=curve.getPoint(t),dir=curve.getTangent(t),angle=Math.atan2(dir.x,dir.z),side=i%2?-.6:.6;
      p.x+=dir.z*side;p.z-=dir.x*side;
      box(p.x,.22,p.z,.5,.28,1.1,['#f5ce86','#dbeef2','#b3c9ed'][i%3],angle);
      add('glass',p.x,.41,p.z,.42,.16,.53,'#5b9caf',angle);
    }
  }
  for(const p of plots)box(p.x,.027,p.z,3.15,.045,3.15,'#dfe2d2',p.rotation);
  function tree(x:number,z:number,seed:number){
    if(!clear(x,z,2.9))return;
    const color=['#4f9277','#70a77d','#8bb883'][seed%3],size=.85+(seed%4)*.075;
    box(x,.47,z,.12,.84,.12,'#998574');
    if(seed%4===0)add('cone',x,1.20,z,.6*size,1.65*size,.6*size,color);
    else add('leaf',x,1.05,z,.7*size,.92*size,.67*size,color);
    add('shadow',x,.006,z,.78,.78,1,'#3f7960');
  }
  for(const d of ds)for(let j=0;j<18;j++){const x=(j%9-4)*4,z=(j<9?8.6:-8.6)+streetCurve(x),p=districtPoint(d,x,z);tree(p.x,p.z,j+d.id);}
  for(let i=0;i<105;i++){const p=shorePoint(island,i*Math.PI*2/105,.915);tree(p.x,p.z,i);}

  const parks=[[-15,47,9,5],[-20,-42,9,6],[20,48,5,5]];
  parks.forEach(([x,z,sx,sz],i)=>{
    const park=new T.Mesh(new T.CircleGeometry(1,48),surfaceMaterial('#81b694',1));park.renderOrder=1;park.rotation.x=-Math.PI/2;park.position.set(x,.004,z);park.scale.set(sx,sz,1);root.add(park);
    root.add(ribbon([v(x-sx,z),v(x,z-1),v(x+sx,z)],.85,'#f0e4cd',.043));
    for(let j=0;j<12;j++){const a=j*Math.PI/6,px=x+Math.cos(a)*sx*.78,pz=z+Math.sin(a)*sz*.76;tree(px,pz,j+i);}
    if(publicBuildings&&clear(x,z,6.6)){
      const w=i===0?5.8:i===1?5:3.8,d=i===0?3.6:i===1?3.5:3;
      box(x,.09,z,w+1.1,.13,d+1,'#eee4d0');add('glass',x,.76,z,w,1.25,d,'#8dc7d2');
      box(x,1.44,z,w+1,.13,d+.7,'#f3eee4',0,i===1?.09:0);
      for(const sign of [-1,1])for(let j=0;j<5;j++)box(x+(j-2)*w*.2,.78,z+sign*d/2,.055,1.28,.08,'#edf1e7');
      if(i===0)for(let j=0;j<5;j++)box(x+(j-2)*.9,1.59,z,.12,.11,d+.6,'#a3bcc3');
      if(i===1)add('metal',x,1.58,z,w*.6,.1,d*.65,'#638da6',0,-.12);
      if(i===2)for(let j=0;j<6;j++)box(x+(j-2.5)*.65,1.59,z,.09,.08,d+.5,'#c9a26e');
      labels.push({name:['云岸展馆','晴湾艺廊','海风咖啡'][i],x,z,height:1.9});
      root.userData.publicFootprints.push({x,z,radius:Math.hypot(w+1.1,d+1)/2});
    }
  });
  const square=new T.Mesh(new T.CircleGeometry(1,64),surfaceMaterial('#dddcc8',2));square.rotation.x=-Math.PI/2;square.scale.set(5,4,1);square.position.set(-9,.018,18);root.add(square);
  for(let i=0;i<32;i++){const a=i*Math.PI/16,x=-9+Math.cos(a)*4.4,z=18+Math.sin(a)*3.4;if(clear(x,z,3))add('sphere',x,.12,z,.12,.12,.12,i%2?'#ecb1a0':'#e5d19e');}
  for(let i=0;i<48;i++){
    const angle=i*Math.PI*2/48,p=shorePoint(island,angle,.949),{x,z}=p;
    box(x,.28,z,1,.12,.32,'#c9a880',-angle);box(x,.46,z-.15,1,.24,.07,'#c9a880',-angle);
    add('metal',x+1,.96,z,.06,1.9,.06,'#6b8e91');add('sphere',x+1,1.92,z,.13,.10,.13,'#fff3d1');
  }
  for(const angle of [Math.PI*.32,Math.PI*.73]){
    const p=shorePoint(island,angle,1.04),ry=Math.PI/2-angle;
    const local=(x:number,z:number)=>({x:p.x+x*Math.cos(ry)+z*Math.sin(ry),z:p.z-x*Math.sin(ry)+z*Math.cos(ry)});
    const pier=local(0,1.5);box(pier.x,.015,pier.z,2.3,.17,12,'#c6a67b',ry);
    for(let j=0;j<12;j++){const q=local(0,-4+j);box(q.x,.112,q.z,2.2,.035,.055,'#e4ccb0',ry);}
    for(let j=0;j<5;j++)for(const sign of [-1,1]){const q=local(sign*1.15,-3+j*2);box(q.x,.34,q.z,.11,.66,.11,'#edebd7',ry);}
    for(let j=0;j<3;j++){
      const q=local(j%2?3.25:-3.25,-1+j*3),yaw=ry+(j%2?.1:-.15);
      box(q.x,-.20,q.z,1.15,.28,2.7,'#faf9ee',yaw);add('glass',q.x,.03,q.z,.73,.28,1.22,'#67a1b7',yaw);box(q.x,.20,q.z,.80,.055,1.34,'#f0ead7',yaw);
    }
  }
  for(let i=0;i<100;i++){const angle=i*2.39996,p=shorePoint(island,angle,1.14+i%8*.20);add('shadow',p.x,-.28,p.z,1.4+(i%4)*.6,.045,1,'#eff9f6',angle*.3);}

  // Repeated details share seven instanced batches, instead of one draw per prop.
  const unit=new T.BoxGeometry(1,1,1),geometries:Record<Kind,T.BufferGeometry>={box:unit,glass:unit,metal:unit,leaf:new T.IcosahedronGeometry(1,1),cone:new T.ConeGeometry(1,1,7),sphere:new T.SphereGeometry(1,10,7),shadow:new T.CircleGeometry(1,20)};
  const dummy=new T.Object3D();
  for(const [kind,items] of batches){
    const material=kind==='shadow'?new T.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.16,depthWrite:false}):new T.MeshStandardMaterial({roughness:kind==='glass'?.28:kind==='metal'?.4:.85,metalness:kind==='glass'?.17:kind==='metal'?.3:0});
    const mesh=new T.InstancedMesh(geometries[kind],material,items.length);
    for(const [i,p] of items.entries()){
      dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(kind==='shadow'?-Math.PI/2:0,kind==='shadow'?0:p.ry,kind==='shadow'?p.ry:p.rz);dummy.scale.set(p.w,p.h,p.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new T.Color(p.color));
    }
    mesh.userData.kind=kind;root.add(mesh);
  }
  return root;
}
