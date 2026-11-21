// What the active profile already downloaded (or is downloading), by plugin +
// media id — so a details page shows "Scaricato" instead of offering the same
// episode/movie again (pileus-player downloaded_index.dart). One
// ListDownloads shared by every chip on screen, refreshed at most every TTL.

import {useEffect, useState} from 'react';
import {mycelium} from '../core/api';

const TTL_MS = 20000;
// Statuses that mean "you have it, or it is coming".
const ACTIVE = new Set(['queued', 'scheduled', 'running', 'paused', 'completed']);

const key = (pluginId: string, mediaId: string) => `${pluginId}\u0000${mediaId}`;

let ids = new Set<string>();
let profile: string | null = null;
let at = 0;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach(l => l());

export const downloadedIndex = {
  has(pluginId: string, mediaId: string): boolean {
    return !!mediaId && profile === mycelium.creds.profileId && ids.has(key(pluginId, mediaId));
  },

  /** Fetches the list unless a fresh one (same profile) is already here. */
  refresh(force = false): Promise<void> {
    const pid = mycelium.creds.profileId;
    if (!force && profile === pid && Date.now() - at < TTL_MS) {
      return Promise.resolve();
    }
    if (!loading) {
      loading = mycelium
        .listDownloads()
        .then(r => {
          ids = new Set(r.downloads.filter(d => ACTIVE.has(d.status)).map(d => key(d.pluginId, d.mediaId)));
          profile = pid;
          at = Date.now();
          notify();
        })
        .catch(() => {})
        .finally(() => {
          loading = null;
        });
    }
    return loading;
  },

  /** A download was just requested: mark it at once, the next list confirms. */
  markRequested(pluginId: string, mediaIds: string[]) {
    if (profile !== mycelium.creds.profileId) {
      ids = new Set();
      profile = mycelium.creds.profileId;
    }
    ids = new Set([...ids, ...mediaIds.map(m => key(pluginId, m))]);
    notify();
  },

  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  /** For tests. */
  reset() {
    ids = new Set();
    profile = null;
    at = 0;
    loading = null;
  },
};

/** Whether this title is already downloaded (or on its way); refreshes the index once on mount. */
export function useDownloaded(pluginId: string, mediaId: string): boolean {
  const [done, setDone] = useState(() => downloadedIndex.has(pluginId, mediaId));
  useEffect(() => {
    const update = () => setDone(downloadedIndex.has(pluginId, mediaId));
    const off = downloadedIndex.subscribe(update);
    update();
    downloadedIndex.refresh();
    return off;
  }, [pluginId, mediaId]);
  return done;
}
