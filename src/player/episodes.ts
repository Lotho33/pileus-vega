// Episode navigation and skip markers for the player: the TV player's
// _resolveEpisodeAt / _resolveEpisodeListIfMissing (playback_screen/view.dart),
// episode_nav.dart, source_continuity.dart and models/skip_interval.dart.

import {mycelium} from '../core/api';
import type {BrowseResponse, ResolveResponse, StreamSource} from '../gen/media';
import {emptyRequest, PlayRequest} from './session';

export interface EpisodeEntry {
  id: string;
  title: string;
  thumb: string;
  episodeNumber: number;
  seasonNumber: number;
}

/** Where an episode sits: its season's list, and the series' seasons. */
export interface EpisodeNav {
  episodes: EpisodeEntry[];
  index: number;
  /** Season directory ids, in order ([] = only this list). */
  seasonIds: string[];
  seasonIndex: number;
  /** Series cover/poster, for episodes without a still. */
  seriesPoster: string;
}

// From player_tuning.dart.
export const NEXT_BANNER_WINDOW_SEC = 30;
/** Seconds of the ending (an `ed` marker) played before moving on. */
export const OUTRO_COUNTDOWN_SEC = 20;
export const MIN_DURATION_FOR_END_LOGIC_SEC = 60;
export const CW_ROLL_FORWARD = 0.9;
export const CW_DROP = 0.95;
/** Resume point of a rolled-forward CW row: past most recaps/logo stings. */
export const ROLL_FORWARD_START_SEC = 31;

/**
 * Episodes first, items as fallback: mycelium routes media tagged as an
 * episode into `episodes`, everything else into `items`.
 */
export function episodesOf(r: BrowseResponse): EpisodeEntry[] {
  if (r.episodes.length) {
    return r.episodes.map((e) => ({
      id: e.id,
      title: e.title,
      thumb: e.thumbnailUrl,
      episodeNumber: e.episodeNumber,
      seasonNumber: e.seasonNumber,
    }));
  }
  return r.items
    .filter((i) => !i.isDir)
    .map((i) => ({
      id: i.id,
      title: i.title,
      thumb: i.posterUrl,
      episodeNumber: i.episodeNumber,
      seasonNumber: i.seasonNumber,
    }));
}

export const hasNextEpisode = (n?: EpisodeNav) =>
  !!n &&
  n.index >= 0 &&
  (n.index + 1 < n.episodes.length || n.seasonIndex + 1 < n.seasonIds.length);

export const hasPrevEpisode = (n?: EpisodeNav) =>
  !!n && n.index >= 0 && (n.index > 0 || n.seasonIndex > 0);

/** The next one in this same season (no browse needed), if any. */
export const sameSeasonNext = (n?: EpisodeNav): EpisodeEntry | undefined =>
  n && n.index >= 0 ? n.episodes[n.index + 1] : undefined;

/**
 * The nav moved to episode `wanted` of the current list, crossing into the
 * previous season's last episode or the next season's first one. null when
 * there's nothing there.
 */
export async function stepEpisode(
  pluginId: string,
  nav: EpisodeNav,
  wanted: number,
): Promise<EpisodeNav | null> {
  if (wanted >= 0 && wanted < nav.episodes.length) {
    return {...nav, index: wanted};
  }
  const seasonIndex = wanted < 0 ? nav.seasonIndex - 1 : nav.seasonIndex + 1;
  if (seasonIndex < 0 || seasonIndex >= nav.seasonIds.length) {
    return null;
  }
  const episodes = episodesOf(
    await mycelium.browse(pluginId, nav.seasonIds[seasonIndex]),
  );
  if (!episodes.length) {
    return null;
  }
  return {
    ...nav,
    episodes,
    seasonIndex,
    index: wanted < 0 ? episodes.length - 1 : 0,
  };
}

/** The source labelled `label` (case-insensitive), else the first one. */
export function pickSourceByLabel(
  sources: StreamSource[],
  label: string,
): StreamSource | undefined {
  const l = label.toLowerCase();
  return (l && sources.find((s) => s.label.toLowerCase() === l)) || sources[0];
}

/** The episode has no source: the player opens its page instead. */
export class NoSourceError extends Error {
  constructor() {
    super('Nessuna fonte disponibile per questo episodio.');
    this.name = 'NoSourceError';
  }
}

/**
 * The request for the episode `nav` points at, on the source with the same
 * label as the one playing (same language across a binge). `known` skips
 * GetStreams (a prefetched episode). Throws NoSourceError when the episode
 * has no source.
 */
export async function requestForEpisode(
  cur: PlayRequest,
  nav: EpisodeNav,
  known?: StreamSource[],
): Promise<PlayRequest> {
  const ep = nav.episodes[nav.index];
  const sources = known ?? (await mycelium.getStreams(cur.pluginId, ep.id));
  const src = pickSourceByLabel(sources, cur.sourceLabel);
  if (!src) {
    throw new NoSourceError();
  }
  return emptyRequest({
    ...cur,
    streamId: src.id,
    sourceLabel: src.label,
    title: episodeTitle(ep, cur.showTitle),
    poster: ep.thumb || nav.seriesPoster || cur.poster,
    seasonNumber: ep.seasonNumber || cur.seasonNumber,
    episodeNumber: ep.episodeNumber,
    startAt: 0,
    sources,
    nav,
    directUrl: undefined,
  });
}

// episode_prefetch.dart / player_tuning.dart.
export const PREFETCH_THRESHOLD = 0.8;
const PREFETCH_RESOLVE_TIMEOUT_MS = 25000;
/** A resolved URL older than this may have expired: resolve again. */
const PREFETCH_MAX_AGE_MS = 10 * 60 * 1000;

export interface PrefetchedEpisode {
  mediaId: string;
  sources: StreamSource[];
  /** The source the next request will pick (same label as now). */
  streamId: string;
  resolved: ResolveResponse;
  at: number;
}

/**
 * Past 80% of an episode, the next one of the season is looked up and
 * resolved in the background, so "Prossimo episodio" / auto-advance open it
 * without the resolve wait. Any failure just leaves nothing cached: the
 * switch then resolves as usual.
 */
export class EpisodePrefetcher {
  private busy = false;
  private gen = 0;
  private cached: PrefetchedEpisode | null = null;

  maybeStart(
    pluginId: string,
    position: number,
    duration: number,
    next: EpisodeEntry | undefined,
    label: string,
  ) {
    if (this.busy || !next || this.cached?.mediaId === next.id) {
      return;
    }
    if (
      duration <= MIN_DURATION_FOR_END_LOGIC_SEC ||
      position / duration < PREFETCH_THRESHOLD
    ) {
      return;
    }
    this.run(pluginId, next.id, label);
  }

  private async run(pluginId: string, mediaId: string, label: string) {
    const gen = ++this.gen;
    this.busy = true;
    try {
      const sources = await mycelium.getStreams(pluginId, mediaId);
      const src = pickSourceByLabel(sources, label);
      if (gen !== this.gen || !src) {
        return;
      }
      const resolved = await mycelium.resolveStream(
        {pluginId, streamId: src.id, startPositionSec: 0, takeOver: false},
        {timeoutMs: PREFETCH_RESOLVE_TIMEOUT_MS},
      );
      if (gen !== this.gen || !resolved.resolvedUrl) {
        return;
      }
      this.cached = {
        mediaId,
        sources,
        streamId: src.id,
        resolved,
        at: Date.now(),
      };
    } catch {
      // Nothing cached: the switch resolves as usual.
    } finally {
      if (gen === this.gen) {
        this.busy = false;
      }
    }
  }

  /** The prefetched episode `mediaId`, if it's there and still fresh. */
  take(mediaId: string): PrefetchedEpisode | null {
    const c = this.cached;
    if (
      !c ||
      c.mediaId !== mediaId ||
      Date.now() - c.at > PREFETCH_MAX_AGE_MS
    ) {
      return null;
    }
    this.cached = null;
    return c;
  }

  clear() {
    this.gen++;
    this.busy = false;
    this.cached = null;
  }
}

export function episodeTitle(ep: EpisodeEntry, show: string): string {
  return (
    ep.title || (ep.episodeNumber > 0 ? `Episodio ${ep.episodeNumber}` : show)
  );
}

/**
 * The stream id a rolled-forward CW row for `next` should carry: its source
 * with the label playing now, so resuming it keeps the language. Falls back
 * to the bare episode id.
 */
export async function streamIdForNext(
  pluginId: string,
  next: EpisodeEntry,
  label: string,
): Promise<string> {
  try {
    return (
      pickSourceByLabel(await mycelium.getStreams(pluginId, next.id), label)
        ?.id || next.id
    );
  } catch {
    return next.id;
  }
}

/**
 * The episode list for a request that came without one (a Continue Watching
 * resume): the series' seasons from GetDetails(parent), the season with the
 * episode's number, the episode by number. Also recovers the source label
 * (CW only stores the stream id), so the next episode keeps the language.
 * null when it can't be placed.
 */
export async function loadEpisodeNav(
  req: PlayRequest,
): Promise<{nav: EpisodeNav; sourceLabel: string} | null> {
  if (req.isLive || req.nav || !req.parentId || req.episodeNumber <= 0) {
    return null;
  }
  const details = await mycelium.getDetails(req.pluginId, req.parentId);
  const seasons = details.series?.seasons ?? [];
  let seasonIds: string[];
  let seasonIndex: number;
  let episodes: EpisodeEntry[];
  if (seasons.length) {
    seasonIds = seasons.map((s) => s.directoryId);
    seasonIndex = Math.max(
      0,
      seasons.findIndex((s) => s.number === req.seasonNumber),
    );
    episodes = episodesOf(
      await mycelium.browse(req.pluginId, seasonIds[seasonIndex]),
    );
  } else {
    // A flat list straight off the parent.
    seasonIds = [];
    seasonIndex = 0;
    episodes = episodesOf(await mycelium.browse(req.pluginId, req.parentId));
  }
  const index = episodes.findIndex(
    (e) =>
      e.episodeNumber === req.episodeNumber &&
      (!e.seasonNumber ||
        !req.seasonNumber ||
        e.seasonNumber === req.seasonNumber),
  );
  if (index < 0) {
    return null;
  }
  let sourceLabel = req.sourceLabel;
  if (!sourceLabel && episodes[index].id !== req.streamId) {
    try {
      const sources = await mycelium.getStreams(
        req.pluginId,
        episodes[index].id,
      );
      sourceLabel = sources.find((s) => s.id === req.streamId)?.label ?? '';
    } catch {
      // Best effort: the next episode then plays its first source.
    }
  }
  const seriesPoster =
    details.item?.extra?.cover_url || details.item?.posterUrl || '';
  return {
    nav: {episodes, index, seasonIds, seasonIndex, seriesPoster},
    sourceLabel,
  };
}

// ── Skip markers ─────────────────────────────────────────────────────────

export type SkipType = 'op' | 'ed' | 'recap';

export interface SkipInterval {
  type: SkipType;
  start: number;
  end: number;
}

export const SKIP_LABELS: Record<SkipType, string> = {
  op: 'Salta sigla',
  ed: 'Salta ending',
  recap: 'Salta recap',
};

/**
 * The `extra.skip_times` JSON mycelium attaches to a resolved stream
 * (AniSkip-style intro/outro/recap markers). Bad entries are dropped.
 */
export function parseSkipTimes(json: string | undefined): SkipInterval[] {
  if (!json) {
    return [];
  }
  let list: unknown;
  try {
    list = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) {
    return [];
  }
  const out: SkipInterval[] = [];
  for (const r of list) {
    const type = r?.skipType;
    const start = Number(r?.interval?.startTime);
    const end = Number(r?.interval?.endTime);
    if (
      (type === 'op' || type === 'ed' || type === 'recap') &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      end > start
    ) {
      out.push({type, start, end});
    }
  }
  return out;
}

/**
 * The interval covering `pos`, ending a second early so the button doesn't
 * flash on for the last tick only to come back on the next one.
 */
export function activeSkip(
  intervals: SkipInterval[],
  pos: number,
): SkipInterval | null {
  return intervals.find((i) => pos >= i.start && pos < i.end - 1) ?? null;
}

/**
 * The "Prossimo episodio" countdown at `pos` (next_episode_countdown.dart).
 * Two things start it: the ending, counting OUTRO_COUNTDOWN_SEC of playback
 * from the start of the `ed` marker (pausing pauses it; an ending shorter
 * than that just plays on), and the last NEXT_BANNER_WINDOW_SEC of the file.
 * The shorter one is shown. `dismissed` (banner closed): hidden, and the
 * ending no longer advances — the end of the file still does.
 * The caller checks there is a next episode and the duration is long enough.
 */
export function nextEpisodeTick(
  pos: number,
  duration: number,
  skips: SkipInterval[],
  dismissed = false,
): {bannerSecs: number | null; advance: boolean} {
  const remaining = duration - pos;
  if (remaining <= 0.5) {
    return {bannerSecs: null, advance: true};
  }
  const ed = activeSkip(skips, pos);
  const outroLeft =
    ed?.type === 'ed'
      ? Math.max(0, Math.ceil(OUTRO_COUNTDOWN_SEC - (pos - ed.start)))
      : null;
  if (outroLeft === 0 && !dismissed) {
    return {bannerSecs: null, advance: true};
  }
  if (dismissed) {
    return {bannerSecs: null, advance: false};
  }
  const candidates = [
    ...(remaining <= NEXT_BANNER_WINDOW_SEC ? [Math.ceil(remaining)] : []),
    ...(outroLeft !== null ? [outroLeft] : []),
  ];
  return {
    bannerSecs: candidates.length ? Math.min(...candidates) : null,
    advance: false,
  };
}
