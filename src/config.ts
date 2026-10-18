import type { CutMode } from './core/tower.ts';
import { DEFAULT_DISTRICT_CAPACITIES, waterfrontLayout } from './core/layout.ts';
import { DEFAULT_BRANDING, parseBranding, type BrandingConfig } from './branding.ts';
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
  branding: BrandingConfig;
  city: { openDistricts: number; capacities: number[] };
  game: GameConfig;
  visual: { cameraSeconds: number; growthSeconds: number; maxPixelRatio: number; lowFloors: number; midFloors: number; publicBuildings: boolean; tourStaySeconds: number; tourTransitionSeconds: number; focusTransitionSeconds:number; tourIdleSeconds: number; landingGlowSeconds:number; noticeStaySeconds:number; tourArcDegrees:number };
}
export const DEFAULT_CONFIG: RuntimeConfig = {
  cityDisplayName: '城市天际线',
  branding: {...DEFAULT_BRANDING},
  city: {openDistricts:6, capacities:[...DEFAULT_DISTRICT_CAPACITIES]},
  game: { cutMode: 'alternate-xz', roundSeconds: 60, baseSpeed: 2.7, speedStep: 0.035, perfectRatio: 0.035, comboMilestone: 3, dropSeconds: 0.24 },
  visual: { cameraSeconds: 1.15, growthSeconds: 1.7, maxPixelRatio: 1.75, lowFloors:12, midFloors:24, publicBuildings:true, tourStaySeconds:18, tourTransitionSeconds:7,focusTransitionSeconds:2.5, tourIdleSeconds:20,landingGlowSeconds:.55,noticeStaySeconds:6,tourArcDegrees:6 },
};
const numeric = (input: unknown, fallback: number, min: number, max: number) =>
  typeof input === 'number' && Number.isFinite(input) && input >= min && input <= max ? input : fallback;
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function parseRuntimeConfig(input: unknown): RuntimeConfig {
  const root = object(input), game = object(root.game), visual = object(root.visual), d = DEFAULT_CONFIG;
  // The event city is a finished six-district composition, with 76 display slots.
  const layout=waterfrontLayout();
  const lowFloors=Math.round(numeric(visual.lowFloors,12,1,100)),midFloors=Math.max(lowFloors+1,Math.round(numeric(visual.midFloors,24,2,200)));
  const name = typeof root.cityDisplayName === 'string' ? root.cityDisplayName.trim() : '';
  const cityDisplayName = name.length > 0 && name.length <= 40 && !/[<>\u0000-\u001f]/u.test(name) ? name : d.cityDisplayName;
  return {
    cityDisplayName,
    branding: parseBranding(root.branding, cityDisplayName),
    city:{openDistricts:layout.districtCount,capacities:layout.capacities},
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
      lowFloors,midFloors,publicBuildings:visual.publicBuildings!==false,
      tourStaySeconds:numeric(visual.tourStaySeconds,18,3,60),tourTransitionSeconds:numeric(visual.tourTransitionSeconds,7,2,15),focusTransitionSeconds:numeric(visual.focusTransitionSeconds,2.5,1,8),tourIdleSeconds:numeric(visual.tourIdleSeconds,20,5,120),
      landingGlowSeconds:numeric(visual.landingGlowSeconds,.55,.3,1),noticeStaySeconds:numeric(visual.noticeStaySeconds,6,3,12),tourArcDegrees:numeric(visual.tourArcDegrees,6,0,10),
    },
  };
}
/** Only the approved comparison mode can be selected by a shared playtest link. */
export function playtestConfig(config: RuntimeConfig, search: string): RuntimeConfig {
  const mode = new URLSearchParams(search).get('cut');
  return mode === 'single-x' || mode === 'alternate-xz' ? { ...config, game: { ...config.game, cutMode: mode } } : config;
}
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  // Node embeds the same public configuration used by its HTML title and API.
  const bootstrap = document.getElementById('skyline-runtime');
  if (bootstrap) { try { return parseRuntimeConfig(JSON.parse(bootstrap.textContent ?? '')); } catch { /* Fetch the public projection if the bootstrap is damaged. */ } }
  try {
    const response = await fetch(new URL('runtime-config.json', document.baseURI), { cache: 'no-store' });
    return response.ok ? parseRuntimeConfig(await response.json()) : parseRuntimeConfig(null);
  } catch { return parseRuntimeConfig(null); }
}
