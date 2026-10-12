export type Axis = 'x' | 'z';
export type CutMode = 'single-x' | 'alternate-xz';
export interface Layer { readonly x: number; readonly z: number; readonly width: number; readonly depth: number }
export interface TowerModel {
  readonly baseWidth: number;
  readonly depth: number;
  readonly layerHeight: number;
  readonly baseHeight: number;
  readonly layers: readonly Layer[];
}
export const EPSILON = 1e-8;
export const emptyTower = (): TowerModel => ({ baseWidth: 2.8, depth: 2.2, layerHeight: 0.34, baseHeight: 0.42, layers: [] });
export const topLayer = (tower: TowerModel): Layer => tower.layers.at(-1) ?? { x: 0, z: 0, width: tower.baseWidth, depth: tower.depth };
export const axisForFloor = (floors: number, mode: CutMode): Axis => mode === 'alternate-xz' && floors % 2 === 1 ? 'z' : 'x';
export const towerHeight = (tower: TowerModel) => tower.baseHeight + tower.layers.length * tower.layerHeight;
export const cloneTower = (tower: TowerModel): TowerModel => ({ ...tower, layers: tower.layers.map(layer => ({ ...layer })) });
export type Placement =
  | { kind: 'miss'; tower: TowerModel; axis: Axis }
  | { kind: 'perfect' | 'trimmed'; tower: TowerModel; axis: Axis; cut?: Layer };

export function placeLayer(tower: TowerModel, movingPosition: number, perfectRatio: number, axis: Axis = 'x'): Placement {
  if (!['x', 'z'].includes(axis) || !Number.isFinite(movingPosition) || !Number.isFinite(perfectRatio) || perfectRatio < 0 || perfectRatio > 0.12) throw new Error('Invalid placement input');
  const previous = topLayer(tower);
  const size = axis === 'x' ? 'width' : 'depth', offset = movingPosition - previous[axis];
  if (Math.abs(offset) <= previous[size] * perfectRatio + EPSILON) {
    return { kind: 'perfect', axis, tower: { ...tower, layers: [...tower.layers, { ...previous }] } };
  }
  const left = Math.max(previous[axis] - previous[size] / 2, movingPosition - previous[size] / 2);
  const right = Math.min(previous[axis] + previous[size] / 2, movingPosition + previous[size] / 2);
  if (right - left <= EPSILON) return { kind: 'miss', axis, tower };
  const kept = { ...previous, [axis]: (left + right) / 2, [size]: right - left };
  const cutSize = previous[size] - kept[size];
  const cut = { ...previous, [axis]: offset > 0 ? right + cutSize / 2 : left - cutSize / 2, [size]: cutSize };
  return { kind: 'trimmed', axis, tower: { ...tower, layers: [...tower.layers, kept] }, cut };
}

export function validateTower(tower: TowerModel): boolean {
  if (![tower.baseWidth, tower.depth, tower.layerHeight, tower.baseHeight].every(v => Number.isFinite(v) && v > 0)) return false;
  let previous = topLayer({ ...tower, layers: [] });
  for (const layer of tower.layers) {
    if (![layer.x, layer.z, layer.width, layer.depth].every(Number.isFinite) || layer.width <= EPSILON || layer.depth <= EPSILON) return false;
    for (const axis of ['x', 'z'] as const) {
      const size = axis === 'x' ? 'width' : 'depth';
      if (layer[axis] - layer[size] / 2 < previous[axis] - previous[size] / 2 - EPSILON ||
        layer[axis] + layer[size] / 2 > previous[axis] + previous[size] / 2 + EPSILON) return false;
    }
    previous = layer;
  }
  return true;
}

export function fixtureTower(floors: number, seed = 0, mode: CutMode = 'alternate-xz'): TowerModel {
  let tower = emptyTower();
  for (let i = 0; i < floors; i++) {
    const top = topLayer(tower);
    const axis = axisForFloor(i, mode), scale = axis === 'x' ? 1 : tower.depth / tower.baseWidth;
    const sign = (Math.floor(i / 4) + seed) % 2 ? -1 : 1;
    const offset = ((i + seed) % 5 === 0 ? 0.026 : 0.008) * sign * scale;
    const placed = placeLayer(tower, top[axis] + offset, 0, axis);
    if (placed.kind === 'miss') throw new Error('Fixture has no overlap');
    tower = placed.tower;
  }
  return tower;
}
