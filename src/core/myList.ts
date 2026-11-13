// "La mia lista" (pileus-player features/media/my_list.dart): titles the
// active profile saved to watch later, kept on mycelium (GetMyList /
// SetMyListItem) so the list follows the profile across devices. One
// app-wide store; screens read it with useMyList().
//
// Changes are optimistic: the UI flips at once and rolls back if the server
// refuses. A server without the RPCs (UNIMPLEMENTED) hides the feature.
// The list belongs to the profile it was loaded for: it never shows on
// another one, and a load still in flight for the profile just left can't
// stand in for the new one's.

import {useSyncExternalStore} from 'react';
import {CatalogItem, DetailsResponse, LogoMeta, MyListItem} from '../gen/media';
import {mycelium} from './api';
import {GrpcError, GrpcStatus} from './grpcWeb';

export interface MyListApi {
  getMyList(pluginId?: string): Promise<MyListItem[]>;
  setMyListItem(item: MyListItem, inList: boolean): Promise<unknown>;
}

export interface MyListSnapshot {
  items: MyListItem[];
  supported: boolean;
}

const unimplemented = (e: unknown) => e instanceof GrpcError && e.code === GrpcStatus.UNIMPLEMENTED;

export class MyListStore {
  private items: MyListItem[] = [];
  private owner: string | null = null;
  private supported = true;
  private loading: Promise<void> | null = null;
  private loadingFor: string | null = null;
  private listeners = new Set<() => void>();
  private snap: MyListSnapshot = {items: [], supported: true};

  constructor(private readonly api: MyListApi, private readonly profile: () => string) {}

  private current(): boolean {
    return this.owner !== null && this.owner === (this.profile() || null);
  }

  private notify() {
    this.snap = {items: this.current() ? this.items : [], supported: this.supported};
    this.listeners.forEach(l => l());
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  /** Stable between changes (useSyncExternalStore). */
  snapshot = (): MyListSnapshot => {
    // A profile switch alone doesn't notify: never hand out another's list.
    if (this.snap.items.length && !this.current()) {
      this.snap = {items: [], supported: this.supported};
    }
    return this.snap;
  };

  contains(pluginId: string, mediaId: string): boolean {
    return this.snapshot().items.some(i => i.pluginId === pluginId && i.mediaId === mediaId);
  }

  /** Reloads the active profile's list; concurrent calls for it share one request. */
  refresh(): Promise<void> {
    const profile = this.profile() || null;
    if (this.loading && this.loadingFor === profile) {
      return this.loading;
    }
    this.loadingFor = profile;
    const f: Promise<void> = this.load(profile).finally(() => {
      if (this.loading === f) {
        this.loading = null;
      }
    });
    this.loading = f;
    return f;
  }

  private async load(profile: string | null): Promise<void> {
    if (!profile) {
      return;
    }
    try {
      const list = await this.api.getMyList('');
      if (profile !== (this.profile() || null)) {
        return; // switched meanwhile
      }
      this.items = list;
      this.owner = profile;
      this.supported = true;
    } catch (e) {
      if (!unimplemented(e) || profile !== (this.profile() || null)) {
        return;
      }
      this.supported = false;
      this.items = [];
      this.owner = profile;
    }
    this.notify();
  }

  /**
   * Adds `item` if it isn't in the list, removes it otherwise. Resolves to
   * the new state (true = in the list), or null when the server refused and
   * the change was rolled back.
   */
  async toggle(item: MyListItem): Promise<boolean | null> {
    const profile = this.profile() || null;
    if (!profile) {
      return null;
    }
    if (!this.current()) {
      this.items = [];
      this.owner = profile;
    }
    const before = this.items;
    const add = !this.items.some(i => i.pluginId === item.pluginId && i.mediaId === item.mediaId);
    this.items = add
      ? [item, ...this.items]
      : this.items.filter(i => !(i.pluginId === item.pluginId && i.mediaId === item.mediaId));
    this.notify();
    try {
      await this.api.setMyListItem(item, add);
      return add;
    } catch (e) {
      if (unimplemented(e)) {
        this.supported = false;
      }
      if (this.owner === profile) {
        this.items = before;
      }
      this.notify();
      return null;
    }
  }
}

export const myList = new MyListStore(mycelium, () => mycelium.creds.profileId);

export function useMyList(store: MyListStore = myList): MyListSnapshot {
  return useSyncExternalStore(store.subscribe, store.snapshot);
}

/** The one confirmation every "La mia lista" entry shows. */
export function myListMessage(added: boolean | null): string {
  return added === true
    ? 'Aggiunto a La mia lista'
    : added === false
    ? 'Rimosso da La mia lista'
    : 'Non è stato possibile aggiornare La mia lista';
}

/** Only series and films can be saved. */
export function canSave(mediaType: string): boolean {
  return mediaType === 'series' || mediaType === 'movie';
}

/**
 * The entry for a catalog item, with everything its `extra` carries (what a
 * card shows when focused, what tells an anime from a series). The options
 * are what only a details page knows.
 */
export function myListItemFrom(
  pluginId: string,
  item: CatalogItem,
  o: {
    mediaType?: string;
    plot?: string;
    genres?: string[];
    fanartUrl?: string;
    logoUrl?: string;
    logoMeta?: LogoMeta;
  } = {},
): MyListItem {
  const extra: {[k: string]: string} = {...(item.extra ?? {})};
  if (o.plot) {
    extra.plot = o.plot;
  }
  if (o.genres?.length) {
    extra.genres = o.genres.join(', ');
  }
  const logoUrl = o.logoUrl || item.logoUrl;
  return MyListItem.fromPartial({
    pluginId,
    mediaId: item.id,
    title: item.title,
    posterUrl: item.posterUrl,
    mediaType: o.mediaType || item.mediaType,
    year: item.year,
    rating: item.rating,
    fanartUrl: o.fanartUrl || extra.fanart_url || '',
    logoUrl,
    // The item's measurements only fit its own logo.
    logoMeta: o.logoMeta ?? (!o.logoUrl || o.logoUrl === item.logoUrl ? item.logoMeta : undefined),
    extra,
  });
}

/** myListItemFrom with the typed metadata of a GetDetails answer. */
export function myListItemFromDetails(
  pluginId: string,
  item: CatalogItem,
  d: DetailsResponse | null | undefined,
  mediaType = '',
): MyListItem {
  const s = d?.series;
  const m = d?.movie;
  const entry = myListItemFrom(pluginId, item, {
    mediaType,
    plot: s?.plot || m?.plot || '',
    genres: s?.genres?.length ? s.genres : m?.genres ?? [],
    fanartUrl: s?.fanartUrl || m?.fanartUrl || '',
    logoUrl: s?.logoUrl || m?.logoUrl || '',
    logoMeta: s?.logoMeta ?? m?.logoMeta,
  });
  if (!entry.year) {
    entry.year = s?.year || m?.year || 0;
  }
  return entry;
}

/** The catalog card of a saved title (what the La mia lista page opens). */
export function myListCatalogItem(i: MyListItem): CatalogItem {
  const extra: {[k: string]: string} = {...(i.extra ?? {})};
  if (i.fanartUrl) {
    extra.fanart_url = i.fanartUrl;
  }
  return CatalogItem.fromPartial({
    id: i.mediaId,
    title: i.title,
    posterUrl: i.posterUrl,
    mediaType: i.mediaType,
    year: i.year,
    rating: i.rating,
    logoUrl: i.logoUrl,
    logoMeta: i.logoMeta,
    isDir: i.mediaType === 'series',
    extra,
  });
}
