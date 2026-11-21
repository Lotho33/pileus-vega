// End of an episode with no next one in the season the player holds (last
// episode of a season, or a resume whose episode list couldn't be loaded):
// what Continue Watching does with the row. Port of pileus-player's
// lib/features/player/cw_advance.dart.
//
// The same-season case stays in the player (it rolls the row forward at
// CW_ROLL_FORWARD from its own list). This covers the rest at CW_DROP: the
// first episode of the next season becomes the row (31 s in, like the
// same-season roll), the row goes when the series really is over, and a
// movie never comes here (callers check isEpisodeOfSeries first).
//
// Plain data: a row finished while the server was unreachable is queued
// as-is (core/cwOffline) and replayed once it answers — finding the next
// episode needs the server.

import {mycelium} from '../core/api';
import {GrpcError, GrpcStatus} from '../core/grpcWeb';
import {queueCwAdvance} from '../core/cwOffline';
import {EpisodeEntry, episodesOf, ROLL_FORWARD_START_SEC, streamIdForNext} from './episodes';

export interface CwAdvanceRequest {
  pluginId: string;
  /** The series id Continue Watching groups the row under. */
  seriesId: string;
  /** The row to replace (a stream id or a bare episode id). */
  currentCwId: string;
  currentTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  /** Season directory ids the player knew, in order — only used when the series' details don't list them. */
  knownSeasonIds: string[];
  sourceLabel: string;
  showTitle: string;
  seriesPoster: string;
  fallbackPoster: string;
  rating: number;
  genres: string[];
  plot: string;
  year: number;
}

/**
 * True when `mediaId` is an episode of the series `parentId` — the only case
 * where moving on to "the next one" makes sense (never a movie, whose launch
 * carries no parent, or the parent's own id).
 */
export const isEpisodeOfSeries = (parentId: string, mediaId: string) => !!parentId && parentId !== mediaId;

/** The server didn't answer (vs a plugin error): worth retrying later. */
export const isOffline = (e: unknown) =>
  e instanceof GrpcError && (e.code === GrpcStatus.UNAVAILABLE || e.code === GrpcStatus.DEADLINE_EXCEEDED);

/** Moves the row on; queues it for later when the server can't be reached. Fire-and-forget. */
export async function advanceContinueWatching(r: CwAdvanceRequest): Promise<void> {
  if ((await tryAdvanceContinueWatching(r)) === null) {
    await queueCwAdvance(r);
  }
}

/**
 * advanceContinueWatching without the queueing: true when handled (moved to
 * the next episode, removed because the series is over, or left alone
 * because the plugin couldn't say), null when the server didn't answer.
 * `replay`: run from the offline queue — the write must not claim the
 * profile's playback lease.
 */
export async function tryAdvanceContinueWatching(r: CwAdvanceRequest, replay = false): Promise<true | null> {
  let next: Next | null;
  try {
    next = await findNext(r);
  } catch (e) {
    if (isOffline(e)) {
      return null;
    }
    return true; // the plugin can't tell: the row stays as it is
  }
  try {
    if (!next) {
      return true;
    }
    if (next === 'end') {
      await mycelium.deleteProgress(r.pluginId, r.currentCwId);
      return true;
    }
    const ep = next;
    const streamId = await streamIdForNext(r.pluginId, ep, r.sourceLabel);
    await mycelium.updateProgress(
      {
        pluginId: r.pluginId,
        mediaId: streamId,
        parentId: r.seriesId,
        // As the same-season roll forward: an empty bar, resuming past the recap.
        currentPosition: ROLL_FORWARD_START_SEC,
        totalDuration: 0,
        navigationContext: r.showTitle,
        title: ep.title || r.showTitle,
        poster: ep.thumb || r.seriesPoster || r.fallbackPoster,
        rating: r.rating,
        genres: r.genres,
        plot: r.plot,
        year: r.year,
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
      },
      replay,
    );
    // The server already drops the series' other rows on that upsert; this
    // covers a row stored under another parent id.
    if (streamId !== r.currentCwId) {
      await mycelium.deleteProgress(r.pluginId, r.currentCwId);
    }
    return true;
  } catch (e) {
    return isOffline(e) ? null : true;
  }
}

type Next = EpisodeEntry | 'end';

// How many season folders to browse looking for the current episode when its
// season number is unknown (an old row).
const MAX_SEASON_WALK = 40;

const matchKey = (t: string | undefined) => (t ?? '').trim().toLowerCase();

/** The playing episode's index: by id, title, id fragment, then season/episode numbers. */
export function matchEpisode(eps: EpisodeEntry[], r: CwAdvanceRequest): number {
  const target = matchKey(r.currentTitle);
  let idx = eps.findIndex(e => e.id === r.currentCwId);
  if (idx < 0 && target) {
    idx = eps.findIndex(e => matchKey(e.title) === target);
  }
  if (idx < 0) {
    idx = eps.findIndex(e => e.id.length >= 8 && r.currentCwId.includes(e.id));
  }
  if (idx >= 0 || r.episodeNumber <= 0) {
    return idx;
  }
  return eps.findIndex(
    e =>
      e.episodeNumber === r.episodeNumber &&
      (r.seasonNumber <= 0 || e.seasonNumber <= 0 || e.seasonNumber === r.seasonNumber),
  );
}

async function seasonEpisodes(pluginId: string, seasonId: string): Promise<EpisodeEntry[]> {
  return episodesOf(await mycelium.browse(pluginId, seasonId));
}

/** The episode after the current one across seasons, 'end' when the series is over, null when it can't be placed. */
async function findNext(r: CwAdvanceRequest): Promise<Next | null> {
  const details = await mycelium.getDetails(r.pluginId, r.seriesId);
  if (!details.series) {
    // Not a series after all (a movie launched with a parent id): finished.
    return details.movie ? 'end' : null;
  }
  const seasons = details.series.seasons.filter(s => s.directoryId);
  let seasonIds = seasons.map(s => s.directoryId);
  const seasonNums = seasons.map(s => s.number);
  if (!seasonIds.length && r.knownSeasonIds.length) {
    seasonIds = r.knownSeasonIds;
  }
  if (!seasonIds.length) {
    // Single-level series: the episodes sit right under it.
    const eps = episodesOf(await mycelium.browse(r.pluginId, r.seriesId));
    const idx = matchEpisode(eps, r);
    if (idx < 0) {
      return null;
    }
    return idx + 1 < eps.length ? eps[idx + 1] : 'end';
  }
  // The current season first when its number is known, then the others.
  const order = seasonIds.map((_, i) => i);
  const si0 = r.seasonNumber > 0 ? seasonNums.indexOf(r.seasonNumber) : -1;
  if (si0 >= 0) {
    order.splice(si0, 1);
    order.unshift(si0);
  }
  for (const si of order.slice(0, MAX_SEASON_WALK)) {
    const eps = await seasonEpisodes(r.pluginId, seasonIds[si]);
    const idx = matchEpisode(eps, r);
    if (idx < 0) {
      continue;
    }
    if (idx + 1 < eps.length) {
      return eps[idx + 1];
    }
    // Last of its season: the first episode of the next season with any.
    for (let n = si + 1; n < seasonIds.length; n++) {
      const next = await seasonEpisodes(r.pluginId, seasonIds[n]);
      if (next.length) {
        const first = next[0];
        return {...first, seasonNumber: first.seasonNumber || seasonNums[n] || 0};
      }
    }
    return 'end';
  }
  return null;
}
