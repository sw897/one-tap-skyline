import type { GameConfig } from '../config.ts';
import { axisForFloor, cloneTower, emptyTower, placeLayer, topLayer } from './tower.ts';
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
  readonly runId: string;
  readonly config: GameConfig;
  tower = emptyTower();
  phase: GamePhase = 'moving';
  movingPosition = 0;
  elapsed = 0;
  combo = 0;
  perfectCount = 0;
  longestCombo = 0;
  endReason: 'miss' | 'time' = 'miss';
  private entrySign = 1;
  private movementStartedAt = 0;
  private dropEndsAt = 0;
  private phaseBeforePause: 'moving' | 'dropping' = 'moving';

  constructor(config: GameConfig, runId = temporaryId()) { this.runId = runId; this.config = { ...config }; this.nextBlock(); }
  get remaining() { return Math.max(0, this.config.roundSeconds - this.elapsed); }
  get activeAxis() { return axisForFloor(this.tower.layers.length, this.config.cutMode); }
  get axisBaseSize() { return this.activeAxis === 'x' ? this.tower.baseWidth : this.tower.depth; }
  get speed() { return (this.config.baseSpeed + this.tower.layers.length * this.config.speedStep) * this.axisBaseSize / this.tower.baseWidth; }
  get movementRange() { return this.axisBaseSize * 1.35; }
  get movingLayer() { return { ...topLayer(this.tower), [this.activeAxis]: this.movingPosition }; }
  get hasMovingBlock() { return this.phase === 'moving' || (this.phase === 'paused' && this.phaseBeforePause === 'moving'); }
  get isLanding() { return this.phase === 'dropping' || (this.phase === 'paused' && this.phaseBeforePause === 'dropping'); }
  private nextBlock(startedAt = this.elapsed) {
    const pass = this.config.cutMode === 'alternate-xz' ? Math.floor(this.tower.layers.length / 2) : this.tower.layers.length;
    const sign = pass % 2 === 0 ? 1 : -1;
    this.entrySign = sign; this.movementStartedAt = startedAt;
    this.movingPosition = topLayer(this.tower)[this.activeAxis] + sign * this.movementRange;
    this.phase = 'moving';
  }
  advance(seconds: number) {
    if (this.phase === 'paused' || this.phase === 'ended' || !Number.isFinite(seconds) || seconds <= 0) return;
    this.advanceToActiveTime(this.elapsed + seconds);
  }
  advanceToActiveTime(activeSeconds: number) {
    if (this.phase === 'paused' || this.phase === 'ended' || !Number.isFinite(activeSeconds) || activeSeconds <= this.elapsed) return;
    this.elapsed = Math.min(this.config.roundSeconds, activeSeconds);
    if (this.remaining === 0) { this.endReason = 'time'; this.phase = 'ended'; return; }
    if (this.phase === 'dropping') {
      if (this.elapsed + 1e-12 < this.dropEndsAt) return;
      this.nextBlock(this.dropEndsAt);
    }
    const center = topLayer(this.tower)[this.activeAxis], range = this.movementRange;
    const distance = (this.speed * Math.max(0,this.elapsed - this.movementStartedAt)) % (range * 4);
    const relative = this.entrySign * (distance <= range * 2 ? range - distance : distance - range * 3);
    this.movingPosition = center + relative;
  }
  place(): Placement | null {
    if (this.phase !== 'moving') return null;
    const placed = placeLayer(this.tower, this.movingPosition, this.config.perfectRatio, this.activeAxis);
    if (placed.kind === 'miss') { this.phase = 'ended'; this.endReason = 'miss'; return placed; }
    this.tower = placed.tower;
    this.movingPosition = topLayer(this.tower)[this.activeAxis];
    this.phase = 'dropping';
    this.dropEndsAt = this.elapsed + this.config.dropSeconds;
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
