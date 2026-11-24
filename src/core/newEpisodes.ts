// The home's "Nuovi episodi" row (pileus-player's features/media/new_episodes.dart):
// the series this profile follows with an episode out since it last watched
// them — mycelium's GetNewEpisodes, one answer for every plugin.
//
// It rides as a catalog of its own: withNewEpisodesRow slips this def into a
// plugin's rows as the second one, and the home loads it from GetNewEpisodes
// (that plugin's entries) instead of asking the plugin — so it focuses,
// shows the hero and drops out when empty like any other row.

import {CatalogDef, CatalogItem, NewEpisode} from '../gen/media';
import {mycelium} from './api';
import {GrpcError, GrpcStatus} from './grpcWeb';

export const NEW_EPISODES_CATALOG_ID = '_pileus_new_episodes';

export const isNewEpisodesCatalog = (id: string) => id === NEW_EPISODES_CATALOG_ID;

export const newEpisodesCatalogDef = (): CatalogDef =>
  CatalogDef.fromPartial({id: NEW_EPISODES_CATALOG_ID, name: 'Nuovi episodi', type: 'series'});

/** `catalogs` with the row after the first one, unless they're all live (or it's there). */
export function withNewEpisodesRow(catalogs: CatalogDef[]): CatalogDef[] {
  if (!catalogs.length || catalogs.every(c => c.type === 'live') || catalogs.some(c => isNewEpisodesCatalog(c.id))) {
    return catalogs;
  }
  return [catalogs[0], newEpisodesCatalogDef(), ...catalogs.slice(1)];
}

/** The card for a series with a new episode: opens its details page. */
export const newEpisodeItem = (e: NewEpisode): CatalogItem =>
  CatalogItem.fromPartial({
    id: e.seriesId,
    title: e.title,
    posterUrl: e.posterUrl,
    mediaType: 'series',
    badge: 'new_episode',
  });

const TTL_MS = 5 * 60 * 1000;

/**
 * One GetNewEpisodes for every plugin's row, kept a few minutes per profile,
 * one call in flight. Any failure is an empty row; a server without the RPC
 * isn't asked again.
 */
export class NewEpisodesStore {
  private cache: {profile: string; at: number; items: NewEpisode[]} | null = null;
  private inFlight: {profile: string; call: Promise<NewEpisode[]>} | null = null;
  private unsupported = false;

  constructor(
    private readonly fetch: () => Promise<NewEpisode[]>,
    private readonly profile: () => string,
    private readonly now: () => number = Date.now,
  ) {}

  forPlugin(pluginId: string): Promise<CatalogItem[]> {
    return this.items().then(all => all.filter(e => e.pluginId === pluginId).map(newEpisodeItem));
  }

  private items(): Promise<NewEpisode[]> {
    if (this.unsupported) {
      return Promise.resolve([]);
    }
    const profile = this.profile();
    const c = this.cache;
    if (c && c.profile === profile && this.now() - c.at < TTL_MS) {
      return Promise.resolve(c.items);
    }
    if (this.inFlight && this.inFlight.profile === profile) {
      return this.inFlight.call;
    }
    const call = this.load(profile);
    this.inFlight = {profile, call};
    call.finally(() => {
      if (this.inFlight?.call === call) {
        this.inFlight = null;
      }
    });
    return call;
  }

  private async load(profile: string): Promise<NewEpisode[]> {
    try {
      const items = await this.fetch();
      if (this.profile() === profile) {
        this.cache = {profile, at: this.now(), items};
      }
      return items;
    } catch (e) {
      if (e instanceof GrpcError && e.code === GrpcStatus.UNIMPLEMENTED) {
        this.unsupported = true;
      }
      return [];
    }
  }
}

export const newEpisodes = new NewEpisodesStore(
  () => mycelium.getNewEpisodes(),
  () => mycelium.creds.profileId,
);
