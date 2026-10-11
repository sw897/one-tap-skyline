export interface Layer { readonly x: number; readonly width: number }
export interface TowerModel {
  readonly baseWidth: number;
  readonly depth: number;
  readonly layerHeight: number;
  readonly baseHeight: number;
  readonly layers: readonly Layer[];
}
export const EPSILON = 1e-8;
export const emptyTower = (): TowerModel => ({ baseWidth: 2.8, depth: 2.2, layerHeight: 0.34, baseHeight: 0.42, layers: [] });
export const topLayer = (tower: TowerModel): Layer => tower.layers.at(-1) ?? { x: 0, width: tower.baseWidth };
export const towerHeight = (tower: TowerModel) => tower.baseHeight + tower.layers.length * tower.layerHeight;
export const cloneTower = (tower: TowerModel): TowerModel => ({ ...tower, layers: tower.layers.map(layer => ({ ...layer })) });
export type Placement =
  | { kind: 'miss'; tower: TowerModel }
  | { kind: 'perfect' | 'trimmed'; tower: TowerModel; cut?: Layer };

export function placeLayer(tower: TowerModel, movingX: number, perfectRatio: number): Placement {
  if (!Number.isFinite(movingX) || !Number.isFinite(perfectRatio) || perfectRatio < 0 || perfectRatio > 0.12) throw new Error('Invalid placement input');
  const previous = topLayer(tower);
  const offset = movingX - previous.x;
  if (Math.abs(offset) <= previous.width * perfectRatio + EPSILON) {
    return { kind: 'perfect', tower: { ...tower, layers: [...tower.layers, { ...previous }] } };
  }
  const left = Math.max(previous.x - previous.width / 2, movingX - previous.width / 2);
  const right = Math.min(previous.x + previous.width / 2, movingX + previous.width / 2);
  if (right - left <= EPSILON) return { kind: 'miss', tower };
  const kept = { x: (left + right) / 2, width: right - left };
  const cutWidth = previous.width - kept.width;
  const cut = { x: offset > 0 ? right + cutWidth / 2 : left - cutWidth / 2, width: cutWidth };
  return { kind: 'trimmed', tower: { ...tower, layers: [...tower.layers, kept] }, cut };
}

export function validateTower(tower: TowerModel): boolean {
  if (![tower.baseWidth, tower.depth, tower.layerHeight, tower.baseHeight].every(v => Number.isFinite(v) && v > 0)) return false;
  let previous: Layer = { x: 0, width: tower.baseWidth };
  for (const layer of tower.layers) {
    if (!Number.isFinite(layer.x) || !Number.isFinite(layer.width) || layer.width <= EPSILON ||
      layer.x - layer.width / 2 < previous.x - previous.width / 2 - EPSILON ||
      layer.x + layer.width / 2 > previous.x + previous.width / 2 + EPSILON) return false;
    previous = layer;
  }
  return true;
}

export function fixtureTower(floors: number, seed = 0): TowerModel {
  let tower = emptyTower();
  for (let i = 0; i < floors; i++) {
    const top = topLayer(tower);
    const offset = ((i + seed) % 5 === 0 ? 0.026 : 0.008) * (seed % 2 ? -1 : 1);
    const placed = placeLayer(tower, top.x + offset, 0);
    if (placed.kind === 'miss') throw new Error('Fixture has no overlap');
    tower = placed.tower;
  }
  return tower;
}
