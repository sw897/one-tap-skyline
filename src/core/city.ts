import type { CompletedRun } from './game.ts';
import { cloneTower, fixtureTower, validateTower } from './tower.ts';
import type { CutMode, TowerModel } from './tower.ts';

export const PALETTE = ['#75aaff', '#73cbbb', '#ffb084', '#baa0ef', '#f29ea9', '#edcb73'];
export const playerColor = (publicId:string) => PALETTE[(Number.parseInt(publicId.replaceAll('-','').slice(0,8),16)||0)%PALETTE.length];
export interface CityBuilding {
  readonly playerId: string;
  readonly plotId: number;
  readonly color: string;
  readonly name: string;
  readonly tower: TowerModel;
  readonly bestRunId: string;
  readonly source: 'fixture' | 'local-session' | 'shared';
}
export type CityUpdate = { kind: 'first' | 'unchanged' | 'best' | 'duplicate' | 'invalid'; building?: CityBuilding; previous?: CityBuilding };
export interface CityRepository {
  all(): CityBuilding[];
  get(playerId: string): CityBuilding | undefined;
  submit(playerId: string, name: string, run: CompletedRun): CityUpdate;
}
export const cleanName = (value: string) => Array.from(value.replace(/[<>\u0000-\u001f]/gu, '').trim()).slice(0, 16).join('') || '我的小楼';

export class MemoryCityRepository implements CityRepository {
  private buildings = new Map<string, CityBuilding>();
  private submitted = new Set<string>();
  constructor(withFixtures = true, mode: CutMode = 'alternate-xz') {
    if (withFixtures) [28, 22, 18, 25, 13, 20, 9, 16, 24, 11, 19, 7].forEach((floors, index) => {
      const id = `sample-${index + 1}`;
      this.buildings.set(id, { playerId: id, plotId: index, color: PALETTE[index % PALETTE.length], name: ['晴空', '薄荷', '杏子', '暮云', '花间', '暖阳'][index % 6] + ` ${String(index + 1).padStart(2, '0')}`, tower: fixtureTower(floors, index, mode), bestRunId: `fixture-${index}`, source: 'fixture' });
    });
  }
  all() { return [...this.buildings.values()].sort((a, b) => b.tower.layers.length - a.tower.layers.length); }
  get(playerId: string) { return this.buildings.get(playerId); }
  submit(playerId: string, name: string, run: CompletedRun): CityUpdate {
    if (!playerId || run.ended !== true || !run.runId || run.tower.layers.length === 0 || !validateTower(run.tower)) return { kind: 'invalid' };
    const existing = this.get(playerId);
    if (this.submitted.has(run.runId)) return { kind: 'duplicate', building: existing };
    this.submitted.add(run.runId);
    if (existing && run.tower.layers.length <= existing.tower.layers.length) return { kind: 'unchanged', building: existing, previous: existing };
    const building: CityBuilding = existing
      ? { ...existing, tower: cloneTower(run.tower), bestRunId: run.runId }
      : { playerId, plotId: 14, color: PALETTE[0], name: cleanName(name), tower: cloneTower(run.tower), bestRunId: run.runId, source: 'local-session' };
    this.buildings.set(playerId, building);
    return { kind: existing ? 'best' : 'first', building, previous: existing };
  }
}
