import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three';
import { DEFAULT_CONFIG, parseRuntimeConfig, playtestConfig } from '../src/config.ts';
import { emptyTower, placeLayer, topLayer, towerHeight, fixtureTower, validateTower } from '../src/core/tower.ts';
import { GameSession } from '../src/core/game.ts';
import type { CompletedRun } from '../src/core/game.ts';
import { MemoryCityRepository } from '../src/core/city.ts';
import { buildTower } from '../src/render.ts';

test('full overlap is Perfect, adds one real floor, and base is not a floor', () => {
  const base = emptyTower();
  assert.equal(base.layers.length, 0);
  const p = placeLayer(base, 0, 0.035);
  assert.equal(p.kind, 'perfect');
  assert.deepEqual(p.tower.layers, [{ x: 0, z: 0, width: base.baseWidth, depth: base.depth }]);
  assert.equal(towerHeight(p.tower), base.baseHeight + base.layerHeight);
});

test('partial overlaps on both sides conserve kept + cut width and contain the new floor', () => {
  for (const x of [0.8, -0.8, 2.79, -2.79]) {
    const p = placeLayer(emptyTower(), x, 0);
    assert.equal(p.kind, 'trimmed');
    if (p.kind !== 'trimmed') throw new Error('Expected trimmed');
    assert.ok(Math.abs(topLayer(p.tower).width + p.cut!.width - 2.8) < 1e-9);
    assert.ok(validateTower(p.tower));
    assert.ok(Math.abs(topLayer(p.tower).x - x / 2) < 1e-9);
  }
});

test('touching edges and disjoint intervals lose without adding a floor', () => {
  for (const x of [2.8, -2.8, 3.2, -3.2]) {
    const base = emptyTower(), p = placeLayer(base, x, 0);
    assert.equal(p.kind, 'miss'); assert.equal(p.tower, base);
  }
});

test('Perfect tolerance boundary snaps; just outside trims; invalid inputs are rejected', () => {
  const threshold = 2.8 * 0.035;
  assert.equal(placeLayer(emptyTower(), threshold, 0.035).kind, 'perfect');
  assert.equal(placeLayer(emptyTower(), threshold + 1e-5, 0.035).kind, 'trimmed');
  assert.throws(() => placeLayer(emptyTower(), NaN, 0.035));
  assert.throws(() => placeLayer(emptyTower(), 0, 1));
});

test('rapid extra placements are ignored during landing and no combo bonus floors are invented', () => {
  const g = new GameSession(DEFAULT_CONFIG.game);
  for (let i = 0; i < 5; i++) {
    g.movingPosition = topLayer(g.tower)[g.activeAxis]; g.place();
    assert.equal(g.place(), null); assert.equal(g.place(), null);
    assert.equal(g.tower.layers.length, i + 1);
    g.advance(g.config.dropSeconds + 0.001);
  }
  assert.equal(g.perfectCount, 5); assert.equal(g.longestCombo, 5); assert.equal(g.tower.layers.length, 5);
});

test('paused clock/motion do not advance and expired sessions reject input', () => {
  const g = new GameSession(DEFAULT_CONFIG.game), position = g.movingPosition;
  g.pause(); g.advance(100); assert.equal(g.elapsed, 0); assert.equal(g.movingPosition, position); assert.equal(g.place(), null);
  g.resume(); g.advance(60); assert.equal(g.phase, 'ended'); assert.equal(g.endReason, 'time');
  assert.equal(g.place(), null); assert.equal(g.result()!.tower.layers.length, 0);
});

test('elapsed time and motion are consistent across frame sizes', () => {
  const a = new GameSession(DEFAULT_CONFIG.game), b = new GameSession(DEFAULT_CONFIG.game);
  for (let i = 0; i < 120; i++) a.advance(1 / 120);
  for (let i = 0; i < 30; i++) b.advance(1 / 30);
  assert.ok(Math.abs(a.movingPosition - b.movingPosition) < 1e-10);
  assert.ok(Math.abs(a.elapsed - b.elapsed) < 1e-10);
});

const run = (floors: number, seed: number): CompletedRun => ({ runId: crypto.randomUUID(), ended: true, tower: fixtureTower(floors, seed), durationSeconds: 40, perfectCount: 0, longestCombo: 0, reason: 'time' });
test('first / unchanged / 22→26 best reuse identity and new-best complete geometry; duplicate and zero reject', () => {
  const city = new MemoryCityRepository(false), first = run(22, 1), lower = run(19, 2), equal = run(22, 3), best = run(26, 4);
  const inserted = city.submit('local-player', '试玩小楼', first);
  assert.equal(inserted.kind, 'first');
  const identity = inserted.building!;
  const initialSerialized = JSON.stringify(identity);
  assert.equal(city.submit('local-player', '新署名不自动变更', lower).kind, 'unchanged');
  assert.equal(city.submit('local-player', '', equal).kind, 'unchanged');
  assert.equal(JSON.stringify(city.get('local-player')), initialSerialized);
  const update = city.submit('local-player', '另一名字', best);
  assert.equal(update.kind, 'best');
  assert.deepEqual(update.building!.tower, best.tower);
  for (const key of ['playerId', 'plotId', 'color', 'name'] as const) assert.equal(update.building![key], identity[key]);
  assert.ok(Math.abs(towerHeight(update.building!.tower) - towerHeight(identity.tower) - 4 * best.tower.layerHeight) < 1e-9);
  assert.equal(city.submit('local-player', '', best).kind, 'duplicate');
  assert.equal(city.submit('empty-player', '', run(0, 0)).kind, 'invalid');
});

test('both dataset towers generate identical gameplay / result / city basic meshes and score heights', () => {
  for (const floors of [12, 26]) {
    const model = fixtureTower(floors, floors), groups = [buildTower(model, '#75aaff'), buildTower(model, '#75aaff'), buildTower(model, '#75aaff')];
    for (const group of groups) {
      assert.equal(group.userData.model, model);
      assert.equal(group.userData.slabs.count, floors);
      const last = new Matrix4(); group.userData.slabs.getMatrixAt(floors - 1, last);
      const position = new Vector3().setFromMatrixPosition(last);
      const visibleTop = position.y + model.layerHeight / 2 + group.userData.floors.position.y;
      assert.ok(Math.abs(visibleTop - towerHeight(model)) < 1e-6);
      assert.deepEqual(Array.from(group.userData.slabs.instanceMatrix.array), Array.from(groups[0].userData.slabs.instanceMatrix.array));
      group.traverse(object => { if ('isInstancedMesh' in object && object.isInstancedMesh) (object as { dispose(): void }).dispose(); });
    }
  }
});

test('runtime config whitelists values, rejects unsafe display names, and falls back on invalid inputs', () => {
  assert.deepEqual(parseRuntimeConfig(null), DEFAULT_CONFIG);
  const c = parseRuntimeConfig({ cityDisplayName: '活动体验城', game: { roundSeconds: 45, perfectRatio: 0.06 }, unknown: 'ignored' });
  assert.equal(c.cityDisplayName, '活动体验城'); assert.equal(c.game.roundSeconds, 45); assert.equal(c.game.perfectRatio, 0.06);
  assert.equal(parseRuntimeConfig({ cityDisplayName: '<img src=x>', game: { baseSpeed: NaN, comboMilestone: 99 } }).cityDisplayName, '城市天际线');
  assert.equal(parseRuntimeConfig({ game: { baseSpeed: NaN } }).game.baseSpeed, DEFAULT_CONFIG.game.baseSpeed);
});
