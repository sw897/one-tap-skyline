import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Matrix4,Vector3} from 'three';
import {fullWallFacade} from '../src/core/facade.ts';
import {emptyTower,fixtureTower,placeLayer,topLayer,towerHeight} from '../src/core/tower.ts';
import {MemoryCityRepository} from '../src/core/city.ts';
import {buildTower,decorateRank} from '../src/render.ts';
import {createWaterfront,disposeLandscape} from '../src/city-scene.ts';
import {allPlots,waterfrontLayout} from '../src/core/layout.ts';
import {insideIsland,islandPlan} from '../src/core/island.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
for(const floors of [1,12,24,35])test(`full ${floors}-floor photo covers every actual face without bridging setbacks`,()=>{
  const model=fixtureTower(floors,3),f=fullWallFacade(model);
  assert.equal(f.positions.length,floors*18);assert.equal(f.uvs.length,floors*12);
  let area=0;
  for(let i=0;i<floors;i++){
    const p=f.positions.slice(i*18,(i+1)*18),l=model.layers[i];
    for(let j=0;j<6;j++){
      assert.ok(p[j*3]>=l.x-l.width/2-1e-9&&p[j*3]<=l.x+l.width/2+1e-9);
      near(p[j*3+2],l.z+l.depth/2+.032);
    }
    near(Math.min(...p.filter((_,j)=>j%3===1)),i*model.layerHeight);
    near(Math.max(...p.filter((_,j)=>j%3===1)),(i+1)*model.layerHeight);
    near(Math.max(...p.filter((_,j)=>j%3===0))-Math.min(...p.filter((_,j)=>j%3===0)),l.width);
    area+=l.width*model.layerHeight;
  }
  assert.ok(area>0);assert.ok(f.uvs.every(x=>x>=0&&x<=1));
  const left=Math.min(...model.layers.map(l=>l.x-l.width/2)),right=Math.max(...model.layers.map(l=>l.x+l.width/2));
  const uvWidth=Math.max(...f.uvs.filter((_,i)=>i%2===0))-Math.min(...f.uvs.filter((_,i)=>i%2===0));
  const uvHeight=Math.max(...f.uvs.filter((_,i)=>i%2===1))-Math.min(...f.uvs.filter((_,i)=>i%2===1));
  near(uvWidth/uvHeight,(right-left)/(floors*model.layerHeight)/(2/3));
});
test('empty photo has no geometry; narrow cut walls remain finite and inside their original floor',()=>{
  assert.deepEqual(fullWallFacade(emptyTower()),{positions:[],uvs:[]});
  const t=emptyTower(),placed=placeLayer(t,t.baseWidth-.00001,0);
  assert.notEqual(placed.kind,'miss');const f=fullWallFacade(placed.tower);
  assert.ok(f.positions.every(Number.isFinite));assert.ok(f.uvs.every(Number.isFinite));
});
for(const [floors,tier] of [[1,0],[12,0],[13,1],[24,1],[25,2],[35,2]])test(`${floors} floors select tier ${tier} without changing score/slab/roof footprint`,()=>{
  const model=fixtureTower(floors,1),before=JSON.stringify(model),group=buildTower(model,'#75aaff'),top=topLayer(model);
  assert.equal(group.userData.tier,tier);assert.equal(group.userData.logicalHeight,towerHeight(model));
  for(let i=0;i<floors;i++){
    const matrix=new Matrix4();group.userData.slabs.getMatrixAt(i,matrix);const p=new Vector3().setFromMatrixPosition(matrix),s=new Vector3().setFromMatrixScale(matrix),l=model.layers[i];
    near(p.x,l.x);near(p.z,l.z);near(s.x,l.width);near(s.z,l.depth);near(s.y,model.layerHeight);
  }
  group.updateMatrixWorld(true);const bounds=new Box3().setFromObject(group.userData.roof);
  assert.ok(bounds.min.x>=top.x-top.width/2&&bounds.max.x<=top.x+top.width/2);
  assert.ok(bounds.min.z>=top.z-top.depth/2&&bounds.max.z<=top.z+top.depth/2);
  assert.equal(JSON.stringify(model),before);
});
test('official top 1/2/3 decorations differ, fit narrow real roofs and update/remove without adding floors',()=>{
  for(const model of [fixtureTower(28),placeLayer(emptyTower(),2.65,0).tower]){
    const group=buildTower(model,'#75aaff'),height=towerHeight(model),top=topLayer(model),before=JSON.stringify(model),shapes=[];
    for(const rank of [1,2,3]){
      decorateRank(group,rank);group.updateMatrixWorld(true);const b=new Box3().setFromObject(group.userData.crown);
      assert.ok(b.min.x>=top.x-top.width/2-1e-6&&b.max.x<=top.x+top.width/2+1e-6);
      assert.ok(b.min.z>=top.z-top.depth/2-1e-6&&b.max.z<=top.z+top.depth/2+1e-6);
      assert.ok(b.max.y>height+.8);near(group.userData.logicalHeight,height);assert.equal(JSON.stringify(model),before);
      shapes.push(group.userData.crown.children.length+':'+group.userData.crown.children.map((x:{position:Vector3})=>x.position.y).join(','));
    }
    if(Math.min(top.width,top.depth)>.3)assert.equal(new Set(shapes).size,3);
    decorateRank(group,4);assert.equal(group.userData.crown,undefined);assert.equal(group.userData.decorationHeight,0);
  }
});
test('simulation uses the same 1/1/3 tie semantics and does not invent a second place',()=>{
  const city=new MemoryCityRepository(true),tower=fixtureTower(28);
  city.submit('local-tie','模拟同分',{runId:'tie',ended:true,reason:'time',tower,perfectCount:0,longestCombo:0,durationSeconds:60});
  assert.deepEqual(city.all().slice(0,3).map(b=>b.rank),[1,1,3]);assert.equal(city.get('local-tie')?.rank,1);
});
for(const count of [6,10])test(`public background architecture has names and does not occupy player plots in ${count} districts`,()=>{
  const layout=waterfrontLayout(count,Array(10).fill(16)),scene=createWaterfront(layout),plots=allPlots(layout);
  assert.ok(scene.userData.labels.length>0);
  for(const footprint of scene.userData.publicFootprints)for(const p of plots)assert.ok(Math.hypot(p.x-footprint.x,p.z-footprint.z)>footprint.radius+2.25);
  disposeLandscape(scene);const without=createWaterfront(layout,false);assert.equal(without.userData.labels.length,0);disposeLandscape(without);
});

test('six-district amenities have distinct landmarks and clear player plots, roads and shoreline',()=>{
  const layout=waterfrontLayout(),scene=createWaterfront(layout),plan=islandPlan(layout);
  assert.deepEqual(scene.userData.decorativeFeatures,['fairground','shopping-arcade','waterfront-market','garden-pavilion']);
  const roads=scene.userData.roadNetwork.roads;
  // New facilities use conservative circular bounds; ground plazas and paths are not scored buildings.
  for(const f of scene.userData.publicFootprints.slice(0,5)){
    for(let i=0;i<32;i++)assert.ok(insideIsland(plan,f.x+Math.cos(i*Math.PI/16)*f.radius,f.z+Math.sin(i*Math.PI/16)*f.radius));
    for(const road of roads)for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((f.x-a.x)*dx+(f.z-a.z)*dz)/(dx*dx+dz*dz||1)));
      assert.ok(Math.hypot(f.x-a.x-t*dx,f.z-a.z-t*dz)>f.radius+road.shoulder/2,`amenity at ${f.x},${f.z} crosses ${road.id}`);
    }
  }
  assert.equal(scene.userData.groundSurfaceCount,1);disposeLandscape(scene);
});
