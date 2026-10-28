// The Continue Watching hero (shell.dart's _fetchCwHero): the card's own
// fields show at once, then GetDetails of the show (or the movie) upgrades
// it with the logo, the fanart and the show's plot/genres. Results are kept
// per show; a lookup that fails isn't retried for 30 s.

import {mycelium} from '../core/api';
import type {ContinueWatchingItem} from '../gen/media';
import type {HeroItem} from './model';

const RETRY_AFTER_MS = 30000;

const cache = new Map<string, HeroItem>();
const triedAt = new Map<string, number>();

export function cwHeroKey(i: ContinueWatchingItem): string {
  return `${i.pluginId}/${i.parentId || i.mediaId}`;
}

export function cachedCwHero(i: ContinueWatchingItem): HeroItem | undefined {
  return cache.get(cwHeroKey(i));
}

/** The upgraded hero, or null when there's nothing better than the card. */
export async function fetchCwHero(i: ContinueWatchingItem, base: HeroItem): Promise<HeroItem | null> {
  const key = cwHeroKey(i);
  const hit = cache.get(key);
  if (hit) {
    return hit;
  }
  const last = triedAt.get(key);
  if (last && Date.now() - last < RETRY_AFTER_MS) {
    return null;
  }
  triedAt.set(key, Date.now());
  const show = i.navigationContext;
  const isEpisode = !!i.parentId || (!!show && show.toLowerCase() !== i.title.toLowerCase());
  let parentId = i.parentId;
  if (isEpisode && !parentId) {
    // Older rows never stored parent_id: the episode's own details carry
    // the show id (media_id is often a stream id, so this may fail).
    try {
      parentId = (await mycelium.getDetails(i.pluginId, i.mediaId)).item?.showId ?? '';
    } catch {
      parentId = '';
    }
    if (!parentId) {
      return null;
    }
  }
  try {
    const r = await mycelium.getDetails(i.pluginId, parentId || i.mediaId);
    const d = r.series ?? r.movie;
    if (!d) {
      return null;
    }
    const hero: HeroItem = {
      ...base,
      logo: d.logoUrl || r.item?.logoUrl || '',
      year: d.year || base.year,
      rating: r.item?.rating || base.rating,
      genres: d.genres.length ? d.genres.slice(0, 4) : base.genres,
      plot: d.plot || base.plot,
      background: d.fanartUrl || r.item?.extra?.fanart_url || base.background,
    };
    cache.set(key, hero);
    return hero;
  } catch {
    return null;
  }
}
