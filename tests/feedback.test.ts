import test from 'node:test';
import assert from 'node:assert/strict';
import {cueTones,landingHaptic} from '../src/ui/game-audio.ts';
import {facadeWindowColor} from '../src/render.ts';
import {buildTower} from '../src/render.ts';
import {fixtureTower} from '../src/core/tower.ts';
import {Color} from 'three';
import {createWaterfront,disposeLandscape} from '../src/city-scene.ts';
import {PALETTE} from '../src/core/city.ts';
import {routeStreet,groundPixels,pointPlotDistance} from '../src/core/ground.ts';
import {allPlots,waterfrontLayout} from '../src/core/layout.ts';

test('ordinary, Perfect and miss cues differ, ordinary stays in phone-range frequencies and combo is capped',()=>{
  const ordinary=cueTones('trimmed'),perfect=cueTones('perfect'),miss=cueTones('miss');
  assert.equal(ordinary.length,1);assert.equal(perfect.length,2);assert.notDeepEqual(ordinary,miss);
  assert.ok(ordinary[0].frequency>=400&&ordinary[0].gain>=.1);assert.deepEqual(cueTones('perfect',8),cueTones('perfect',100));
});
test('haptic compatibility failures never throw or block feedback',()=>{
  const oldDocument=globalThis.document,oldNavigator=globalThis.navigator;
  Object.defineProperty(globalThis,'document',{value:{hidden:false},configurable:true});Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});assert.equal(landingHaptic('perfect'),false);
  const patterns:unknown[]=[];Object.defineProperty(globalThis,'navigator',{value:{vibrate(p:unknown){patterns.push(p);return true;}},configurable:true});assert.equal(landingHaptic('trimmed'),true);assert.equal(landingHaptic('perfect'),true);assert.notDeepEqual(patterns[0],patterns[1]);
  Object.defineProperty(globalThis,'document',{value:oldDocument,configurable:true});Object.defineProperty(globalThis,'navigator',{value:oldNavigator,configurable:true});
});
test('13+ and25+ glass colors differ across all six chosen colors without mutating shared materials',()=>{
  for(const tier of [1,2])assert.equal(new Set(PALETTE.map(c=>facadeWindowColor(c,tier,0).getHexString())).size,6);
  const first=buildTower(fixtureTower(13),PALETTE[0]),before=new Color();first.userData.windows.getColorAt(0,before);
  const second=buildTower(fixtureTower(13),PALETTE[5]),after=new Color(),other=new Color();first.userData.windows.getColorAt(0,after);second.userData.windows.getColorAt(0,other);
  assert.equal(after.getHexString(),before.getHexString());assert.notEqual(after.getHexString(),other.getHexString());
});
test('one ground texture paints intersections once and leaves the player footprint empty',()=>{
  const points=[{x:-10,z:-10},{x:10,z:-10},{x:10,z:10}],other=[{x:-10,z:-10},{x:10,z:10},{x:-10,z:10}],extent={minX:-10,maxX:10,minZ:-10,maxZ:10},size=101;
  const triangles=[{points,height:.04,color:0x788f92},{points:other,height:.04,color:0x788f92},{points,height:.065,color:0xf6d482}];
  const data=groundPixels(triangles,[{x:0,z:0,rotation:.2}],extent,size);
  const sample=(x:number,z:number)=>Array.from(data.slice((z*size+x)*4,(z*size+x)*4+3));
  assert.deepEqual(sample(50,50),[183,209,158]);assert.deepEqual(sample(80,20),[246,212,130]);assert.equal(data.byteLength,size*size*4);
});
test('static street route detours around a plot and all returned nodes have road clearance',()=>{
  const plots=[{x:0,z:0,rotation:.2}],route=routeStreet([{x:-12,z:0},{x:12,z:0}],plots,3.9);
  assert.ok(route.length>2);for(const p of route)assert.ok(pointPlotDistance(p,plots[0])>=3.9/2+.25-1e-7);
  const before=JSON.stringify(allPlots(waterfrontLayout()));routeStreet([{x:-52,z:46},{x:-22,z:41}],allPlots(waterfrontLayout()),4.8);assert.equal(JSON.stringify(allPlots(waterfrontLayout())),before);
});
for(const districts of [6,10])test(`${districts} districts use one bounded terrain surface without coplanar road meshes`,()=>{
  const scene=createWaterfront(waterfrontLayout(districts));assert.equal(scene.userData.groundSurfaceCount,1);assert.ok(scene.userData.groundTextureBytes<10*1024*1024);assert.ok(scene.userData.routedStreets>0);
  disposeLandscape(scene);
});
