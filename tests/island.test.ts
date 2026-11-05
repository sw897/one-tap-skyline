import test from 'node:test';
import assert from 'node:assert/strict';
import {waterfrontLayout,occupiedLayout,layoutCapacity,allPlots} from '../src/core/layout.ts';
import {islandPlan,insideIsland,shoreLoop,islandBounds} from '../src/core/island.ts';
test('default six-district map immediately accommodates existing sixty plots',()=>{
  const layout=occupiedLayout(waterfrontLayout(),60);assert.equal(layout.districtCount,6);assert.equal(layoutCapacity(layout),76);
  assert.equal(new Set(allPlots(layout).map(p=>p.id)).size,76);
});
test('lower development capacity never hides previously allocated plots',()=>{
  const layout=occupiedLayout(waterfrontLayout(),160);assert.equal(layout.districtCount,10);assert.equal(layoutCapacity(layout),160);assert.equal(allPlots(layout).length,160);
  assert.throws(()=>occupiedLayout(waterfrontLayout(),161));
});
for(const count of [6,10])test(`island coastline encloses all padded plots with${count} districts`,()=>{
  const layout=waterfrontLayout(count,Array(10).fill(16)),island=islandPlan(layout);
  for(const p of allPlots(layout))for(const dx of [-2.4,2.4])for(const dz of [-2.4,2.4])assert.ok(insideIsland(island,p.x+dx,p.z+dz,.9),`plot${p.id} corner outside island`);
  const shore=shoreLoop(island),bounds=islandBounds(island);assert.equal(shore.length,161);assert.ok(Math.hypot(shore[0].x-shore[160].x,shore[0].z-shore[160].z)<1e-8);
  assert.ok(bounds.width>0&&bounds.depth>0);
  assert.equal(shore.filter(p=>Math.abs(p.x-bounds.maxX)<1e-6).length,1);
});
