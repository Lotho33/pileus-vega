// The profile's recent searches for one plugin, newest first — offered by the
// quick search while the box is empty (pileus-player's recent_searches.dart).
// Device-local, per profile AND per plugin: no profile → nothing is kept or
// shown. Search runs as the user types, so "a search" is decided here: a
// query that settled on results for SETTLE_MS, or one acted upon (a result
// opened, "Vedi tutti"). Keeping "breaking bad" drops the "brea" kept a
// moment earlier.

import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';
import {mycelium} from './api';

export const RECENT_MAX = 8;
export const RECENT_MIN_LENGTH = 2;
export const SETTLE_MS = 3000;

const KEY = 'pileus.recentSearches.v1';
let store: Record<string, string[]> = {};
let loaded: Promise<void> | null = null;

export function loadRecentSearches(): Promise<void> {
  if (!loaded) {
    loaded = AsyncStorage.getItem(KEY)
      .then(raw => {
        const parsed = raw ? JSON.parse(raw) : {};
        store = parsed && typeof parsed === 'object' ? parsed : {};
      })
      .catch(() => {
        store = {};
      });
  }
  return loaded;
}

function keyFor(pluginId: string): string | null {
  const profile = mycelium.creds.profileId;
  return profile && pluginId ? `${profile}:${pluginId}` : null;
}

function persist() {
  AsyncStorage.setItem(KEY, JSON.stringify(store)).catch(() => {});
}

/** Pure: `list` with `query` added on top (see the file comment). */
export function withQuery(list: string[], query: string): string[] {
  const q = query.trim();
  const lower = q.toLowerCase();
  return [q, ...list.filter(o => o.toLowerCase() !== lower && !lower.startsWith(o.toLowerCase()))].slice(
    0,
    RECENT_MAX,
  );
}

export const recentSearches = {
  list(pluginId: string): string[] {
    const k = keyFor(pluginId);
    return k ? store[k] ?? [] : [];
  },
  add(pluginId: string, query: string) {
    const k = keyFor(pluginId);
    if (!k || query.trim().length < RECENT_MIN_LENGTH) {
      return;
    }
    store[k] = withQuery(store[k] ?? [], query);
    persist();
  },
  clear(pluginId: string) {
    const k = keyFor(pluginId);
    if (k && store[k]) {
      delete store[k];
      persist();
    }
  },
};

/** Per search panel: keeps a query once it stays on results for SETTLE_MS. */
export class RecentSearchRecorder {
  private timer: ReturnType<typeof setTimeout> | null = null;

  typing() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  settled(pluginId: string, query: string, hasResults: boolean) {
    this.typing();
    if (hasResults) {
      this.timer = setTimeout(() => recentSearches.add(pluginId, query), SETTLE_MS);
    }
  }

  submit(pluginId: string, query: string) {
    this.typing();
    recentSearches.add(pluginId, query);
  }

  dispose() {
    this.typing();
  }
}
