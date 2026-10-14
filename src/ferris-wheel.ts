import * as T from 'three';
export const WHEEL_PERIOD_SECONDS=105;
/** The rotor turns around its axle; each hanging cabin cancels that rotation. */
export function createFerrisWheel(){
 const root=new T.Group(),rotor=new T.Group();root.position.set(-34,6.4,55);root.add(rotor);
 const metal=new T.MeshStandardMaterial({color:'#e7f0eb',roughness:.6}),rimMaterial=new T.MeshStandardMaterial({color:'#f0aa84',metalness:.15,roughness:.5});
 const rimGeometry=new T.TorusGeometry(5.1,.11,6,48),spokeGeometry=new T.CylinderGeometry(.055,.055,5.1,6),box=new T.BoxGeometry(1,1,1);
 const glass=new T.MeshStandardMaterial({color:'#dbf2ef',roughness:.4}),colors=['#f3b08c','#83c6c2','#9bb9dc'].map(color=>new T.MeshStandardMaterial({color,roughness:.6}));
 for(const z of [-.65,.65]){const rim=new T.Mesh(rimGeometry,rimMaterial);rim.position.z=z;rotor.add(rim);}
 const cabins:T.Group[]=[];
 for(let i=0;i<12;i++){
  const angle=i*Math.PI/6,point=new T.Vector3(Math.cos(angle)*5.1,Math.sin(angle)*5.1,0),spoke=new T.Mesh(spokeGeometry,metal);
  spoke.position.copy(point).multiplyScalar(.5);spoke.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),point.clone().normalize());rotor.add(spoke);
  const cabin=new T.Group();cabin.position.copy(point);const body=new T.Mesh(box,colors[i%3]),window=new T.Mesh(box,glass);
  body.scale.set(1,.8,1.4);body.position.y=-.5;window.scale.set(.65,.4,.03);window.position.set(0,-.35,.72);cabin.add(body,window);rotor.add(cabin);cabins.push(cabin);
 }
 root.userData.rotor=rotor;root.userData.cabins=cabins;root.userData.elapsed=0;return root;
}
export function stepFerrisWheel(wheel:T.Group,seconds:number,enabled:boolean){
 if(!enabled)return;
 wheel.userData.elapsed=(wheel.userData.elapsed+Math.max(0,Math.min(.05,seconds)))%WHEEL_PERIOD_SECONDS;
 const angle=wheel.userData.elapsed/WHEEL_PERIOD_SECONDS*Math.PI*2;
 wheel.userData.rotor.rotation.z=angle;for(const cabin of wheel.userData.cabins)cabin.rotation.z=-angle;
}
