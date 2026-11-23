// What the player's info panel shows about the title playing — "what year is
// this from?" without leaving the player. Port of pileus-player's
// lib/features/player/player_info.dart: built at once from what the player
// knows (playerInfoBase) and completed from the plugin's details
// (loadPlayerInfo / mergePlayerInfo).

import {mycelium} from '../core/api';
import type {DetailsResponse} from '../gen/media';

export interface PlayerInfo {
  /** Big line: the film, the episode's title, or the live event. */
  title: string;
  /** Above the title: the series for an episode, the competition for a live. */
  overline: string;
  /** "S2 · E5", "In diretta", or ''. */
  badge: string;
  /** Year, runtime, rating, age rating… in display order. */
  facts: string[];
  genres: string[];
  plot: string;
  /** Label → value ("Regia", "Cast", "Canale"…), only those known. */
  rows: [string, string][];
}

export function formatRuntime(minutes: number): string {
  if (minutes <= 0) {
    return '';
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) {
    return `${m} min`;
  }
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const formatRating = (r: number) => (r > 0 ? `★ ${r.toFixed(1)}` : '');

export function playerInfoBase(o: {
  title: string;
  showTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  year?: number;
  rating?: number;
  durationSeconds?: number;
  genres?: string[];
  plot?: string;
  isLive?: boolean;
}): PlayerInfo {
  const show = o.showTitle ?? '';
  const isEpisode = !!show && show !== o.title;
  const ep = o.episodeNumber ?? 0;
  const season = o.seasonNumber ?? 0;
  const badge = o.isLive ? 'In diretta' : ep > 0 ? (season > 0 ? `S${season} · E${ep}` : `Episodio ${ep}`) : '';
  const facts: string[] = [];
  if ((o.year ?? 0) > 0) {
    facts.push(`${o.year}`);
  }
  if (!o.isLive && (o.durationSeconds ?? 0) >= 60) {
    facts.push(formatRuntime(Math.round((o.durationSeconds ?? 0) / 60)));
  }
  if ((o.rating ?? 0) > 0) {
    facts.push(formatRating(o.rating ?? 0));
  }
  return {
    title: o.title || show,
    overline: isEpisode ? show : '',
    badge,
    facts,
    genres: o.genres ?? [],
    plot: (o.plot ?? '').trim(),
    rows: [],
  };
}

const MONTHS = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
];

function fmtDate(iso: string): string {
  const s = iso.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : s;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso.trim());
  if (!iso.trim() || isNaN(d.getTime())) {
    return iso.trim();
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function status(s: string): string {
  switch (s.toLowerCase()) {
    case 'ended':
    case 'finished':
      return 'Conclusa';
    case 'continuing':
    case 'releasing':
    case 'returning series':
      return 'In corso';
    case 'canceled':
    case 'cancelled':
      return 'Cancellata';
    default:
      return s;
  }
}

/** Pure: `base` with what `item` / `series` add. */
export function mergePlayerInfo(
  base: PlayerInfo,
  item?: DetailsResponse | null,
  series?: DetailsResponse | null,
): PlayerInfo {
  const facts = [...base.facts];
  let {genres, plot, title, overline} = base;
  const rows: [string, string][] = [...base.rows];
  const fact = (f: string) => {
    if (f && !facts.includes(f)) {
      facts.push(f);
    }
  };
  const row = (label: string, value: string) => {
    if (value && value.trim()) {
      rows.push([label, value.trim()]);
    }
  };
  const list = (v: string[], max = 8) =>
    v
      .filter(x => x.trim())
      .slice(0, max)
      .join(', ');
  const hasYear = () => facts.some(f => /^\d{4}$/.test(f));
  const hasRuntime = () => facts.some(f => f.includes('min') || f.endsWith(' h'));

  const m = item?.movie;
  if (m) {
    if (!hasYear() && m.year > 0) {
      facts.unshift(`${m.year}`);
    }
    if (!hasRuntime()) {
      fact(m.runtime);
    }
    fact(m.contentRating);
    if (!genres.length) {
      genres = m.genres;
    }
    if (m.plot.trim()) {
      plot = m.plot.trim();
    }
    row('Slogan', m.tagline);
    row('Regia', list(m.directors, 4));
    row('Cast', list(m.cast));
    row('Uscita', fmtDate(m.released));
  }
  const e = item?.episode;
  if (e) {
    if (e.plot.trim()) {
      plot = e.plot.trim();
    }
    if (!hasRuntime()) {
      fact(formatRuntime(e.duration));
    }
    if (e.vote > 0 && !facts.some(f => f.startsWith('★'))) {
      fact(formatRating(e.vote));
    }
    row('Regia', list(e.directors, 4));
    row('Ospiti', list(e.guestStars));
    row('In onda', fmtDate(e.airDate));
  }
  const l = item?.live;
  if (l) {
    if (l.competition) {
      overline = l.competition;
    }
    if (l.teams.length >= 2 && !title) {
      title = l.teams.join(' – ');
    }
    row('Squadre', list(l.teams, 4));
    row('Canale', l.channelName);
    row('Inizio', fmtDateTime(l.streamStart));
    row('Fine', fmtDateTime(l.streamEnd));
    if (l.isReplay) {
      fact('Replica');
    }
  }
  const s = series?.series;
  if (s) {
    if (!hasYear() && s.year > 0) {
      facts.unshift(`${s.year}`);
    }
    fact(s.contentRating);
    if (!genres.length) {
      genres = s.genres;
    }
    if (!plot && s.plot.trim()) {
      plot = s.plot.trim();
    }
    row('Ideata da', list(s.creators, 4));
    row('Cast', list(s.cast));
    row('Rete', s.network);
    row('Stato', status(s.status));
  }
  const seen = new Set<string>();
  return {
    ...base,
    title,
    overline,
    facts,
    genres,
    plot,
    rows: rows.filter(([label]) => {
      if (seen.has(label)) {
        return false;
      }
      seen.add(label);
      return true;
    }),
  };
}

/** `base` completed from the plugin's details; whatever fails is left out. */
export async function loadPlayerInfo(
  base: PlayerInfo,
  pluginId: string,
  itemId: string,
  seriesId = '',
): Promise<PlayerInfo> {
  const get = (id: string) => (id ? mycelium.getDetails(pluginId, id).catch(() => null) : Promise.resolve(null));
  const [item, series] = await Promise.all([get(itemId), seriesId && seriesId !== itemId ? get(seriesId) : null]);
  return mergePlayerInfo(base, item, series);
}
