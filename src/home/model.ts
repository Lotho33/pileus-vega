// View models for the home: catalog items and continue-watching rows both
// feed the same hero + carousel widgets, so they're normalized here
// (the Flutter app does the same with its SDUI CardData).

import {languageBadge} from '../core/language';
import {liveStartAt, liveWhenShort} from '../details/live';
import type {CatalogDef, CatalogItem, ContinueWatchingItem} from '../gen/media';
import type {EpisodeNav} from '../player/episodes';

export interface HeroItem {
  key: string;
  title: string;
  logo: string;
  year: number;
  rating: number;
  genres: string[];
  plot: string;
  background: string;
}

/** What pressing a card opens (openCatalogItem in pileus-player). */
export interface OpenTarget {
  pluginId: string;
  mediaId: string;
  mediaType: string;
  isDir: boolean;
  title: string;
  /** The catalog item itself (the live popup reads its extra). */
  item?: CatalogItem;
  /** Continue Watching entry: pressing the card resumes it. */
  cw?: ContinueWatchingItem;
  /**
   * Which page the details stack shows: the details page (default), a
   * folder's contents (browse_screen.dart) or a single episode
   * (episode_detail_screen.dart).
   */
  view?: 'details' | 'browse' | 'episode';
  /** Episode page: the show's name. */
  showTitle?: string;
  /** Episode page: the episode list around it (previous/next, batch download). */
  nav?: EpisodeNav;
  /** Episode page: the source label to prefer (same language as before). */
  sourceLabel?: string;
}

export interface CardModel {
  key: string;
  open: OpenTarget;
  title: string;
  image: string;
  /** Second line under a landscape card's title (CW: "Serie · S2 · E5"). */
  overline: string;
  /** 0..1, CW only. */
  progress: number;
  progressLabel: string;
  badge: string;
  /** Not on air yet: when it starts ("Oggi 20:45"), top-right on live cards. */
  when?: string;
  /** Language pill, top-right on poster cards (extra.lang/subs). */
  lang?: {label: string; color: string} | null;
  hero: HeroItem;
}

export type CardVariant = 'poster' | 'landscape';

export function variantFor(def: CatalogDef): CardVariant {
  return def.cardLayout === 'landscape' || def.type === 'live' ? 'landscape' : 'poster';
}

function splitGenres(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map(g => g.trim())
    .filter(Boolean)
    .slice(0, 4);
}

// Same order as HomeHeroBackground._urlFor in pileus-player.
function heroBackground(i: CatalogItem): string {
  const e = i.extra ?? {};
  if (e.fanart_url) {
    return e.fanart_url;
  }
  if (e.catalog_bg_url) {
    return e.catalog_bg_url;
  }
  // Sport/live posters are usually low-res team logos.
  if (e.sport_cat) {
    return '';
  }
  return i.posterUrl;
}

function whenShort(e: {[k: string]: string}): string {
  const at = liveStartAt(e);
  return at ? liveWhenShort(at) : '';
}

export function catalogCard(pluginId: string, i: CatalogItem, variant: CardVariant): CardModel {
  const e = i.extra ?? {};
  const isLiveNow = e.is_live === 'true' || e.is_live === '1';
  return {
    key: `${pluginId}:${i.id}`,
    open: {pluginId, mediaId: i.id, mediaType: i.mediaType, isDir: i.isDir, title: i.title, item: i},
    title: i.title,
    image: variant === 'landscape' ? i.bannerUrl || i.posterUrl : i.posterUrl,
    overline: '',
    progress: 0,
    progressLabel: '',
    badge: isLiveNow ? 'IN DIRETTA' : '',
    when: !isLiveNow && variant === 'landscape' ? whenShort(e) : '',
    lang: variant === 'poster' ? languageBadge(e.lang, e.subs) : null,
    hero: {
      key: `${pluginId}:${i.id}`,
      title: i.title,
      logo: i.logoUrl,
      year: i.year,
      rating: i.rating,
      genres: splitGenres(e.genres),
      plot: e.plot ?? '',
      background: heroBackground(i),
    },
  };
}

export function episodeBadge(season: number, episode: number): string {
  if (season > 0 && episode > 0) {
    return `S${season} · E${episode}`;
  }
  return episode > 0 ? `E${episode}` : '';
}

function clock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function remaining(secs: number): string {
  const m = Math.max(1, Math.round(secs / 60));
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return mm ? `${h} h ${mm} min rimanenti` : `${h} h rimanenti`;
  }
  return `${m} min rimanenti`;
}

export function cwCard(i: ContinueWatchingItem): CardModel {
  // Episode title in `title`, show name in `navigation_context`.
  const show = i.navigationContext;
  const badge = episodeBadge(i.seasonNumber, i.episodeNumber);
  const showOverline = !!show && show.toLowerCase() !== i.title.toLowerCase();
  const overline = showOverline ? [show, badge].filter(Boolean).join(' · ') : badge;
  const progress = i.totalTime > 0 ? Math.min(1, i.progressTime / i.totalTime) : 0;
  return {
    key: `cw:${i.pluginId}:${i.mediaId}`,
    // Resumes playback (media_id is the stream id); the show's page is the
    // fallback target (parent_id is the series for episodes).
    open: {
      pluginId: i.pluginId,
      mediaId: i.parentId || i.mediaId,
      mediaType: i.parentId ? 'series' : '',
      isDir: !!i.parentId,
      title: i.navigationContext || i.title,
      cw: i,
    },
    title: i.title,
    image: i.poster,
    overline,
    progress,
    progressLabel:
      i.totalTime > 0 ? `${clock(i.progressTime)} · ${remaining(i.totalTime - i.progressTime)}` : '',
    badge: '',
    hero: {
      key: `cw:${i.pluginId}:${i.mediaId}`,
      // The hero reads like the show's own page, never the episode's.
      title: show || i.title,
      logo: '',
      year: i.year,
      rating: i.rating,
      genres: i.genres.slice(0, 4),
      plot: i.plot,
      background: i.poster,
    },
  };
}
