// Persistent device session — the Vega counterpart of pileus-player's
// DeviceSession (shared_preferences there, AsyncStorage here).
//
// deviceId is generated once per installation and reused on every later
// pairing: mycelium treats an unknown device_id as a brand-new device, so a
// fresh id per attempt would leave a trail of ghost devices server-side.

import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';

export interface DeviceSession {
  /** Exactly what the user typed (re-parsed with parseServerAddressInput). */
  serverInput: string;
  deviceId: string;
  deviceJwt: string;
  expiresAt: number;
  lastProfileId: string;
  /**
   * "Profilo predefinito" (pileus-player's lastActiveProfileId): the app
   * enters it at start, skipping the picker. One per device; '' = none.
   */
  defaultProfileId: string;
}

const KEY = 'pileus.session.v1';

export function emptySession(): DeviceSession {
  return {
    serverInput: '',
    deviceId: '',
    deviceJwt: '',
    expiresAt: 0,
    lastProfileId: '',
    defaultProfileId: '',
  };
}

export async function readSession(): Promise<DeviceSession> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      return emptySession();
    }
    return {...emptySession(), ...JSON.parse(raw)};
  } catch {
    return emptySession();
  }
}

export async function writeSession(s: DeviceSession): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

/** RFC 4122 v4 from Math.random — enough for an installation id. */
export function uuidV4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
