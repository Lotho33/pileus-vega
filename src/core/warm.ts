// Asks the server to prepare a stream before the user presses Play
// (WarmStream) — pileus-player's stream_warmer.dart. Only from where a Play
// is the likely next step: a title's watch buttons, an episode popup, a
// Continue Watching card the D-pad rests on. Never from rows or search.
//
// Client rules, on top of the server's own caps: DELAY_MS of dwell first
// (cancelled before then = no request), one warm per plugin + stream per
// run, nothing for a plugin the server said it won't warm, nothing at all
// once the server answered UNIMPLEMENTED.

import {useEffect} from 'react';
import {mycelium} from './api';
import {GrpcError, GrpcStatus} from './grpcWeb';

export const WARM_DELAY_MS = 1500;

const warmed = new Set<string>();
const disabled = new Set<string>();
let unsupported = false;

export function canWarm(pluginId: string): boolean {
  return !unsupported && !!pluginId && !disabled.has(pluginId);
}

function warm(pluginId: string, streamId: string) {
  mycelium
    .warmStream(pluginId, streamId)
    .then(r => {
      if (r.outcome === 'skipped' && r.reason === 'disabled') {
        disabled.add(pluginId);
      }
    })
    .catch(e => {
      if (e instanceof GrpcError && e.code === GrpcStatus.UNIMPLEMENTED) {
        unsupported = true;
      }
    });
}

/** Warms `streamId` after the dwell; the returned function cancels. */
export function scheduleWarm(pluginId: string, streamId: string): () => void {
  if (!streamId || !canWarm(pluginId)) {
    return () => {};
  }
  const t = setTimeout(() => {
    const key = `${pluginId}\u0000${streamId}`;
    if (!canWarm(pluginId) || warmed.has(key)) {
      return;
    }
    warmed.add(key);
    warm(pluginId, streamId);
  }, WARM_DELAY_MS);
  return () => clearTimeout(t);
}

/** Warms while mounted with the same stream; '' = nothing to warm. */
export function useWarm(pluginId: string, streamId: string) {
  useEffect(() => scheduleWarm(pluginId, streamId), [pluginId, streamId]);
}
