// Pure helpers for the details screens, ported from pileus-player's
// series_page_layout (labels, related JSON, episode window), the quick-look
// popup's fields and browse_screen.dart's episode-list test.

import type {CatalogItem, DetailsResponse, SeasonInfo} from '../gen/media';

const STATUS: Record<string, string> = {
  FINISHED: 'Concluso',
  RELEASING: 'In corso',
  NOT_YET_RELEASED: 'Non ancora uscito',
  CANCELLED: 'Cancellato',
  HIATUS: 'In pausa',
  Ended: 'Conclusa',
  Continuing: 'In corso',
  'Returning Series': 'In corso',
  Canceled: 'Cancellata',
};

export function fmtStatus(s: string): string {
  return STATUS[s] ?? s;
}

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** "2023-04-02" → "apr 2023"; a bare year stays as is. */
export function fmtAirDate(d: string): string {
  const [year, month] = d.split('-');
  const m = parseInt(month ?? '', 10);
  return m >= 1 && m <= 12 ? `${MONTHS[m - 1]} ${year}` : year ?? '';
}

export function seasonLabel(seasons: SeasonInfo[], i: number): string {
  const s = seasons[i];
  if (!s) {
    return '';
  }
  if (s.label) {
    return s.label;
  }
  return s.number > 0 ? `Stagione ${s.number}` : `Gruppo ${i + 1}`;
}

export interface RelatedEntry {
  id: string;
  title: string;
  poster: string;
  /** SEQUEL / PREQUEL / … (AniList relations), '' for "similar". */
  rel: string;
}

const REL_LABEL: Record<string, string> = {
  SEQUEL: 'Sequel',
  PREQUEL: 'Prequel',
  SIDE_STORY: 'Side story',
  SPIN_OFF: 'Spin-off',
};

export function relLabel(rel: string): string {
  return REL_LABEL[rel] ?? '';
}

function parseList(raw: string | undefined): RelatedEntry[] {
  if (!raw) {
    return [];
  }
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) {
      return [];
    }
    return v
      .filter(x => x && typeof x === 'object' && x.id)
      .map(x => ({
        id: String(x.id),
        title: String(x.title ?? ''),
        poster: String(x.poster ?? ''),
        rel: String(x.rel ?? ''),
      }));
  } catch {
    return [];
  }
}

/** The two sources of the details footer: extra.related and extra.similar. */
export function relatedLists(extra: {[k: string]: string} | undefined): {related: RelatedEntry[]; similar: RelatedEntry[]} {
  return {related: parseList(extra?.related), similar: parseList(extra?.similar)};
}

/** extra.related then extra.similar (JSON arrays), without duplicates. */
export function parseRelated(extra: {[k: string]: string} | undefined): RelatedEntry[] {
  const seen = new Set<string>();
  return [...parseList(extra?.related), ...parseList(extra?.similar)].filter(e => {
    if (seen.has(e.id)) {
      return false;
    }
    seen.add(e.id);
    return true;
  });
}

/**
 * First visible episode once `focused` has focus: the window of `size`
 * rows only slides when focus walks past either edge (Flutter _focusEpisode).
 */
export function episodeWindow(start: number, focused: number, size: number, total: number): number {
  let s = start;
  if (focused < s) {
    s = focused;
  } else if (focused >= s + size) {
    s = focused - size + 1;
  }
  return Math.max(0, Math.min(s, Math.max(0, total - size)));
}

/** What the quick-look popup shows, from GetDetails. */
export interface Info {
  year: number;
  rating: number;
  runtime: string;
  contentRating: string;
  status: string;
  network: string;
  genres: string[];
  plot: string;
  cast: string[];
}

export function infoOf(r: DetailsResponse): Info {
  const item = r.item;
  const m = r.movie;
  const s = r.series;
  return {
    year: m?.year || s?.year || item?.year || 0,
    rating: item?.rating ?? 0,
    runtime: m?.runtime || s?.episodeRuntime || '',
    contentRating: m?.contentRating || s?.contentRating || '',
    status: s?.status ?? '',
    network: s?.network ?? '',
    genres: (m?.genres?.length ? m.genres : s?.genres) ?? [],
    plot: m?.plot || s?.plot || r.episode?.plot || item?.extra?.plot || '',
    cast: (m?.cast?.length ? m.cast : s?.cast) ?? [],
  };
}

export function isAnimeItem(i: CatalogItem): boolean {
  return !!i.extra?.anilist_id || !!i.extra?.mal_id;
}

/** _isEpisodeList: the first child is a playable episode. */
export function isEpisodeList(items: CatalogItem[]): boolean {
  const f = items[0];
  return !!f && !f.isDir && (f.episodeNumber > 0 || isAnimeItem(f));
}
