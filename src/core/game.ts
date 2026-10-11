import type { GameConfig } from '../config.ts';
import { cloneTower, emptyTower, placeLayer, topLayer } from './tower.ts';
import type { Placement, TowerModel } from './tower.ts';
import { temporaryId } from './session-id.ts';

export interface CompletedRun {
  readonly runId: string;
  readonly ended: true;
  readonly tower: TowerModel;
  readonly durationSeconds: number;
  readonly perfectCount: number;
  readonly longestCombo: number;
  readonly reason: 'miss' | 'time';
}
export type GamePhase = 'moving' | 'dropping' | 'paused' | 'ended';
export class GameSession {
  readonly runId = temporaryId();
  readonly config: GameConfig;
  tower = emptyTower();
  phase: GamePhase = 'moving';
  movingX = 0;
  elapsed = 0;
  combo = 0;
  perfectCount = 0;
  longestCombo = 0;
  endReason: 'miss' | 'time' = 'miss';
  private direction = -1;
  private dropRemaining = 0;
  private phaseBeforePause: 'moving' | 'dropping' = 'moving';

  constructor(config: GameConfig) { this.config = { ...config }; this.nextBlock(); }
  get remaining() { return Math.max(0, this.config.roundSeconds - this.elapsed); }
  get speed() { return this.config.baseSpeed + this.tower.layers.length * this.config.speedStep; }
  get hasMovingBlock() { return this.phase === 'moving' || (this.phase === 'paused' && this.phaseBeforePause === 'moving'); }
  get isLanding() { return this.phase === 'dropping' || (this.phase === 'paused' && this.phaseBeforePause === 'dropping'); }
  private nextBlock() {
    const sign = this.tower.layers.length % 2 === 0 ? 1 : -1;
    this.direction = -sign;
    this.movingX = topLayer(this.tower).x + sign * this.tower.baseWidth * 1.35;
    this.phase = 'moving';
  }
  advance(seconds: number) {
    if (this.phase === 'paused' || this.phase === 'ended' || !Number.isFinite(seconds) || seconds <= 0) return;
    this.elapsed = Math.min(this.config.roundSeconds, this.elapsed + seconds);
    if (this.remaining === 0) { this.endReason = 'time'; this.phase = 'ended'; return; }
    if (this.phase === 'dropping') {
      this.dropRemaining -= seconds;
      if (this.dropRemaining <= 0) this.nextBlock();
      return;
    }
    const center = topLayer(this.tower).x, range = this.tower.baseWidth * 1.35;
    let relative = this.movingX - center + this.direction * this.speed * seconds;
    while (relative > range || relative < -range) {
      if (relative > range) { relative = 2 * range - relative; this.direction = -1; }
      if (relative < -range) { relative = -2 * range - relative; this.direction = 1; }
    }
    this.movingX = center + relative;
  }
  place(): Placement | null {
    if (this.phase !== 'moving') return null;
    const placed = placeLayer(this.tower, this.movingX, this.config.perfectRatio);
    if (placed.kind === 'miss') { this.phase = 'ended'; this.endReason = 'miss'; return placed; }
    this.tower = placed.tower;
    this.movingX = topLayer(this.tower).x;
    this.phase = 'dropping';
    this.dropRemaining = this.config.dropSeconds;
    this.combo = placed.kind === 'perfect' ? this.combo + 1 : 0;
    if (placed.kind === 'perfect') this.perfectCount++;
    this.longestCombo = Math.max(this.longestCombo, this.combo);
    return placed;
  }
  pause() {
    if (this.phase === 'moving' || this.phase === 'dropping') { this.phaseBeforePause = this.phase; this.phase = 'paused'; }
  }
  resume() { if (this.phase === 'paused') this.phase = this.phaseBeforePause; }
  result(): CompletedRun | null {
    return this.phase === 'ended' ? { runId: this.runId, ended: true, tower: cloneTower(this.tower), durationSeconds: this.elapsed, perfectCount: this.perfectCount, longestCombo: this.longestCombo, reason: this.endReason } : null;
  }
}
