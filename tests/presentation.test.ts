import test from 'node:test';
import assert from 'node:assert/strict';
import {CameraControl,NoticeQueue,intersectsBox} from '../src/core/presentation.ts';
import {arrangeLabels,overlaps} from '../src/core/label-layout.ts';
import type {CityEvent} from '../src/shared/protocol.ts';
const event=(id:number,player='p'+id,record=false):CityEvent=>({id,revision:id,plotId:id,epoch:'day',playerId:player,runId:'r'+id,kind:'best',name:'模拟楼',floors:id+1,previousFloors:id,createdAt:0,globalRecord:record});
test('notices coalesce without extending the original queue age and discard stale runs',()=>{
  const q=new NoticeQueue();q.push(event(1,'p'),0);q.push(event(2,'p'),19_000);assert.equal(q.length,1);assert.equal(q.take(20_001,()=>true),undefined);
  q.push(event(3),21_000);q.push(event(4),21_001);assert.equal(q.take(21_002,e=>e.runId==='r4')?.id,4);assert.equal(q.length,0);
});
test('20-item bounded queue preserves record priority, then arrival order, and clears on reset',()=>{
  const q=new NoticeQueue();q.push(event(1,'record',true),0);for(let i=2;i<=22;i++)q.push(event(i),i);
  assert.equal(q.length,20);assert.equal(q.take(30,()=>true)?.id,1);assert.equal(q.take(31,()=>true)?.id,4);q.clear();assert.equal(q.take(32,()=>true),undefined);
});
test('manual idle, dragging and explicit pause override notices until correctly released',()=>{
  const c=new CameraControl();assert.equal(c.notice(0,4500),true);assert.equal(c.notice(100,4500),false);
  c.manual(200,20_000);assert.equal(c.busy(201),false);assert.equal(c.notice(20_199,4500),false);assert.equal(c.notice(20_200,4500),true);
  c.dragging=true;assert.equal(c.automatic(50_000),false);c.dragging=false;c.toggle();assert.equal(c.automatic(100_000),false);c.manual(100_000,20_000);assert.equal(c.automatic(200_000),false);c.toggle();assert.equal(c.automatic(200_000),true);
});
test('preset path checker rejects a crossed box and camera inside it, accepts overhead paths',()=>{
  const b={minX:-2,maxX:2,minY:0,maxY:10,minZ:-2,maxZ:2};
  assert.equal(intersectsBox({x:-10,y:5,z:0},{x:10,y:5,z:0},b),true);
  assert.equal(intersectsBox({x:0,y:5,z:0},{x:0,y:5,z:0},b),true);
  assert.equal(intersectsBox({x:-10,y:12,z:0},{x:10,y:12,z:0},b),false);
});
test('dense long names stay individually present; priority labels avoid panels',()=>{
  const anchors=Array.from({length:76},(_,i)=>({id:'p'+i,x:300+i%4,y:200+i%4,width:200,height:30,priority:i===0?100:0}));
  const result=arrangeLabels(anchors,900,600,[{x:650,y:0,width:250,height:600}]);
  assert.ok(result.placed.has('p0'));assert.equal(result.placed.size,76);assert.equal('clusters' in result,false);
  const rects=[...result.placed].map(([id,o])=>{const a=anchors.find(a=>a.id===id)!;return {x:a.x-a.width/2+o.dx,y:a.y-a.height+o.dy,width:a.width,height:a.height};});
  assert.ok(rects.every(r=>!overlaps(r,{x:650,y:0,width:250,height:600})));
  const again=arrangeLabels(anchors,900,600,[],result.placed);assert.deepEqual(again.placed.get('p0'),result.placed.get('p0'));
});
