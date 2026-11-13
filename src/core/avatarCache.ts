// Profile photos imported in mycelium (/profile-avatar/<id>?v=…), kept on
// the device (pileus-player §13): the URL carries the host the app reached
// mycelium on, which differs between LAN and VPN, so the cache key is the
// path plus ?v= only — the same photo is never fetched again because the
// route changed, and a new ?v= (a new photo) replaces the old one.
//
// Stored as data: URIs in AsyncStorage (photos are small); at most
// MAX_ENTRIES, the least recently used go first.

import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';
import {encode} from 'base-64';
import {useEffect, useState} from 'react';
import {mycelium} from './api';

const PREFIX = 'pileus.avatar.v1:';
const INDEX_KEY = 'pileus.avatar.v1.index';
const MAX_ENTRIES = 24;
const MAX_BYTES = 512 * 1024;

/** The host-free key of a mycelium photo URL, or null for any other image. */
export function avatarCacheKey(url: string): string | null {
  const m = /^(?:[a-z]+:\/\/[^/]+)?(\/profile-avatar\/[^?#]+)(\?[^#]*)?/i.exec(url.trim());
  if (!m) {
    return null;
  }
  const v = /[?&]v=([^&]*)/.exec(m[2] ?? '')?.[1];
  return v ? `${m[1]}?v=${v}` : m[1];
}

/** The profile id part of a key: every ?v= of one profile shares it. */
const photoOf = (key: string) => key.replace(/\?.*$/, '');

const memory = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();
let index: string[] | null = null;

async function loadIndex(): Promise<string[]> {
  if (index) {
    return index;
  }
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    index = Array.isArray(parsed) ? parsed.filter(k => typeof k === 'string') : [];
  } catch {
    index = [];
  }
  return index!;
}

async function remember(key: string, dataUri: string) {
  const list = await loadIndex();
  // Older versions of the same photo and the least recently used go.
  const drop = list.filter(k => k !== key && photoOf(k) === photoOf(key));
  const kept = [key, ...list.filter(k => k !== key && !drop.includes(k))];
  drop.push(...kept.splice(MAX_ENTRIES));
  index = kept;
  try {
    await AsyncStorage.setItem(PREFIX + key, dataUri);
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(kept));
    if (drop.length) {
      await AsyncStorage.multiRemove(drop.map(k => PREFIX + k));
    }
  } catch {
    // Full or unavailable storage: the photo still shows this time.
  }
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x2000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return encode(bin);
}

/** The image at `url` as a data: URI (XHR: fetch has no arrayBuffer here). */
function download(url: string): Promise<string | null> {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'arraybuffer';
    xhr.timeout = 15000;
    xhr.onload = () => {
      const buf = xhr.response as ArrayBuffer | null;
      if (xhr.status !== 200 || !buf || !buf.byteLength || buf.byteLength > MAX_BYTES) {
        resolve(null);
        return;
      }
      const type = (xhr.getResponseHeader('content-type') || 'image/jpeg').split(';')[0].trim();
      resolve(`data:${type};base64,${toBase64(new Uint8Array(buf))}`);
    };
    xhr.onerror = () => resolve(null);
    xhr.ontimeout = () => resolve(null);
    xhr.send();
  });
}

const absolute = (url: string) => (/^[a-z]+:\/\//i.test(url) ? url : `${mycelium.origin}${url}`);

/** The cached photo for `url` (from memory, disk or the network), or null. */
export function cachedAvatar(url: string): Promise<string | null> {
  const key = avatarCacheKey(url);
  if (!key) {
    return Promise.resolve(null);
  }
  const hit = memory.get(key);
  if (hit) {
    return Promise.resolve(hit);
  }
  let p = inFlight.get(key);
  if (!p) {
    p = (async () => {
      try {
        const disk = await AsyncStorage.getItem(PREFIX + key);
        if (disk) {
          memory.set(key, disk);
          return disk;
        }
      } catch {
        // Fall through to the network.
      }
      const fresh = await download(absolute(url));
      if (fresh) {
        memory.set(key, fresh);
        remember(key, fresh);
      }
      return fresh;
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, p);
  }
  return p;
}

/**
 * What an <Image> should show for a profile photo: the cached copy, the
 * network URL if caching failed, '' while the first lookup runs. Any other
 * image URL comes back as it is.
 */
export function useAvatarSource(url: string): string {
  const key = avatarCacheKey(url);
  const [src, setSrc] = useState(() => (key ? memory.get(key) ?? '' : url));
  useEffect(() => {
    if (!key) {
      setSrc(url);
      return;
    }
    const hit = memory.get(key);
    if (hit) {
      setSrc(hit);
      return;
    }
    let alive = true;
    setSrc('');
    cachedAvatar(url).then(d => alive && setSrc(d ?? absolute(url)));
    return () => {
      alive = false;
    };
  }, [key, url]);
  return src;
}
