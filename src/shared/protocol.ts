import type { CityBuilding, CityUpdate } from '../core/city.ts';
import type { GameConfig } from '../config.ts';
import type { CityLayout, PlotLocation } from '../core/layout.ts';
export type SharedCityId = 'public' | 'test' | 'test-mobile';
export type SnapshotScope = 'all' | 'own';
export interface RankedBuilding extends CityBuilding { rank: number }
export interface CityEvent {
  id:number; epoch:string; revision:number; runId:string; kind:'first'|'best'; playerId:string;
  plotId:number; name:string; previousFloors:number; floors:number; globalRecord:boolean; createdAt:number;
}
export interface CitySnapshot {
  cityId: SharedCityId; epoch: string; revision: number; name: string; isTest: boolean; writeOpen: boolean;
  capacity: number; buildings: RankedBuilding[];
  scope?: SnapshotScope; totalBuildings?: number;
  photoWriteOpen?: boolean;
  resetAt?: number;
  layout?:CityLayout; ownLocation?:PlotLocation;
  events?:CityEvent[]; latestEventId?:number; eventGap?:boolean;
}
export interface SharedSession { playerId: string; color:string; snapshot: CitySnapshot; rules: GameConfig; rulesetId: string; activeRunId: string | null }
export interface StartReceipt { runId: string; expiresAt: number; rules: GameConfig; rulesetId: string }
export interface SubmissionReceipt { kind: CityUpdate['kind'] | 'zero' | 'full'; runId: string; floors: number; revision: number; building?: CityBuilding; previous?: CityBuilding }
export interface SubmissionResponse { receipt: SubmissionReceipt; duplicate: boolean; snapshot: CitySnapshot }
