// Title logos. Port of pileus-player core/widgets/smart_logo.dart (halo
// rule, draw size) and media_repository.dart's logoMetaPending.
//
// Logo strings may still carry the legacy suffix "url|norm_w|norm_h|dark"
// ("url|w|h" older still), from mycelium's image.analyze_logo. Since 09/11
// the server sends LogoMeta next to logo_url instead, measured in the
// background the first time a URL goes out: the first answer has none.

import type {LogoMeta} from '../gen/media';

export function logoUrlOnly(encoded: string): string {
  const parts = encoded.split('|');
  if (parts.length >= 4) {
    return parts.slice(0, parts.length - 3).join('|');
  }
  if (parts.length === 3) {
    return parts.slice(0, parts.length - 2).join('|');
  }
  return encoded;
}

export function logoDark(encoded: string): boolean {
  const parts = encoded.split('|');
  return parts.length >= 4 && parts[parts.length - 1] === '1';
}

function fitLogo(srcW: number, srcH: number, targetW: number, maxH: number, maxW: number): {w: number; h: number} {
  let w = targetW;
  let h = srcW > 0 && srcH > 0 ? (targetW * srcH) / srcW : targetW / 3;
  if (h > maxH) {
    w = (w * maxH) / h;
    h = maxH;
  }
  if (w > maxW) {
    h = (h * maxW) / w;
    w = maxW;
  }
  // Ultra-wide logos must not shrink to a thin line.
  h = Math.max(h, maxH * 0.3);
  return {w, h};
}

export function logoRenderSize(
  encoded: string,
  targetW: number,
  maxH: number,
  maxW: number,
): {w: number; h: number} {
  const parts = encoded.split('|');
  let srcW = 0;
  let srcH = 0;
  if (parts.length >= 4) {
    srcW = Number(parts[parts.length - 3]) || 0;
    srcH = Number(parts[parts.length - 2]) || 0;
  } else if (parts.length === 3) {
    srcW = Number(parts[1]) || 0;
    srcH = Number(parts[2]) || 0;
  }
  return fitLogo(srcW, srcH, targetW, maxH, maxW);
}

// ── Readability (mycelium pileus-contract.md, "Logo readability") ─────────

/** Luminance of the app's dark theme, what nearly every logo sits on. */
export const DARK_BACKGROUND_LUMINANCE = 0.02;

export type HaloKind = 'none' | 'light' | 'dark';
/** `strong`: thin strokes (low coverage) need more of it to read. */
export interface LogoHalo {
  kind: HaloKind;
  strong: boolean;
}

// An unset message decodes as undefined; a measured logo always has a size
// or a coverage.
export function logoMeasured(m: LogoMeta | undefined | null): m is LogoMeta {
  return !!m && ((m.width > 0 && m.height > 0) || m.coverage > 0);
}

/**
 * Which halo the logo needs on a background of `backgroundLuminance`. With
 * no measurements the legacy dark flag of the URL decides (it only matters
 * on a dark background).
 */
export function logoHaloFor(
  encoded: string,
  meta: LogoMeta | undefined | null,
  backgroundLuminance = DARK_BACKGROUND_LUMINANCE,
): LogoHalo {
  const onLight = backgroundLuminance > 0.5;
  if (!logoMeasured(meta)) {
    return {kind: !onLight && logoDark(encoded) ? 'light' : 'none', strong: false};
  }
  const kind: HaloKind = onLight
    ? meta.lumMid > 0.6 || meta.lightShare >= 0.35
      ? 'dark'
      : 'none'
    : meta.halo === 'light'
    ? 'light'
    : 'none';
  return {kind, strong: meta.coverage < 0.2};
}

/** Draw size: the measured proportions, else the URL suffix's, else 3:1. */
export function logoDisplaySize(
  encoded: string,
  meta: LogoMeta | undefined | null,
  maxW: number,
  maxH: number,
): {w: number; h: number} {
  if (logoMeasured(meta) && meta.width > 0 && meta.height > 0) {
    return fitLogo(meta.width, meta.height, maxW, maxH, maxW);
  }
  return logoRenderSize(encoded, maxW, maxH, maxW);
}

/**
 * The outline that draws a halo without a blur (§10: no blurs on Vega):
 * tinted copies of the logo shifted by 1 (2 when strong) layout units —
 * smart_logo.dart's low-power path. 4 copies, 8 when strong.
 */
export function haloOffsets(halo: LogoHalo): {x: number; y: number}[] {
  if (halo.kind === 'none') {
    return [];
  }
  const d = halo.strong ? 2 : 1;
  const out = [
    {x: -d, y: -d},
    {x: d, y: -d},
    {x: -d, y: d},
    {x: d, y: d},
  ];
  if (halo.strong) {
    out.push({x: -d, y: 0}, {x: d, y: 0}, {x: 0, y: -d}, {x: 0, y: d});
  }
  return out;
}

// ── Not measured yet ──────────────────────────────────────────────────────

/** How long a logo without logo_meta is still expected to get one. */
export const LOGO_PENDING_WINDOW_MS = 2 * 60 * 1000;
const firstSeen = new Map<string, number>();

/**
 * The server hasn't measured this logo yet (it does so within seconds of
 * first sending the URL). One it can't measure never gets logo_meta: past
 * LOGO_PENDING_WINDOW_MS from the first time this client saw it, it's a logo
 * without measurements — no more re-reads. Non-TMDB SVGs are never measured.
 */
export function logoPending(logoUrl: string, meta: LogoMeta | undefined | null, now = Date.now()): boolean {
  if (!logoUrl || logoMeasured(meta)) {
    return false;
  }
  const url = logoUrl.toLowerCase();
  if (url.includes('.svg') && !url.includes('image.tmdb.org')) {
    return false;
  }
  if (firstSeen.size > 4000) {
    firstSeen.clear();
  }
  let first = firstSeen.get(logoUrl);
  if (first === undefined) {
    first = now;
    firstSeen.set(logoUrl, now);
  }
  return now - first < LOGO_PENDING_WINDOW_MS;
}

/** Forgets the first-seen times (tests). */
export function _resetLogoPending() {
  firstSeen.clear();
}
