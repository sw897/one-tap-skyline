import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createFerrisWheel,stepFerrisWheel,WHEEL_PERIOD_SECONDS} from '../src/ferris-wheel.ts';
import {createWaterfront,disposeLandscape} from '../src/city-scene.ts';
import {waterfrontLayout,allPlots} from '../src/core/layout.ts';
import {insideIsland,islandPlan} from '../src/core/island.ts';
test('wheel rotates while all twelve cabins stay upright; disabling freezes exactly',()=>{
 const wheel=createFerrisWheel();for(let i=0;i<525;i++)stepFerrisWheel(wheel,.05,true);
 assert.ok(Math.abs(wheel.userData.rotor.rotation.z-Math.PI/2)<1e-8);wheel.updateMatrixWorld(true);
 for(const cabin of wheel.userData.cabins){const up=new Vector3(0,1,0).transformDirection(cabin.matrixWorld);assert.ok(up.distanceTo(new Vector3(0,1,0))<1e-8);const p=cabin.getWorldPosition(new Vector3());assert.ok(Math.abs(p.distanceTo(wheel.position)-5.1)<1e-8);}
 const angle=wheel.userData.rotor.rotation.z;stepFerrisWheel(wheel,50,false);assert.equal(wheel.userData.rotor.rotation.z,angle);
 stepFerrisWheel(wheel,100,true);assert.ok(wheel.userData.rotor.rotation.z-angle<=.05/WHEEL_PERIOD_SECONDS*Math.PI*2+1e-8);
});
test('peripheral gardens stay clear of player plots, existing roads and coastline',()=>{
 const layout=waterfrontLayout(),before=JSON.stringify(layout),scene=createWaterfront(layout),gardens=scene.userData.peripheralGardens,plots=allPlots(layout),island=islandPlan(layout);
 assert.ok(gardens.length>=4,`only ${gardens.length} gardens`);assert.ok(scene.userData.ferrisWheel);
 for(const g of gardens){for(const p of plots)assert.ok(Math.hypot(g.x-p.x,g.z-p.z)>g.radius+2.6);
 for(const road of scene.userData.roadNetwork.roads)for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((g.x-a.x)*dx+(g.z-a.z)*dz)/(dx*dx+dz*dz||1)));assert.ok(Math.hypot(g.x-a.x-t*dx,g.z-a.z-t*dz)>road.shoulder/2+g.radius+.39);}
 for(let i=0;i<24;i++)assert.ok(insideIsland(island,g.x+Math.cos(i*Math.PI/12)*g.radius,g.z+Math.sin(i*Math.PI/12)*g.radius,.95));}
 assert.equal(JSON.stringify(layout),before);assert.equal(plots.length,76);assert.equal(scene.userData.groundSurfaceCount,1);disposeLandscape(scene);
});

test('exhibition moves toward green district and away from fairground without crossing roads',()=>{
 const scene=createWaterfront(waterfrontLayout()),label=scene.userData.labels.find((l:any)=>l.name==='云岸展馆');assert.ok(label);assert.equal(label.x,-8);assert.equal(label.z,38);assert.ok(Math.hypot(label.x-1,label.z-18)>20);
 assert.ok(Math.hypot(label.x-1,label.z-18)<Math.hypot(-15-1,47-18));assert.ok(Math.hypot(label.x+29,label.z-55)>Math.hypot(-15+29,47-55));
 for(const road of scene.userData.roadNetwork.roads)for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((label.x-a.x)*dx+(label.z-a.z)*dz)/(dx*dx+dz*dz||1)));assert.ok(Math.hypot(label.x-a.x-t*dx,label.z-a.z-t*dz)>road.shoulder/2+4.2);}
 disposeLandscape(scene);
});

test('exhibition lawn and trees share the relocated building origin and stay clear',()=>{
 const scene=createWaterfront(waterfrontLayout()),g=scene.userData.exhibitionGarden,label=scene.userData.labels.find((l:any)=>l.name==='云岸展馆');assert.equal(g.x,label.x);assert.equal(g.z,label.z);assert.ok(g.trees.length>=4);
 for(const tree of g.trees){assert.ok(Math.abs(tree.x-g.x)>4.2);assert.ok(Math.abs(tree.z-g.z)<g.sz);}
 for(let i=0;i<360;i++){const a=i*Math.PI/180,x=g.x+Math.cos(a)*g.sx,z=g.z+Math.sin(a)*g.sz;for(const p of allPlots(waterfrontLayout()))assert.ok(Math.hypot(x-p.x,z-p.z)>2.7);
 for(const road of scene.userData.roadNetwork.roads)for(let j=1;j<road.points.length;j++){const a=road.points[j-1],b=road.points[j],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));assert.ok(Math.hypot(x-a.x-t*dx,z-a.z-t*dz)>road.shoulder/2+.1);}}
 disposeLandscape(scene);
});
