import { PALETTE, randomBuildingName, type CityBuilding, type CityRepository, type CityUpdate } from './city.ts';
import { allPlots, type CityLayout } from './layout.ts';
import { fixtureTower, type CutMode } from './tower.ts';

/** Explicit display-only simulation; never registers players or saves scores. */
export const isFullCityPreview = (search: URLSearchParams) => search.get('mode') === 'display' && search.get('demo') === 'full';

export class FullCityRepository implements CityRepository {
  private readonly buildings: CityBuilding[];
  constructor(layout: CityLayout, mode: CutMode = 'alternate-xz') {
    this.buildings = allPlots(layout).map((plot, index) => {
      const playerId = `demo-full-${plot.id}`;
      const floors = 4 + (index * 17 + 9) % 39;
      return { playerId, plotId: plot.id, color: PALETTE[index % PALETTE.length],
        name: randomBuildingName(playerId), tower: fixtureTower(floors, index, mode),
        bestRunId: playerId, source: 'fixture' as const };
    }).sort((a, b) => b.tower.layers.length - a.tower.layers.length);
    this.buildings = this.buildings.map(building => ({ ...building,
      rank: 1 + this.buildings.filter(other => other.tower.layers.length > building.tower.layers.length).length }));
  }
  all() { return [...this.buildings]; }
  get(playerId: string) { return this.buildings.find(building => building.playerId === playerId); }
  submit(): CityUpdate { return { kind: 'invalid' }; }
}
