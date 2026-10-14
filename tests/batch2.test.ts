import test from 'node:test';
import assert from 'node:assert/strict';
import {facadePreviewRects,fullWallFacade} from '../src/core/facade.ts';
import {emptyTower,placeLayer,fixtureTower,topLayer} from '../src/core/tower.ts';
import {terracePlan} from '../src/core/terraces.ts';
import {createAmbient,stepAmbient} from '../src/ambient.ts';
import {waterfrontLayout,allPlots} from '../src/core/layout.ts';
import {insideIsland,islandPlan} from '../src/core/island.ts';
import {waterfrontRoads} from '../src/core/roads.ts';
for(const n of [1,12,13,24,25])test(`photo preview samples actual facade UVs at ${n} floors`,()=>{
 const model=fixtureTower(n,3),{uvs}=fullWallFacade(model),rects=facadePreviewRects(model);
 assert.equal(rects.length,n);rects.forEach((r,i)=>{assert.equal(r.sx,uvs[i*12]*512);assert.equal(r.sy,(1-uvs[i*12+5])*768);assert.ok(r.sw>0&&r.sh>0);assert.ok(r.sx+r.sw<=512.000001&&r.sy+r.sh<=768.000001);});
});
test('terraces sit on exposed supported strips, clear upper floor and stay bounded',()=>{
 let model=emptyTower();for(let i=0;i<8;i++){const axis=i%2?'z':'x';model=placeLayer(model,topLayer(model)[axis]+.34,0,axis).tower;}
 const before=JSON.stringify(model),plan=terracePlan(model);assert.ok(plan.length>0&&plan.length<=6);
 for(const r of plan){const i=Math.round(r.y/model.layerHeight)-1,a=model.layers[i],b=model.layers[i+1];assert.ok(r.x-r.width/2>=a.x-a.width/2&&r.x+r.width/2<=a.x+a.width/2);assert.ok(r.z-r.depth/2>=a.z-a.depth/2&&r.z+r.depth/2<=a.z+a.depth/2);assert.ok(r.x+r.width/2<=b.x-b.width/2||r.x-r.width/2>=b.x+b.width/2||r.z+r.depth/2<=b.z-b.depth/2);assert.ok(r.height<=model.layerHeight*.24);}
 assert.equal(JSON.stringify(model),before);assert.deepEqual(terracePlan(fixtureTower(30)),[]);
});
test('ambient routes remain in water or on flat real road segments and freeze when disabled',()=>{
 const layout=waterfrontLayout(),root=createAmbient(layout),island=islandPlan(layout),roads=waterfrontRoads(layout),plots=allPlots(layout);
 assert.ok(root.userData.motions.filter((m:any)=>!m.boat).length<=3);
 for(const m of root.userData.motions)for(let i=0;i<=100;i++){const p=m.a.clone().lerp(m.b,i/100);
  if(m.boat)assert.equal(insideIsland(island,p.x,p.z),false);
  else{assert.ok(plots.every(plot=>Math.hypot(p.x-plot.x,p.z-plot.z)>2));assert.ok(roads.bridges.every(b=>Math.hypot(p.x-b.x,p.z-b.z)>b.length/2+3));}
 }
 stepAmbient(root,.04,true);const time=root.userData.elapsed,positions=root.children.map(c=>c.position.toArray());stepAmbient(root,10,false);assert.equal(root.userData.elapsed,time);assert.deepEqual(root.children.map(c=>c.position.toArray()),positions);
 stepAmbient(root,100,true);assert.ok(root.userData.elapsed-time<=.0500001);
});
