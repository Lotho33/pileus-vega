// Continue Watching written while the server is unreachable (a Wi-Fi drop
// mid-episode): progress, automatic removals and "move to the next episode"
// are queued per profile and replayed in order at the next write or Continue
// Watching fetch that reaches the server. Port of pileus-player's
// cw_offline_queue.dart and the matching part of media_repository.dart.
//
// Ordered, oldest first: the order is what makes "finished S1E10 → moved to
// S2E1 → watched S2E1 to 12 min" come out right. Only the latest write per
// row is kept, and a newer write for a series obsoletes a pending "move to
// the next episode" of that series.

import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';
import type {ContinueWatchingItem, ProgressRequest, ProgressResponse} from '../gen/media';
import {CwAdvanceRequest, isOffline, tryAdvanceContinueWatching} from '../player/cwAdvance';
import {mycelium} from './api';
import {GrpcError, GrpcStatus} from './grpcWeb';

export type CwQueuedOp =
  | {k: 'u'; r: Partial<ProgressRequest>}
  | {k: 'd'; p: string; m: string}
  | {k: 'a'; r: CwAdvanceRequest};

const KEY = 'pileus.cwOffline.v1';
// Bounded: an offline week of heartbeats collapses to one entry per row
// anyway; this only stops a pathological case growing without limit.
export const MAX_OPS = 300;

// ── pure queue operations ─────────────────────────────────────────────────

const sameRow = (op: CwQueuedOp, pluginId: string, mediaId: string) =>
  op.k === 'u'
    ? op.r.pluginId === pluginId && op.r.mediaId === mediaId
    : op.k === 'd' && op.p === pluginId && op.m === mediaId;

const obsoleteAdvance = (op: CwQueuedOp, pluginId: string, seriesId: string) =>
  !!seriesId && op.k === 'a' && op.r.pluginId === pluginId && op.r.seriesId === seriesId;

const capped = (ops: CwQueuedOp[]) => (ops.length > MAX_OPS ? ops.slice(ops.length - MAX_OPS) : ops);

export function withUpdate(ops: CwQueuedOp[], r: Partial<ProgressRequest>): CwQueuedOp[] {
  const pid = r.pluginId ?? '';
  return capped([
    ...ops.filter(op => !sameRow(op, pid, r.mediaId ?? '') && !obsoleteAdvance(op, pid, r.parentId ?? '')),
    {k: 'u', r},
  ]);
}

export function withDelete(ops: CwQueuedOp[], pluginId: string, mediaId: string): CwQueuedOp[] {
  return capped([...ops.filter(op => !sameRow(op, pluginId, mediaId)), {k: 'd', p: pluginId, m: mediaId}]);
}

export function withAdvance(ops: CwQueuedOp[], r: CwAdvanceRequest): CwQueuedOp[] {
  return capped([...ops.filter(op => !obsoleteAdvance(op, r.pluginId, r.seriesId)), {k: 'a', r}]);
}

/** The server took a newer write for this row/series directly: what's queued for it would overwrite fresher data. */
export function withoutSuperseded(
  ops: CwQueuedOp[],
  pluginId: string,
  mediaId: string,
  parentId: string,
): CwQueuedOp[] {
  return ops.filter(op => !sameRow(op, pluginId, mediaId) && !obsoleteAdvance(op, pluginId, parentId));
}

export function opId(op: CwQueuedOp): string {
  switch (op.k) {
    case 'u':
      return `u\u0000${op.r.pluginId}\u0000${op.r.mediaId}\u0000${op.r.currentPosition}`;
    case 'd':
      return `d\u0000${op.p}\u0000${op.m}`;
    case 'a':
      return `a\u0000${op.r.pluginId}\u0000${op.r.seriesId}\u0000${op.r.currentCwId}`;
  }
}

/**
 * `items` with what was written offline laid over it: rows removed offline
 * gone, rows watched offline on top, one row per series like the server
 * keeps it (the newest offline episode replaces the series' older row).
 */
export function overlayQueued(items: ContinueWatchingItem[], ops: CwQueuedOp[]): ContinueWatchingItem[] {
  if (!ops.length) {
    return items;
  }
  const key = (p: string, m: string) => `${p}\u0000${m}`;
  const deleted = new Set(ops.flatMap(op => (op.k === 'd' ? [key(op.p, op.m)] : [])));
  const queued: ContinueWatchingItem[] = ops
    .flatMap(op => (op.k === 'u' ? [op.r] : []))
    .reverse()
    .map(r => ({
      pluginId: r.pluginId ?? '',
      mediaId: r.mediaId ?? '',
      parentId: r.parentId ?? '',
      title: r.title ?? '',
      navigationContext: r.navigationContext ?? '',
      poster: r.poster ?? '',
      progressTime: r.currentPosition ?? 0,
      totalTime: r.totalDuration ?? 0,
      lastUpdated: '',
      rating: r.rating ?? 0,
      genres: r.genres ?? [],
      plot: r.plot ?? '',
      year: r.year ?? 0,
      seasonNumber: r.seasonNumber ?? 0,
      episodeNumber: r.episodeNumber ?? 0,
    }));
  const seen = new Set<string>();
  const out: ContinueWatchingItem[] = [];
  for (const i of [...queued, ...items]) {
    if (deleted.has(key(i.pluginId, i.mediaId))) {
      continue;
    }
    const group = i.parentId ? `p\u0000${i.pluginId}\u0000${i.parentId}` : `m\u0000${key(i.pluginId, i.mediaId)}`;
    if (!seen.has(group)) {
      seen.add(group);
      out.push(i);
    }
  }
  return out;
}

// ── storage (per profile) ─────────────────────────────────────────────────

let store: Record<string, CwQueuedOp[]> = {};
let loaded: Promise<void> | null = null;

export function loadCwOffline(): Promise<void> {
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

/** For tests. */
export function resetCwOffline(initial: Record<string, CwQueuedOp[]> = {}) {
  store = initial;
  loaded = Promise.resolve();
  flushing = null;
}

const profile = () => mycelium.creds.profileId;

export function queuedOps(): CwQueuedOp[] {
  const p = profile();
  return p ? store[p] ?? [] : [];
}

async function update(fn: (ops: CwQueuedOp[]) => CwQueuedOp[]) {
  await loadCwOffline();
  const p = profile();
  if (!p) {
    return;
  }
  const next = fn(store[p] ?? []);
  if (next.length) {
    store[p] = next;
  } else {
    delete store[p];
  }
  AsyncStorage.setItem(KEY, JSON.stringify(store)).catch(() => {});
}

export const queueCwAdvance = (r: CwAdvanceRequest) => update(ops => withAdvance(ops, r));

// The session or the profile lock refused it: nothing a retry fixes.
const refused = (e: unknown) =>
  e instanceof GrpcError && (e.code === GrpcStatus.UNAUTHENTICATED || e.code === GrpcStatus.PERMISSION_DENIED);

// ── writes that queue themselves when offline ─────────────────────────────

/** UpdateProgress; queued for later (and null) when the server can't be reached. */
export async function updateProgress(r: Partial<ProgressRequest>): Promise<ProgressResponse | null> {
  await loadCwOffline();
  try {
    const resp = await mycelium.updateProgress(r);
    // Reachable again: what was written offline goes out now — minus
    // anything this write just made stale.
    if (queuedOps().length) {
      await update(ops => withoutSuperseded(ops, r.pluginId ?? '', r.mediaId ?? '', r.parentId ?? ''));
      flushCwOffline().catch(() => {});
    }
    return resp;
  } catch (e) {
    if (!isOffline(e)) {
      throw e;
    }
    await update(ops => withUpdate(ops, r));
    return null;
  }
}

/** An automatic row removal (a movie or series finished); queued when offline. */
export async function deleteProgress(pluginId: string, mediaId: string): Promise<void> {
  await loadCwOffline();
  try {
    await mycelium.deleteProgress(pluginId, mediaId);
    if (queuedOps().length) {
      await update(ops => withoutSuperseded(ops, pluginId, mediaId, ''));
    }
  } catch (e) {
    if (isOffline(e)) {
      await update(ops => withDelete(ops, pluginId, mediaId));
    }
  }
}

let flushing: Promise<void> | null = null;

/** Replays the queue, oldest first; stops at the first op the server still doesn't take. One run at a time. */
export function flushCwOffline(): Promise<void> {
  if (!flushing) {
    flushing = runFlush().finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

async function runFlush() {
  await loadCwOffline();
  const ops = queuedOps();
  let sent = 0;
  for (const op of ops) {
    let ok: boolean;
    try {
      if (op.k === 'u') {
        await mycelium.updateProgress(op.r, true);
        ok = true;
      } else if (op.k === 'd') {
        await mycelium.deleteProgress(op.p, op.m);
        ok = true;
      } else {
        ok = (await tryAdvanceContinueWatching(op.r, true)) === true;
      }
    } catch (e) {
      ok = refused(e);
    }
    if (!ok) {
      break;
    }
    sent++;
  }
  if (!sent) {
    return;
  }
  // Re-read: ops may have been queued while this ran.
  const done = new Set(ops.slice(0, sent).map(opId));
  await update(now => now.filter(op => !done.has(opId(op))));
}

/**
 * GetContinueWatching with the offline writes sent first, so the answer
 * already includes them. `fallback` (the row on screen) is what comes back
 * when the server can't be reached, with the queued writes laid over it.
 */
export async function fetchContinueWatching(fallback: ContinueWatchingItem[]): Promise<ContinueWatchingItem[]> {
  await flushCwOffline().catch(() => {});
  try {
    return await mycelium.getContinueWatching(0);
  } catch {
    return overlayQueued(fallback, queuedOps());
  }
}
