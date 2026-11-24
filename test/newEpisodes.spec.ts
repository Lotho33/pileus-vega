import {GrpcError, GrpcStatus} from '../src/core/grpcWeb';
import {NEW_EPISODES_CATALOG_ID, NewEpisodesStore, withNewEpisodesRow} from '../src/core/newEpisodes';
import {CatalogDef, NewEpisode} from '../src/gen/media';

const def = (id: string, type = '') => CatalogDef.fromPartial({id, type});
const ep = (pluginId: string, seriesId: string) => NewEpisode.fromPartial({pluginId, seriesId, title: seriesId});

describe('Nuovi episodi', () => {
  it('goes second, only among on-demand rows', () => {
    expect(withNewEpisodesRow([def('a'), def('b')]).map(c => c.id)).toEqual(['a', NEW_EPISODES_CATALOG_ID, 'b']);
    expect(withNewEpisodesRow([def('a')]).map(c => c.id)).toEqual(['a', NEW_EPISODES_CATALOG_ID]);
    expect(withNewEpisodesRow([def('l', 'live')]).map(c => c.id)).toEqual(['l']);
    expect(withNewEpisodesRow([])).toEqual([]);
    const once = withNewEpisodesRow([def('a'), def('b')]);
    expect(withNewEpisodesRow(once)).toBe(once);
  });

  it("each plugin's row from one call", async () => {
    const fetch = jest.fn(async () => [ep('vix', 's1'), ep('anime', 'a1'), ep('vix', 's2')]);
    const store = new NewEpisodesStore(fetch, () => 'anna');
    const vix = await store.forPlugin('vix');
    expect(vix.map(i => i.id)).toEqual(['s1', 's2']);
    expect(vix[0].mediaType).toBe('series');
    expect(vix[0].badge).toBe('new_episode');
    expect((await store.forPlugin('anime')).map(i => i.id)).toEqual(['a1']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('an older server: empty, not asked again', async () => {
    const fetch = jest.fn(async (): Promise<NewEpisode[]> => {
      throw new GrpcError(GrpcStatus.UNIMPLEMENTED, 'old');
    });
    const store = new NewEpisodesStore(
      fetch,
      () => 'anna',
      () => 0,
    );
    expect(await store.forPlugin('vix')).toEqual([]);
    expect(await store.forPlugin('vix')).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
