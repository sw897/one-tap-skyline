import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,PerspectiveCamera} from 'three';
import {CityCamera} from '../src/city-camera.ts';
import {SkylineRenderer,buildTower} from '../src/render.ts';
import {DEFAULT_CONFIG} from '../src/config.ts';
import {waterfrontLayout} from '../src/core/layout.ts';
import {fixtureTower,towerHeight} from '../src/core/tower.ts';
import type {CityBuilding} from '../src/core/city.ts';

const b=(floors:number):CityBuilding=>({playerId:'synthetic',plotId:0,name:'模拟楼',color:'#73cbbb',tower:fixtureTower(floors),bestRunId:'r'+floors,source:'fixture'});
function camera(){
  const document={addEventListener(){},removeEventListener(){}};
  const canvas={style:{},addEventListener(){},removeEventListener(){},getRootNode:()=>document,ownerDocument:document} as unknown as HTMLCanvasElement;
  globalThis.matchMedia=(()=>({matches:false})) as unknown as typeof matchMedia;
  const camera=new CityCamera(canvas,waterfrontLayout(6),DEFAULT_CONFIG,true);camera.resize(1920,1080);camera.setEnabled(true);return camera;
}
test('selected building refresh neither retargets manual inspection nor restarts an active notice',()=>{
  const c=camera();c.setBuildings([b(12)]);c.focus(b(12));for(let i=0;i<30;i++)c.update(.1);
  const before=c.camera.position.toArray(),target=c.controls.target.toArray();c.setBuildings([b(25)]);c.update(0);
  assert.deepEqual(c.camera.position.toArray(),before);assert.deepEqual(c.controls.target.toArray(),target);assert.equal(c.notice(b(25)),0);
  c.toggle();assert.equal(c.status().paused,true);assert.equal(c.notice(b(25)),0);c.toggle();const duration=c.notice(b(25));assert.ok(duration>0);
  for(let i=0;i<25;i++)c.update(.1);const during=c.camera.position.toArray();c.setBuildings([b(35)]);c.update(0);assert.deepEqual(c.camera.position.toArray(),during);assert.equal(c.notice(b(35)),0);
  c.dispose();
});
test('setCity immediately renders a full latest tower at scale 1 without stretching facade height',()=>{
  // Exercise actual renderer update without starting WebGL; not a browser preview.
  const renderer=Object.create(SkylineRenderer.prototype) as SkylineRenderer;
  Object.assign(renderer,{layout:waterfrontLayout(6),config:DEFAULT_CONFIG,city:new Group(),cityObjects:new Map(),cityCamera:{setBuildings(){},selectedId(){return undefined;}}});
  renderer.setCity([b(12)]);renderer.setCity([b(25)],{kind:'best',building:b(25),previous:b(12)});
  const geometry=renderer.cityGeometry('synthetic')!;
  assert.equal(geometry.displayedHeight,towerHeight(b(25).tower));assert.equal(geometry.logicalHeight,geometry.displayedHeight);assert.equal(geometry.model.layers.length,25);
});
test('rooftop-only name hides when its roof is outside view, then returns when framed',()=>{
  const building=b(60),group=buildTower(building.tower,building.color);group.updateMatrixWorld(true);
  const camera=new PerspectiveCamera(44,1,1,2500);camera.position.set(0,5,4);camera.lookAt(0,5,0);camera.updateMatrixWorld(true);
  const renderer=Object.create(SkylineRenderer.prototype) as SkylineRenderer;Object.assign(renderer,{width:700,height:700,cityCamera:{camera},cityObjects:new Map([[building.playerId,group]])});
  const label=renderer.projectLabel(building);assert.equal(label.visible,false);
  camera.position.set(0,40,75);camera.lookAt(0,10,0);camera.updateMatrixWorld(true);
  assert.equal(renderer.projectLabel(building).visible,true);
});

test('manual click focus finishes in configured2.5 seconds while automatic transition stays7 seconds',()=>{
 const c=camera();c.setBuildings([b(12)]);c.focus(b(12));for(let i=0;i<25;i++)c.update(.1);const target=c.camera.position.toArray();c.update(.1);assert.deepEqual(c.camera.position.toArray(),target);assert.equal(DEFAULT_CONFIG.visual.tourTransitionSeconds,7);c.dispose();
});
