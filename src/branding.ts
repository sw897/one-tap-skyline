export interface BrandingConfig {
  enabled: boolean;
  title: string;
  activityLabel: string;
  headline: string;
  pavilionName: string;
  accent: string;
  logoUrl: string | null;
}

export const DEFAULT_BRANDING: BrandingConfig = {
  enabled: false,
  title: '一指盖楼：城市天际线',
  activityLabel: '一指之间，一座城市',
  headline: '把每一次落下，盖成更高的风景。',
  pavilionName: '云岸展馆',
  accent: '#f2c230',
  logoUrl: null,
};

export const displayText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max && !/[<>\u0000-\u001f\u007f]/u.test(value);
export const accentColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

/** Public projection only: never pass raw private configuration to the browser. */
export function parseBranding(input: unknown, cityName: string): BrandingConfig {
  const raw = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const text = (key: string, fallback: string, max: number) => displayText(raw[key], max) ? (raw[key] as string).trim() : fallback;
  return {
    enabled: raw.enabled === true,
    title: text('title', '一指盖楼：' + cityName, 64),
    activityLabel: text('activityLabel', DEFAULT_BRANDING.activityLabel, 32),
    headline: text('headline', DEFAULT_BRANDING.headline, 80),
    pavilionName: text('pavilionName', DEFAULT_BRANDING.pavilionName, 32),
    accent: accentColor(raw.accent) ? raw.accent.toLowerCase() : DEFAULT_BRANDING.accent,
    logoUrl: raw.logoUrl === '/theme/logo' ? raw.logoUrl : null,
  };
}
