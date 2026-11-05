import type { GameConfig } from '../config.ts';
import { GameSession } from './game.ts';
import type { CompletedRun } from './game.ts';
import type { Placement } from './tower.ts';

export type RunEvent = { type: 'place' | 'pause' | 'resume'; atUs: number };
export interface RunTrace { version: 1; events: RunEvent[]; endUs: number }
export const MAX_TRACE_EVENTS = 1024;
/** One monotonic event clock for rendering, pointer input and server replay. */
export class RunClock {
  readonly game: GameSession;
  readonly events: RunEvent[] = [];
  private lastUs = 0;
  private pausedAt: number | undefined;
  private pausedUs = 0;
  constructor(game: GameSession) { this.game = game; }
  sync(atUs: number) {
    if (!Number.isSafeInteger(atUs) || atUs < this.lastUs || atUs < 0) throw new Error('Non-monotonic run clock');
    this.lastUs = atUs;
    const activeSeconds = ((this.pausedAt ?? atUs) - this.pausedUs) / 1e6;
    this.game.advanceToActiveTime(activeSeconds);
  }
  place(atUs: number): Placement | null {
    this.sync(atUs);
    const placement = this.game.place();
    if (placement) this.events.push({ type: 'place', atUs });
    return placement;
  }
  pause(atUs: number) {
    this.sync(atUs);
    if (this.game.phase === 'paused' || this.game.phase === 'ended') return false;
    this.game.pause(); this.pausedAt = atUs; this.events.push({ type: 'pause', atUs }); return true;
  }
  resume(atUs: number) {
    if (!Number.isSafeInteger(atUs) || atUs < this.lastUs) throw new Error('Non-monotonic resume');
    if (this.pausedAt === undefined || this.game.phase !== 'paused') return false;
    this.pausedUs += atUs - this.pausedAt; this.pausedAt = undefined;
    this.game.resume(); this.sync(atUs); this.events.push({ type: 'resume', atUs }); return true;
  }
  trace(): RunTrace { return { version: 1, events: this.events.map(e => ({ ...e })), endUs: this.lastUs }; }
}

const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');
export function parseTrace(value: unknown): RunTrace {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid trace');
  const root = value as Record<string, unknown>;
  if (!exactKeys(root, ['version', 'events', 'endUs']) || root.version !== 1 || !Array.isArray(root.events) || root.events.length > MAX_TRACE_EVENTS || !Number.isSafeInteger(root.endUs) || (root.endUs as number) < 0) throw new Error('Invalid trace envelope');
  let previous = 0;
  const events = root.events.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid event');
    const e = value as Record<string, unknown>;
    if (!exactKeys(e, ['type', 'atUs']) || !['place', 'pause', 'resume'].includes(e.type as string) || !Number.isSafeInteger(e.atUs) || (e.atUs as number) < previous || (e.atUs as number) > (root.endUs as number)) throw new Error('Invalid event order');
    previous = e.atUs as number; return { type: e.type as RunEvent['type'], atUs: e.atUs as number };
  });
  return { version: 1, events, endUs: root.endUs as number };
}
export function replayTrace(config: GameConfig, trace: RunTrace, runId: string): CompletedRun {
  const clock = new RunClock(new GameSession(config, runId));
  for (const event of trace.events) {
    const applied = event.type === 'place' ? clock.place(event.atUs) : event.type === 'pause' ? clock.pause(event.atUs) : clock.resume(event.atUs);
    if (!applied) throw new Error('Event violates run phase');
  }
  clock.sync(trace.endUs);
  const completed = clock.game.result();
  if (!completed) throw new Error('Run has not ended');
  return completed;
}
