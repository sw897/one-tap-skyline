import { DEFAULT_CONFIG } from '../config.ts';
import type { GameConfig } from '../config.ts';
export const RULESET_ID = 'p3-b60-v1';
export const GEOMETRY_VERSION = 'rect-xz-1';
export const OFFICIAL_RULES: GameConfig = Object.freeze({ ...DEFAULT_CONFIG.game, cutMode: 'alternate-xz', roundSeconds: 60 });
export const RUN_TTL_MS = 10 * 60_000;
export const PLAYER_TTL_MS = 30 * 24 * 60 * 60_000;
export class ApiError extends Error {
  readonly status: number; readonly code: string;
  constructor(status: number, code: string) { super(code); this.status=status; this.code=code; }
}
export const randomId = () => crypto.randomUUID();
export async function hashText(text: string) {
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
export const randomCredential = () => Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
