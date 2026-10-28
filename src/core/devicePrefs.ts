// Per-device player preferences (pileus-player SettingsRepository keeps
// them locally too: they depend on the TV, not on the profile).

import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';

export const MAX_HEIGHT_OPTIONS = [0, 1080, 720, 480];
export const VOD_BUFFER = {min: 15, max: 180, step: 5, def: 60};
export const LIVE_BUFFER = {min: 6, max: 60, step: 2, def: 20};

export interface DevicePrefs {
  /** 0 = no cap. */
  maxVideoHeight: number;
  vodBufferSec: number;
  liveBufferSec: number;
}

const KEY = 'pileus.device.v1';
const DEFAULTS: DevicePrefs = {maxVideoHeight: 0, vodBufferSec: VOD_BUFFER.def, liveBufferSec: LIVE_BUFFER.def};

const clamp = (v: unknown, r: {min: number; max: number; def: number}) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, Math.round(v))) : r.def;

export function sanitize(raw: unknown): DevicePrefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    maxVideoHeight: MAX_HEIGHT_OPTIONS.includes(o.maxVideoHeight as number) ? (o.maxVideoHeight as number) : 0,
    vodBufferSec: clamp(o.vodBufferSec, VOD_BUFFER),
    liveBufferSec: clamp(o.liveBufferSec, LIVE_BUFFER),
  };
}

let cache: DevicePrefs = DEFAULTS;
let loaded = false;

export async function loadDevicePrefs(): Promise<DevicePrefs> {
  if (!loaded) {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      cache = sanitize(raw ? JSON.parse(raw) : {});
    } catch {
      cache = DEFAULTS;
    }
    loaded = true;
  }
  return cache;
}

export async function saveDevicePrefs(p: DevicePrefs): Promise<void> {
  cache = sanitize(p);
  loaded = true;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Kept in memory for this run anyway.
  }
}
