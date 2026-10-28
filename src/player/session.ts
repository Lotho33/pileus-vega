// What a playback needs and how it talks to mycelium: resolve with retries
// (playback_bloc.dart) and Continue Watching progress (UpdateProgress).

import {mycelium} from '../core/api';
import {GrpcError, GrpcStatus} from '../core/grpcWeb';
import type {ContinueWatchingItem, ResolveResponse, StreamSource} from '../gen/media';
import type {EpisodeNav} from './episodes';

/** Everything the player screen needs; built by the details pages and CW. */
export interface PlayRequest {
  pluginId: string;
  /** The chosen source; Continue Watching is keyed by it (media_id). */
  streamId: string;
  sourceLabel: string;
  /** Series id for episodes (CW parent_id), '' for movies. */
  parentId: string;
  /** Episode or movie title. */
  title: string;
  /** Show name for episodes (CW navigation_context). */
  showTitle: string;
  poster: string;
  plot: string;
  genres: string[];
  rating: number;
  year: number;
  seasonNumber: number;
  episodeNumber: number;
  /** Resume point in seconds. */
  startAt: number;
  isLive: boolean;
  /** Other sources of the same item (live: switch source in the player). */
  sources: StreamSource[];
  /**
   * A finished server-side download (its signed file_url): played as is,
   * no ResolveStream. streamId is then the item's media id (CW key).
   */
  directUrl?: string;
  /**
   * The episode list around this one (previous/next episode, auto-advance).
   * Filled by the series page; a Continue Watching resume loads it in the
   * player (loadEpisodeNav).
   */
  nav?: EpisodeNav;
}

export function emptyRequest(over: Partial<PlayRequest>): PlayRequest {
  return {
    pluginId: '',
    streamId: '',
    sourceLabel: '',
    parentId: '',
    title: '',
    showTitle: '',
    poster: '',
    plot: '',
    genres: [],
    rating: 0,
    year: 0,
    seasonNumber: 0,
    episodeNumber: 0,
    startAt: 0,
    isLive: false,
    sources: [],
    ...over,
  };
}

/** Resuming a Continue Watching card (its media_id is the stream id). */
export function requestFromCw(cw: ContinueWatchingItem): PlayRequest {
  const isEpisode = cw.seasonNumber > 0 || cw.episodeNumber > 0 || !!cw.parentId;
  return emptyRequest({
    pluginId: cw.pluginId,
    streamId: cw.mediaId,
    parentId: cw.parentId,
    title: cw.title,
    showTitle: isEpisode ? cw.navigationContext : '',
    poster: cw.poster,
    plot: cw.plot,
    genres: cw.genres,
    rating: cw.rating,
    year: cw.year,
    seasonNumber: cw.seasonNumber,
    episodeNumber: cw.episodeNumber,
    startAt: cw.progressTime,
  });
}

export const RETRY_DELAYS_MS = [2000, 5000, 10000];

export type ResolveFailure =
  | {kind: 'elsewhere'; message: string}
  | {kind: 'fatal'; message: string}
  | {kind: 'retry'; message: string};

/** How a resolve error should be handled (same split as playback_bloc.dart). */
export function classifyResolveError(e: unknown): ResolveFailure {
  const message = e instanceof Error ? e.message : String(e);
  if (e instanceof GrpcError) {
    if (e.code === GrpcStatus.ABORTED) {
      return {kind: 'elsewhere', message};
    }
    if (
      e.code === GrpcStatus.FAILED_PRECONDITION ||
      e.code === GrpcStatus.UNAUTHENTICATED ||
      e.code === GrpcStatus.PERMISSION_DENIED ||
      e.code === GrpcStatus.NOT_FOUND
    ) {
      return {kind: 'fatal', message};
    }
  }
  return {kind: 'retry', message};
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * ResolveStream with the Flutter app's backoff. `onRetry` reports the attempt;
 * `isCancelled` stops between attempts once the player is gone.
 */
export async function resolveWithRetry(
  req: PlayRequest,
  opts: {takeOver?: boolean; onRetry?: (attempt: number, of: number) => void; isCancelled: () => boolean},
): Promise<ResolveResponse> {
  let last: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      opts.onRetry?.(attempt, RETRY_DELAYS_MS.length);
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }
    if (opts.isCancelled()) {
      throw new GrpcError(GrpcStatus.CANCELLED, 'annullato');
    }
    try {
      const r = await mycelium.resolveStream({
        pluginId: req.pluginId,
        streamId: req.streamId,
        startPositionSec: req.isLive ? 0 : req.startAt,
        takeOver: !!opts.takeOver,
      });
      if (!r.resolvedUrl) {
        throw new GrpcError(GrpcStatus.FAILED_PRECONDITION, 'Stream non disponibile: URL non risolto.');
      }
      return r;
    } catch (e) {
      if (classifyResolveError(e).kind !== 'retry') {
        throw e;
      }
      last = e;
    }
  }
  throw last;
}

/** Below this the position isn't worth a CW entry. */
export const MIN_PROGRESS_SEC = 5;

/**
 * Sends the CW position. The full metadata goes with every call (the server
 * merges, so this is cheap) — simpler than tracking a "first beat".
 * Returns the device now playing instead, when the playback was taken over.
 */
export async function saveProgress(req: PlayRequest, position: number, duration: number): Promise<string | null> {
  if (req.isLive || position < MIN_PROGRESS_SEC || duration <= 0) {
    return null;
  }
  const r = await mycelium.updateProgress({
    pluginId: req.pluginId,
    mediaId: req.streamId,
    parentId: req.parentId,
    currentPosition: Math.floor(position),
    totalDuration: Math.floor(duration),
    navigationContext: req.showTitle,
    title: req.title,
    poster: req.poster,
    rating: req.rating,
    genres: req.genres,
    plot: req.plot,
    year: req.year,
    seasonNumber: req.seasonNumber,
    episodeNumber: req.episodeNumber,
  });
  return r.playbackElsewhere ? r.playingOn || 'un altro dispositivo' : null;
}

export function fmtClock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
