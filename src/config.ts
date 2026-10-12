import type { CutMode } from './core/tower.ts';
export interface GameConfig {
  cutMode: CutMode;
  roundSeconds: number;
  baseSpeed: number;
  speedStep: number;
  perfectRatio: number;
  comboMilestone: number;
  dropSeconds: number;
}
export interface RuntimeConfig {
  cityDisplayName: string;
  game: GameConfig;
  visual: { cameraSeconds: number; growthSeconds: number; maxPixelRatio: number };
}
export const DEFAULT_CONFIG: RuntimeConfig = {
  cityDisplayName: '城市天际线',
  game: { cutMode: 'alternate-xz', roundSeconds: 60, baseSpeed: 2.7, speedStep: 0.035, perfectRatio: 0.035, comboMilestone: 3, dropSeconds: 0.24 },
  visual: { cameraSeconds: 1.15, growthSeconds: 1.7, maxPixelRatio: 1.75 },
};
const numeric = (input: unknown, fallback: number, min: number, max: number) =>
  typeof input === 'number' && Number.isFinite(input) && input >= min && input <= max ? input : fallback;
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function parseRuntimeConfig(input: unknown): RuntimeConfig {
  const root = object(input), game = object(root.game), visual = object(root.visual), d = DEFAULT_CONFIG;
  const name = typeof root.cityDisplayName === 'string' ? root.cityDisplayName.trim() : '';
  return {
    cityDisplayName: name.length > 0 && name.length <= 40 && !/[<>\u0000-\u001f]/u.test(name) ? name : d.cityDisplayName,
    game: {
      cutMode: game.cutMode === 'single-x' || game.cutMode === 'alternate-xz' ? game.cutMode : d.game.cutMode,
      roundSeconds: numeric(game.roundSeconds, d.game.roundSeconds, 10, 180),
      baseSpeed: numeric(game.baseSpeed, d.game.baseSpeed, 0.5, 8),
      speedStep: numeric(game.speedStep, d.game.speedStep, 0, 0.3),
      perfectRatio: numeric(game.perfectRatio, d.game.perfectRatio, 0, 0.12),
      comboMilestone: Math.round(numeric(game.comboMilestone, d.game.comboMilestone, 2, 10)),
      dropSeconds: numeric(game.dropSeconds, d.game.dropSeconds, 0.1, 0.7),
    },
    visual: {
      cameraSeconds: numeric(visual.cameraSeconds, d.visual.cameraSeconds, 0.2, 3),
      growthSeconds: numeric(visual.growthSeconds, d.visual.growthSeconds, 0.3, 4),
      maxPixelRatio: numeric(visual.maxPixelRatio, d.visual.maxPixelRatio, 1, 2),
    },
  };
}
/** Only the approved comparison mode can be selected by a shared playtest link. */
export function playtestConfig(config: RuntimeConfig, search: string): RuntimeConfig {
  const mode = new URLSearchParams(search).get('cut');
  return mode === 'single-x' || mode === 'alternate-xz' ? { ...config, game: { ...config.game, cutMode: mode } } : config;
}
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const response = await fetch(new URL('runtime-config.json', document.baseURI), { cache: 'no-store' });
    return response.ok ? parseRuntimeConfig(await response.json()) : parseRuntimeConfig(null);
  } catch { return parseRuntimeConfig(null); }
}
