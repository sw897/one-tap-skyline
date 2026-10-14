import test from 'node:test';
import assert from 'node:assert/strict';
import { FullCityRepository, isFullCityPreview } from '../src/core/full-city.ts';
import { PALETTE } from '../src/core/city.ts';
import { allPlots, waterfrontLayout } from '../src/core/layout.ts';
import { emptyTower, towerHeight, validateTower } from '../src/core/tower.ts';

for (const layout of [waterfrontLayout(), waterfrontLayout(10, Array(10).fill(16))]) {
  test(`full simulation fills all ${allPlots(layout).length} plots with valid shared geometry and ranking`, () => {
    const buildings = new FullCityRepository(layout).all(), plots = allPlots(layout);
    assert.deepEqual(buildings.map(b => b.plotId).sort((a,b)=>a-b), plots.map(p=>p.id).sort((a,b)=>a-b));
    assert.equal(new Set(buildings.map(b=>b.playerId)).size, plots.length);
    assert.ok(!buildings.some(b=>b.plotId===13));
    assert.deepEqual(new Set(buildings.map(b=>b.color)), new Set(PALETTE));
    assert.deepEqual(new Set(buildings.map(b=>b.tower.layers.length<=12?0:b.tower.layers.length<=24?1:2)),new Set([0,1,2]));
    for (const b of buildings) {
      assert.equal(b.source,'fixture');assert.ok(validateTower(b.tower));
      assert.equal(b.tower.layerHeight,emptyTower().layerHeight);assert.equal(b.tower.baseHeight,emptyTower().baseHeight);
      assert.equal(towerHeight(b.tower),.42+b.tower.layers.length*.34);
      assert.equal(b.rank,1+buildings.filter(other=>other.tower.layers.length>b.tower.layers.length).length);
    }
  });
}
test('full simulation is read-only, repeatable and restricted to the explicit display URL',()=>{
  const city=new FullCityRepository(waterfrontLayout()),before=city.all();
  assert.deepEqual(city.submit(),{kind:'invalid'});assert.deepEqual(city.all(),before);
  assert.deepEqual(new FullCityRepository(waterfrontLayout()).all(),before);
  assert.equal(isFullCityPreview(new URLSearchParams('mode=display&demo=full')),true);
  for(const query of ['demo=full','mode=shared&demo=full','mode=display','mode=practice&demo=full'])assert.equal(isFullCityPreview(new URLSearchParams(query)),false);
});
