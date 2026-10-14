import * as T from 'three';
import {allPlots,districtPoint,districtsFor,streetCurve,type CityLayout} from './core/layout.ts';
import {islandPlan,shoreLoop,shorePoint} from './core/island.ts';
import {groundPixels,type GroundTriangle} from './core/ground.ts';
import {waterfrontRoads} from './core/roads.ts';
export interface SceneryLabel {name:string;x:number;z:number;height:number}
const v=(x:number,z:number,y=.035)=>new T.Vector3(x,y,z);
// Ordered ground overlays still use depth testing: bridges/buildings occlude them.
function surfaceMaterial(color:string,order:number){
  return new T.MeshStandardMaterial({color,roughness:.9,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-order*.25,polygonOffsetUnits:-order*2});
}
function makeRibbon(points:T.Vector3[],width:number,color:string,y=.035,order=2,linear=false){
  if(linear){
    const p:number[]=[];
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],normal=new T.Vector3(-(b.z-a.z),0,b.x-a.x).normalize().multiplyScalar(width/2);
      for(const q of [a.clone().add(normal),a.clone().sub(normal),b.clone().add(normal),a.clone().sub(normal),b.clone().sub(normal),b.clone().add(normal)])p.push(q.x,y,q.z);
    }
    // Round joins stay inside the routed centerline clearance; no spline overshoot.
    for(const q of points)for(let j=0;j<12;j++){
      p.push(q.x,y,q.z,q.x+Math.cos(j*Math.PI/6)*width/2,y,q.z+Math.sin(j*Math.PI/6)*width/2,q.x+Math.cos((j+1)*Math.PI/6)*width/2,y,q.z+Math.sin((j+1)*Math.PI/6)*width/2);
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(p,3));geometry.computeVertexNormals();
    const mesh=new T.Mesh(geometry,surfaceMaterial(color,order));mesh.renderOrder=order;return mesh;
  }
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
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
  group.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o instanceof T.InstancedMesh)o.dispose();}});
  for(const g of geometries)g.dispose();for(const m of materials){const texture=(m as T.MeshStandardMaterial).map;if(texture)textures.add(texture);m.dispose();}for(const texture of textures)texture.dispose();group.removeFromParent();group.clear();
}

/** Original procedural scenery; public architecture never enters scores/player data. */
export function createWaterfront(layout:CityLayout,publicBuildings=true){
  const root=new T.Group(),island=islandPlan(layout),ds=districtsFor(layout),plots=allPlots(layout);
  const network=layout.version==='waterfront-1'?waterfrontRoads(layout):undefined;
  const ribbon=makeRibbon;
  const stone=new T.MeshStandardMaterial({color:'#ece6d5',roughness:.9,side:T.DoubleSide});
  const labels:SceneryLabel[]=[];root.userData.labels=labels;root.userData.publicFootprints=[];
  const civic=publicBuildings&&layout.districtCount===6;
  const civicPlots=civic?[{x:-34,z:55,radius:7},{x:-18,z:58,radius:4},{x:8,z:-43,radius:11},{x:41,z:43,radius:6},{x:-53,z:-26,radius:5}]:[];
  root.userData.decorativeFeatures=[];
  type Kind='box'|'glass'|'metal'|'leaf'|'cone'|'sphere'|'shadow';
  type Item={x:number;y:number;z:number;w:number;h:number;d:number;color:string;ry:number;rz:number};
  const batches=new Map<Kind,Item[]>();
  function add(kind:Kind,x:number,y:number,z:number,w:number,h:number,d:number,color:string,ry=0,rz=0){
    if(!batches.has(kind))batches.set(kind,[]);batches.get(kind)!.push({x,y,z,w,h,d,color,ry,rz});
  }
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:string,ry=0,rz=0)=>add('box',x,y,z,w,h,d,color,ry,rz);
  const clear=(x:number,z:number,r=3)=>plots.every(p=>Math.hypot(x-p.x,z-p.z)>r);
  const clearRoad=(x:number,z:number,r=.65)=>!network||network.roads.every(road=>road.points.slice(1).every((b,i)=>{
    const a=road.points[i],dx=b.x-a.x,dz=b.z-a.z,t=T.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
    return Math.hypot(x-a.x-t*dx,z-a.z-t*dz)>road.shoulder/2+r;
  }));
  // Ocean and shallow-water bands extend into an open horizon, without a board edge.
  const ocean=new T.Mesh(new T.CircleGeometry(10000,96),new T.MeshBasicMaterial({color:'#88d4e0',toneMapped:false}));ocean.rotation.x=-Math.PI/2;ocean.position.set(island.x,-.33,island.z);root.add(ocean);
  const shape=(scale:number)=>new T.Shape(shoreLoop(island,scale).slice(0,-1).map(p=>new T.Vector2(p.x,p.z)));
  const waterBand=shape(1.115);waterBand.holes.push(new T.Path(shoreLoop(island,1.036).slice(0,-1).reverse().map(p=>new T.Vector2(p.x,p.z))));
  const shallows=new T.Mesh(new T.ShapeGeometry(waterBand),new T.MeshBasicMaterial({color:'#ade5dd',side:T.DoubleSide}));shallows.rotation.x=Math.PI/2;shallows.position.y=-.265;root.add(shallows);
  const beach=new T.Mesh(new T.ShapeGeometry(shape(1.035)),stone);beach.rotation.x=Math.PI/2;beach.position.y=-.19;root.add(beach);
  const land=new T.Mesh(new T.ExtrudeGeometry(shape(1),{depth:.15,bevelEnabled:true,bevelThickness:.025,bevelSize:.09,bevelSegments:2}),new T.MeshStandardMaterial({color:'#b7d19e',roughness:1,side:T.DoubleSide}));
  land.rotation.x=Math.PI/2;land.position.y=-.075;root.add(land);
  root.add(ribbon(shoreLoop(island,.958).map(p=>v(p.x,p.z)),1.8,'#eee3cb',.01),ribbon(shoreLoop(island,.976).map(p=>v(p.x,p.z)),.18,'#faf3df',.025));

  if(network){
    for(const road of network.roads){
      const points=road.points.map(p=>v(p.x,p.z));
      const color=road.id==='avenue'?'#788f92':road.id==='island-loop'?'#91a6a1':'#859b9c';
      root.add(ribbon(points,road.shoulder,'#e6e7d9',.012,3,true),ribbon(points,road.width,color,.04,4,true),ribbon(points,.06,'#f6d482',.065,5,true));
    }
    ds.forEach(d=>{
      for(let j=0;j<6;j++){const p=districtPoint(d,-12+j*.3,streetCurve(-12));box(p.x,.087,p.z,.16,.02,2.1,'#f7f4e5',d.rotation);}
      for(const sign of [-1,1]){const p=districtPoint(d,0,sign*7.55);box(p.x,.12,p.z,1.8,.2,.5,'#cad9bb',d.rotation);box(p.x,.27,p.z,1.65,.18,.43,'#61977b',d.rotation);}
    });
    const canal=network.canal.map(p=>v(p.x,p.z));
    root.add(ribbon(canal,5.5,'#e7ddc7',.09,6,true),ribbon(canal,3.8,'#42b7cb',.12,7,true));
    const lake=new T.Mesh(new T.CircleGeometry(1,64),surfaceMaterial('#42b7cb',7));lake.renderOrder=7;lake.rotation.x=-Math.PI/2;lake.scale.set(9,5.6,1);lake.position.set(0,.12,0);root.add(lake);
    const walk=new T.Mesh(new T.RingGeometry(1,1.14,64),surfaceMaterial('#efe3ce',6));walk.renderOrder=6;walk.rotation.x=-Math.PI/2;walk.scale.set(9.1,5.7,1);walk.position.set(0,.09,0);root.add(walk);
    for(const bridge of network.bridges){
      const {x,z,rotation,length,width}=bridge;
      box(x,.23,z,width,.25,length,'#e9e3d3',rotation);box(x,.365,z,width-.15,.025,length,'#788f92',rotation);
      for(const [index,sign] of [-1,1].entries()){
        const landing=bridge.landings[index],dx=landing.x-x,dz=landing.z-z;
        const x1=Math.cos(rotation)*dx-Math.sin(rotation)*dz,z1=Math.sin(rotation)*dx+Math.cos(rotation)*dz;
        const position:number[]=[],z0=sign*length/2;
        for(const q of [[-width/2,.378,z0],[width/2,.378,z0],[x1-width/2,.045,z1],[width/2,.378,z0],[x1+width/2,.045,z1],[x1-width/2,.045,z1]])position.push(...q);
        const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(position,3));geometry.computeVertexNormals();
        const ramp=new T.Mesh(geometry,new T.MeshStandardMaterial({color:'#788f92',roughness:.9,side:T.DoubleSide}));ramp.position.set(x,0,z);ramp.rotation.y=rotation;root.add(ramp);
      }
      for(const sign of [-1,1]){
        const nx=Math.cos(rotation)*sign*width/2,nz=-Math.sin(rotation)*sign*width/2;
        box(x+nx,.69,z+nz,.06,.055,length,'#7a9ba0',rotation);
        for(let j=0;j<5;j++){const along=(j/4-.5)*(length-.2);box(x+nx+Math.sin(rotation)*along,.5,z+nz+Math.cos(rotation)*along,.06,.38,.06,'#a2b6af');}
      }
    }
    const curve=new T.CatmullRomCurve3(network.roads.find(road=>road.id==='avenue')!.points.map(p=>v(p.x,p.z)));
    for(let i=0;i<9;i++){
      const t=.06+i*.095,p=curve.getPoint(t),dir=curve.getTangent(t),angle=Math.atan2(dir.x,dir.z),side=i%2?-.6:.6;
      p.x+=dir.z*side;p.z-=dir.x*side;
      box(p.x,.22,p.z,.5,.28,1.1,['#f5ce86','#dbeef2','#b3c9ed'][i%3],angle);
      add('glass',p.x,.41,p.z,.42,.16,.53,'#5b9caf',angle);
    }
  }
  for(const p of plots)box(p.x,.027,p.z,3.15,.045,3.15,'#dfe2d2',p.rotation);
  function tree(x:number,z:number,seed:number){
    if(!clear(x,z,2.9)||!clearRoad(x,z)||civicPlots.some(p=>Math.hypot(x-p.x,z-p.z)<p.radius+1))return;
    const color=['#4f9277','#70a77d','#8bb883'][seed%3],size=.85+(seed%4)*.075;
    box(x,.47,z,.12,.84,.12,'#998574');
    if(seed%4===0)add('cone',x,1.20,z,.6*size,1.65*size,.6*size,color);
    else add('leaf',x,1.05,z,.7*size,.92*size,.67*size,color);
    add('shadow',x,.006,z,.78,.78,1,'#3f7960');
  }
  for(const d of ds)for(let j=0;j<18;j++){const x=(j%9-4)*4,z=(j<9?8.6:-8.6)+streetCurve(x),p=districtPoint(d,x,z);tree(p.x,p.z,j+d.id);}
  for(let i=0;i<105;i++){const p=shorePoint(island,i*Math.PI*2/105,.89);tree(p.x,p.z,i);}

  if(civic){
    const plaza=(x:number,z:number,w:number,d:number,color='#e8dfcb')=>{
      const mesh=new T.Mesh(new T.PlaneGeometry(w,d),surfaceMaterial(color,2));mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.022,z);root.add(mesh);
    };
    const beam=(a:T.Vector3,b:T.Vector3,r:number,color:string)=>{
      const mesh=new T.Mesh(new T.CylinderGeometry(r,r,a.distanceTo(b),8),new T.MeshStandardMaterial({color,roughness:.6}));
      mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());root.add(mesh);
    };
    // A low seaside fairground, with one airy landmark instead of a solid tall block.
    plaza(-29,55,29,14);const wheelX=-34,wheelZ=55,center=new T.Vector3(wheelX,6.4,wheelZ);
    for(const z of [wheelZ-.65,wheelZ+.65]){
      const rim=new T.Mesh(new T.TorusGeometry(5.1,.11,6,48),new T.MeshStandardMaterial({color:'#f0aa84',metalness:.15,roughness:.5}));rim.position.set(wheelX,6.4,z);root.add(rim);
      for(const side of [-1,1])beam(new T.Vector3(wheelX+side*2.1,.2,z+side*.3),new T.Vector3(wheelX,6.4,z),.13,'#e8eee7');
    }
    for(let j=0;j<12;j++){
      const a=j*Math.PI/6,q=new T.Vector3(wheelX+Math.cos(a)*5.1,6.4+Math.sin(a)*5.1,wheelZ);
      beam(center,q,.055,'#e7f0eb');box(q.x,q.y-.5,q.z,1,.8,1.4,['#f3b08c','#83c6c2','#9bb9dc'][j%3]);add('glass',q.x,q.y-.35,q.z+.72,.65,.4,.03,'#dbf2ef');
    }
    box(-18,.18,58,6.8,.3,6.8,'#e9c9a2');add('cone',-18,3.25,58,3.7,1.9,3.7,'#e99794');
    box(-18,1.5,58,.22,2.5,.22,'#e8d9ba');
    for(let j=0;j<8;j++){const a=j*Math.PI/4,x=-18+Math.cos(a)*2.55,z=58+Math.sin(a)*2.55;box(x,1.5,z,.055,2.5,.055,'#f3e5be');box(x,.8,z,.8,.42,.5,j%2?'#a6c6e6':'#f2c07b',-a);}
    labels.push({name:'海湾游乐园',x:-29,z:55,height:11.8});root.userData.decorativeFeatures.push('fairground');
    // A stepped two-storey shopping arcade leaves the player's skyline dominant.
    plaza(8,-43,23,15);box(8,1.1,-43,18,2.1,8,'#ebe3d6');add('glass',8,1.05,-38.96,16,1.65,.08,'#83b9c3');
    box(8,2.22,-43,19,.22,9,'#f5efdf');box(9,3.05,-44,12,1.5,5,'#bfd4ca');add('glass',9,3.05,-41.45,11,1.2,.06,'#86b9c7');box(9,3.87,-44,13,.18,6,'#f3eadd');
    for(let j=0;j<7;j++){const x=1+j*2.3;box(x,1.95,-38.5,1.8,.12,1,'#f2b495');box(x,1.03,-38.82,.09,1.8,.12,'#f6eee0');}
    plaza(8,-32.5,19,5,'#d8dfcb');for(let j=0;j<5;j++){box(j*3+2,.2,-33,1.6,.32,.7,'#c4a581');tree(j*4-1,-30.8,j);}
    plaza(4,-56,22,8,'#a9b7b0');
    for(let j=0;j<8;j++){box(-5+j*2.5,.052,-56,.07,.02,5.5,'#f1efdb');if(j%3!==0){box(-3.8+j*2.5,.35,-56,1.1,.5,2.3,j%2?'#a3bed0':'#e7b39a');add('glass',-3.8+j*2.5,.67,-56,.88,.25,1.2,'#6e9da8');}}
    labels.push({name:'晴湾生活广场',x:8,z:-43,height:4.3});root.userData.decorativeFeatures.push('shopping-arcade');
    // Waterfront market and west garden occupy distinct gaps rather than every lawn.
    plaza(41,43,12,9);for(let j=0;j<3;j++){const x=37+j*4;box(x,.8,43,3,1.5,3.5,'#f0e3cc');box(x,1.65,43,3.5,.18,4,j%2?'#99c6b4':'#efb591');add('glass',x,.95,45,2.5,.85,.05,'#88bac6');box(x,.4,46.3,1.6,.65,.7,'#c4a37a');}
    labels.push({name:'水岸集市',x:41,z:43,height:2.1});root.userData.decorativeFeatures.push('waterfront-market');
    plaza(-53,-26,10,8,'#dce1c8');box(-53,.7,-26,5,1.2,4,'#cbded2');add('glass',-53,1.55,-26,5.2,.8,4.2,'#9cc6c8');box(-53,2.02,-26,5.8,.12,4.8,'#f0e7cd');
    labels.push({name:'花园书屋',x:-53,z:-26,height:2.3});root.userData.decorativeFeatures.push('garden-pavilion');
    for(const p of civicPlots)root.userData.publicFootprints.push(p);
    // Short footpaths connect the amenities, leaving the ring road and canal intact.
    for(const path of [[[-34,48],[-34,44]],[[-18,51],[-15,49]],[[8,-35.5],[8,-32.5]],[[41,38.5],[48,37]],[[ -53,-22],[-52,-14]]]){
      root.add(ribbon(path.map(([x,z])=>v(x,z)),1.1,'#e9dfc6',.028,2,true));
    }
    for(let j=0;j<18;j++){tree(-42+(j%6)*6,-48-Math.floor(j/6)*4,j);tree(29+(j%6)*4,51+Math.floor(j/6)*3,j+2);}
  }

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
  const triangles:GroundTriangle[]=[],remove:T.Mesh[]=[];
  root.traverse(object=>{
    if(!(object instanceof T.Mesh)||object instanceof T.InstancedMesh||!(object.material instanceof T.MeshStandardMaterial)||!object.material.polygonOffset)return;
    object.updateMatrix();const position=object.geometry.getAttribute('position'),index=object.geometry.index,color=object.material.color.getHex();
    for(let i=0;i<(index?.count??position.count);i+=3){const points=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(position,index?index.getX(i+j):i+j).applyMatrix4(object.matrix));
      triangles.push({points:points.map(p=>({x:p.x,z:p.z})),height:points.reduce((s,p)=>s+p.y,0)/3,color});
    }
    remove.push(object);
  });
  const border=shoreLoop(island),extent={minX:Math.min(...border.map(p=>p.x)),maxX:Math.max(...border.map(p=>p.x)),minZ:Math.min(...border.map(p=>p.z)),maxZ:Math.max(...border.map(p=>p.z))};
  const size=1536,texture=new T.DataTexture(groundPixels(triangles,plots,extent,size),size,size,T.RGBAFormat);
  texture.colorSpace=T.SRGBColorSpace;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  const geometry=new T.ShapeGeometry(shape(1)),positions=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
  for(let i=0;i<positions.count;i++)uv.setXY(i,(positions.getX(i)-extent.minX)/(extent.maxX-extent.minX),(positions.getY(i)-extent.minZ)/(extent.maxZ-extent.minZ));
  const ground=new T.Mesh(geometry,new T.MeshStandardMaterial({map:texture,roughness:.9,side:T.DoubleSide}));ground.rotation.x=Math.PI/2;ground.position.y=.003;root.add(ground);
  for(const mesh of remove){mesh.geometry.dispose();(mesh.material as T.Material).dispose();mesh.removeFromParent();}
  root.userData.groundSurfaceCount=1;root.userData.routedStreets=network?.roads.length??0;root.userData.groundTextureBytes=size*size*4;
  root.userData.roadNetwork=network;
  return root;
}
