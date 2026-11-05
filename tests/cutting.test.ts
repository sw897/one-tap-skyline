import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three';
import { DEFAULT_CONFIG, parseRuntimeConfig, playtestConfig } from '../src/config.ts';
import { axisForFloor, emptyTower, placeLayer, topLayer, validateTower, fixtureTower, towerHeight } from '../src/core/tower.ts';
import type { Axis, CutMode, Layer } from '../src/core/tower.ts';
import { GameSession } from '../src/core/game.ts';
import { MemoryCityRepository } from '../src/core/city.ts';
import { buildTower, layerTint } from '../src/render.ts';

const close = (a: number, b: number, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const area = (layer: Layer) => layer.width * layer.depth;

for (const axis of ['x', 'z'] as const) {
  test(`${axis}: both cut sides preserve the other axis, area and exact cut boundary`, () => {
    const base = emptyTower(), size = axis === 'x' ? 'width' : 'depth', inactive = axis === 'x' ? 'z' : 'x';
    const inactiveSize = axis === 'x' ? 'depth' : 'width';
    const previous = topLayer(base);
    for (const sign of [-1, 1]) for (const fraction of [0.01, 0.25, 0.6, 0.999999]) {
      const moving = sign * previous[size] * fraction, p = placeLayer(base, moving, 0, axis);
      assert.equal(p.kind, 'trimmed'); if (p.kind !== 'trimmed' || !p.cut) throw new Error('Missing real cut');
      const kept = topLayer(p.tower), cut = p.cut;
      close(area(kept) + area(cut), area(previous));
      close(kept[axis], moving / 2); close(kept[size], previous[size] - Math.abs(moving));
      close(cut[axis] - sign * cut[size] / 2, kept[axis] + sign * kept[size] / 2);
      for (const layer of [kept, cut]) { assert.equal(layer[inactive], previous[inactive]); assert.equal(layer[inactiveSize], previous[inactiveSize]); }
      assert.ok(validateTower(p.tower)); assert.equal(p.tower.layers.length, 1);
    }
  });
  test(`${axis}: Perfect uses active size, keeps rectangle; touching/disjoint and invalid input reject`, () => {
    const first = placeLayer(emptyTower(), 1.2, 0, 'x').tower, previous = topLayer(first);
    const size = axis === 'x' ? 'width' : 'depth', tolerance = previous[size] * 0.035;
    const p = placeLayer(first, previous[axis] + tolerance, 0.035, axis);
    assert.equal(p.kind, 'perfect'); assert.deepEqual(topLayer(p.tower), previous);
    assert.equal(placeLayer(first, previous[axis] + tolerance + 1e-5, 0.035, axis).kind, 'trimmed');
    for (const sign of [-1, 1]) for (const fraction of [1, 1.01, 2]) {
      const lost = placeLayer(first, previous[axis] + sign * previous[size] * fraction, 0, axis);
      assert.equal(lost.kind, 'miss'); assert.equal(lost.tower, first);
    }
    assert.throws(() => placeLayer(first, Infinity, 0, axis));
    assert.throws(() => placeLayer(first, 0, -0.1, axis));
  });
}

test('alternate mode switches X/Z by success only; pause/repeated taps do not skip direction', () => {
  const g = new GameSession(DEFAULT_CONFIG.game), axes: Axis[] = [];
  for (let i = 0; i < 8; i++) {
    axes.push(g.activeAxis); g.pause(); const axis = g.activeAxis;
    g.advance(1); assert.equal(g.activeAxis, axis); assert.equal(g.place(), null); g.resume();
    g.movingPosition = topLayer(g.tower)[g.activeAxis]; const p = g.place();
    assert.equal(p?.axis, axis); assert.equal(g.place(), null);
    assert.equal(g.tower.layers.length, i + 1); assert.equal(g.activeAxis, i % 2 === 0 ? 'z' : 'x');
    g.advance(g.config.dropSeconds + 0.001);
  }
  assert.deepEqual(axes, ['x','z','x','z','x','z','x','z']);
  assert.equal(g.perfectCount, 8); assert.equal(g.longestCombo, 8);
  assert.deepEqual(topLayer(g.tower), topLayer(emptyTower()));
});

test('X/Z motion normalizes period to base dimension and reverses each axis entry side', () => {
  const g = new GameSession({ ...DEFAULT_CONFIG.game, speedStep: 0 }), periods: number[] = [], sides: number[] = [];
  for (let i = 0; i < 4; i++) {
    periods.push(2 * g.movementRange / g.speed);
    sides.push(Math.sign(g.movingPosition - topLayer(g.tower)[g.activeAxis]));
    const ratio = (g.movingPosition - topLayer(g.tower)[g.activeAxis]) / g.axisBaseSize;
    g.advance(0.2);
    close(Math.abs((g.movingPosition - topLayer(g.tower)[g.activeAxis]) / g.axisBaseSize - ratio), DEFAULT_CONFIG.game.baseSpeed / g.tower.baseWidth * 0.2);
    g.movingPosition = topLayer(g.tower)[g.activeAxis]; g.place(); g.advance(g.config.dropSeconds + 0.001);
  }
  periods.forEach(p => close(p, periods[0])); assert.deepEqual(sides, [1,1,-1,-1]);
});

test('fixed-X baseline preserves P1 movement range, speed and constant Z facade', () => {
  const g = new GameSession({ ...DEFAULT_CONFIG.game, cutMode: 'single-x' });
  for (let i = 0; i < 8; i++) {
    assert.equal(g.activeAxis, 'x'); close(g.movementRange, 2.8 * 1.35);
    close(g.speed, 2.7 + i * 0.035);
    g.movingPosition = topLayer(g.tower).x + 0.12; g.place();
    assert.equal(topLayer(g.tower).z, 0); assert.equal(topLayer(g.tower).depth, 2.2);
    g.advance(g.config.dropSeconds + 0.001);
  }
});

test('alternating actual cuts form nested rectangles on four sides with score-derived height', () => {
  let model = emptyTower();
  for (let i = 0; i < 26; i++) {
    const axis = axisForFloor(i, 'alternate-xz'), top = topLayer(model), size = axis === 'x' ? 'width' : 'depth';
    const p = placeLayer(model, top[axis] + (i % 4 < 2 ? 1 : -1) * top[size] * 0.08, 0, axis);
    assert.equal(p.kind, 'trimmed'); model = p.tower; assert.ok(validateTower(model));
  }
  const top = topLayer(model); assert.ok(top.width < model.baseWidth); assert.ok(top.depth < model.depth);
  assert.ok(top.x - top.width / 2 > -model.baseWidth / 2 && top.x + top.width / 2 < model.baseWidth / 2);
  assert.ok(top.z - top.depth / 2 > -model.depth / 2 && top.z + top.depth / 2 < model.depth / 2);
  close(towerHeight(model), 9.26);
});

test('validator rejects invalid depth, Z escape and nonfinite X/Z dimensions', () => {
  const model = fixtureTower(2), top = topLayer(model);
  for (const change of [{ depth: 0 }, { depth: NaN }, { z: Infinity }, { z: 3 }, { width: Infinity }, { x: 3 }])
    assert.equal(validateTower({ ...model, layers: [...model.layers.slice(0,-1), { ...top, ...change }] }), false);
});

test('both modes share exact slab geometry and facade positions in all three views', () => {
  for (const mode of ['single-x','alternate-xz'] as const) for (const floors of [12,26]) {
    const model = fixtureTower(floors, 2, mode), groups = Array.from({length:3}, () => buildTower(model,'#75aaff'));
    for (const group of groups) {
      const {slabs,windows,slots} = group.userData;
      for (let i = 0; i < floors; i++) {
        const layer = model.layers[i], matrix = new Matrix4(); slabs.getMatrixAt(i,matrix);
        const p = new Vector3().setFromMatrixPosition(matrix), scale = new Vector3().setFromMatrixScale(matrix);
        close(p.x,layer.x,1e-6); close(p.z,layer.z,1e-6); close(scale.x,layer.width,1e-6); close(scale.z,layer.depth,1e-6);
        // Center windows on all four faces; P5 replaced the old front-only layout.
        for(let face=0;face<4;face++){
          windows.getMatrixAt(i*12+4+face,matrix);const window=new Vector3().setFromMatrixPosition(matrix),sign=face%2===0?1:-1;
          if(face<2){close(window.x,layer.x,1e-6);close(window.z,layer.z+sign*(layer.depth/2+.009),1e-6);}
          else{close(window.z,layer.z,1e-6);close(window.x,layer.x+sign*(layer.width/2+.009),1e-6);}
        }
        if (i<slots.count) { slots.getMatrixAt(i,matrix); const slot = new Vector3().setFromMatrixPosition(matrix);close(slot.z,layer.z+layer.depth/2+0.025,1e-6); }
      }
      assert.deepEqual(Array.from(slabs.instanceMatrix.array),Array.from(groups[0].userData.slabs.instanceMatrix.array));
      group.traverse(object => { if ('isInstancedMesh' in object && object.isInstancedMesh) (object as {dispose():void}).dispose(); });
    }
    const tint=layerTint('#75aaff',floors-1); assert.ok(Number.isFinite(tint.r+tint.g+tint.b));
  }
});

test('first, unchanged and best can use different modes; best replaces complete model without joining floors', () => {
  const city = new MemoryCityRepository(false);
  const run = (n:number,mode:CutMode) => ({runId:crypto.randomUUID(),ended:true as const,tower:fixtureTower(n,3,mode),durationSeconds:40,perfectCount:0,longestCombo:0,reason:'time' as const});
  const first=run(12,'single-x'), low=run(9,'alternate-xz'), equal=run(12,'alternate-xz'), best=run(16,'alternate-xz');
  const entry=city.submit('test','试玩小楼',first).building!;
  assert.equal(city.submit('test','换名字',low).kind,'unchanged'); assert.equal(city.submit('test','',equal).kind,'unchanged');
  assert.deepEqual(city.get('test'),entry);
  const update=city.submit('test','',best); assert.equal(update.kind,'best'); assert.deepEqual(update.building!.tower,best.tower);
  for(const key of ['plotId','name','color'] as const)assert.equal(update.building![key],entry[key]);
});

test('runtime and comparison URL accept only approved modes and preserve 60-second baseline', () => {
  assert.equal(parseRuntimeConfig({game:{cutMode:'free-rotate'}}).game.cutMode,'alternate-xz');
  assert.equal(parseRuntimeConfig({game:{cutMode:'single-x'}}).game.cutMode,'single-x');
  const baseline=playtestConfig(DEFAULT_CONFIG,'?cut=single-x&roundSeconds=999&cityDisplayName=other');
  assert.deepEqual(baseline,{...DEFAULT_CONFIG,game:{...DEFAULT_CONFIG.game,cutMode:'single-x'}});
  assert.equal(baseline.game.roundSeconds,60);
  assert.equal(playtestConfig(DEFAULT_CONFIG,'?cut=unknown'),DEFAULT_CONFIG);
});
