// Video quality labels and the bandwidth the player starts from.
//
// Labels: a stream's picture height alone gave odd numbers for anything not
// exactly 16:9 — a 1920×800 film read "800p", a 1916×1036 one "1036p". The
// label is the standard tier the picture belongs to, from whichever of width
// and height is the larger at 16:9; variants of the same tier are one entry.
//
// Start: Shaka assumes 1 Mbps until it has measured something (and may read
// the system's network estimate), so every video opened at the lowest
// quality and climbed only after several seconds. It now starts from the
// throughput measured during the last playback.

import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';

export const TIERS = [2160, 1440, 1080, 720, 576, 480, 360, 240, 144];

/** The standard tier (e.g. 1080) of a width×height picture. */
export function qualityTier(width: number, height: number): number {
  const effective = Math.max(height, Math.round((width * 9) / 16));
  // Nearest tier; a little above one (1088, 1104) still counts as it.
  let best = TIERS[0];
  for (const t of TIERS) {
    if (Math.abs(t - effective) < Math.abs(best - effective)) {
      best = t;
    }
  }
  return best;
}

export const tierLabel = (tier: number) => (tier === 2160 ? '4K' : `${tier}p`);

/** The "Qualità video massima" cap as Shaka restrictions (a 16:9 box). */
export function capRestrictions(maxHeight: number): {maxHeight: number; maxWidth: number} {
  return maxHeight > 0
    ? {maxHeight, maxWidth: Math.round((maxHeight * 16) / 9)}
    : {maxHeight: Infinity, maxWidth: Infinity};
}

const KEY = 'pileus.bandwidth.v1';
/** With nothing measured yet: a home network, not a phone line. */
export const DEFAULT_START_BPS = 10e6;
const MIN_BPS = 1.5e6;
const MAX_BPS = 200e6;

let remembered = 0;
let loaded = false;

export async function startBandwidth(): Promise<number> {
  if (!loaded) {
    loaded = true;
    try {
      remembered = Number(await AsyncStorage.getItem(KEY)) || 0;
    } catch {
      remembered = 0;
    }
  }
  return remembered > 0 ? remembered : DEFAULT_START_BPS;
}

/** Throughput Shaka measured during a playback (bits/s). */
export function rememberBandwidth(bps: number) {
  if (!Number.isFinite(bps) || bps <= 0) {
    return;
  }
  remembered = Math.min(MAX_BPS, Math.max(MIN_BPS, Math.round(bps)));
  loaded = true;
  AsyncStorage.setItem(KEY, String(remembered)).catch(() => {});
}
