import {mycelium} from '../src/core/api';
import {emptyRequest} from '../src/player/session';
import {
  activeSkip,
  nextEpisodeTick,
  EpisodeNav,
  EpisodePrefetcher,
  NoSourceError,
  requestForEpisode,
  hasNextEpisode,
  hasPrevEpisode,
  parseSkipTimes,
  pickSourceByLabel,
  stepEpisode,
} from '../src/player/episodes';

const ep = (id: string, n: number) => ({
  id,
  title: `Ep ${n}`,
  thumb: '',
  episodeNumber: n,
  seasonNumber: 1,
});

describe('skip markers', () => {
  it('parses skip_times and drops bad entries', () => {
    const json = JSON.stringify([
      {skipType: 'op', interval: {startTime: 10, endTime: 95.5}},
      {skipType: 'ed', interval: {startTime: 1300, endTime: 1390}},
      {skipType: 'mixed-op', interval: {startTime: 1, endTime: 2}},
      {skipType: 'recap', interval: {startTime: 50, endTime: 40}},
      {skipType: 'recap'},
    ]);
    expect(parseSkipTimes(json)).toEqual([
      {type: 'op', start: 10, end: 95.5},
      {type: 'ed', start: 1300, end: 1390},
    ]);
    expect(parseSkipTimes('nope')).toEqual([]);
    expect(parseSkipTimes(undefined)).toEqual([]);
  });

  it('ends the active window a second early', () => {
    const list = parseSkipTimes(
      JSON.stringify([
        {skipType: 'op', interval: {startTime: 10, endTime: 20}},
      ]),
    );
    expect(activeSkip(list, 9.9)).toBeNull();
    expect(activeSkip(list, 10)?.type).toBe('op');
    expect(activeSkip(list, 18.9)?.type).toBe('op');
    expect(activeSkip(list, 19)).toBeNull();
  });
});

describe('episode navigation', () => {
  const nav: EpisodeNav = {
    episodes: [ep('a', 1), ep('b', 2)],
    index: 1,
    seasonIds: ['s1', 's2'],
    seasonIndex: 0,
    seriesPoster: '',
  };

  it('knows what is around', () => {
    expect(hasNextEpisode(nav)).toBe(true);
    expect(hasPrevEpisode(nav)).toBe(true);
    expect(hasNextEpisode({...nav, seasonIds: []})).toBe(false);
    expect(hasPrevEpisode({...nav, index: 0})).toBe(false);
    expect(hasNextEpisode(undefined)).toBe(false);
  });

  it('steps inside the season without browsing', async () => {
    const browse = jest.spyOn(mycelium, 'browse');
    expect((await stepEpisode('p', nav, 0))?.index).toBe(0);
    expect(browse).not.toHaveBeenCalled();
    browse.mockRestore();
  });

  it('crosses into the next season', async () => {
    const browse = jest
      .spyOn(mycelium, 'browse')
      .mockResolvedValue({
        items: [],
        hasMore: false,
        episodes: [{...ep('c', 1), thumbnailUrl: 't'} as any],
      });
    const next = await stepEpisode('p', nav, 2);
    expect(browse).toHaveBeenCalledWith('p', 's2');
    expect(next).toMatchObject({seasonIndex: 1, index: 0});
    expect(next?.episodes[0]).toMatchObject({id: 'c', thumb: 't'});
    expect(await stepEpisode('p', {...nav, seasonIndex: 1}, 2)).toBeNull();
    browse.mockRestore();
  });

  it('keeps the source label', () => {
    const sources = [
      {id: '1', label: 'ITA'},
      {id: '2', label: 'SUB ITA'},
    ] as any;
    expect(pickSourceByLabel(sources, 'sub ita')?.id).toBe('2');
    expect(pickSourceByLabel(sources, 'ENG')?.id).toBe('1');
    expect(pickSourceByLabel([], 'ITA')).toBeUndefined();
  });
});

describe('next episode prefetch', () => {
  const next = ep('n', 2);
  const resolved = {
    resolvedUrl: 'http://x/n.m3u8',
    httpHeaders: {},
    isLive: false,
    extra: {},
  } as any;

  afterEach(() => jest.restoreAllMocks());

  it('waits for 80% and resolves the source with the same label', async () => {
    jest.spyOn(mycelium, 'getStreams').mockResolvedValue([
      {id: 'n-ita', label: 'ITA'},
      {id: 'n-sub', label: 'SUB ITA'},
    ] as any);
    const resolve = jest
      .spyOn(mycelium, 'resolveStream')
      .mockResolvedValue(resolved);
    const p = new EpisodePrefetcher();
    p.maybeStart('p', 70, 100, next, 'SUB ITA');
    expect(resolve).not.toHaveBeenCalled();
    p.maybeStart('p', 81, 100, next, 'SUB ITA');
    await new Promise((r) => setTimeout(r, 0));
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({streamId: 'n-sub'}),
      expect.anything(),
    );
    expect(p.take('other')).toBeNull();
    expect(p.take('n')).toMatchObject({streamId: 'n-sub', resolved});
    expect(p.take('n')).toBeNull();
  });

  it('caches nothing when the lookup fails', async () => {
    jest.spyOn(mycelium, 'getStreams').mockRejectedValue(new Error('down'));
    const p = new EpisodePrefetcher();
    p.maybeStart('p', 90, 100, next, '');
    await new Promise((r) => setTimeout(r, 0));
    expect(p.take('n')).toBeNull();
  });

  it('reports an episode without sources', async () => {
    jest.spyOn(mycelium, 'getStreams').mockResolvedValue([]);
    const nav: EpisodeNav = {
      episodes: [next],
      index: 0,
      seasonIds: [],
      seasonIndex: 0,
      seriesPoster: '',
    };
    await expect(
      requestForEpisode(emptyRequest({pluginId: 'p'}), nav),
    ).rejects.toBeInstanceOf(NoSourceError);
  });
});

describe('nextEpisodeTick', () => {
  const ed = {type: 'ed' as const, start: 1300, end: 1390};
  const dur = 1440;

  it('counts 20 s of the ending, then advances', () => {
    expect(nextEpisodeTick(600, dur, [ed])).toEqual({
      bannerSecs: null,
      advance: false,
    });
    expect(nextEpisodeTick(1300, dur, [ed]).bannerSecs).toBe(20);
    expect(nextEpisodeTick(1305.5, dur, [ed]).bannerSecs).toBe(15);
    expect(nextEpisodeTick(1319.2, dur, [ed]).advance).toBe(false);
    expect(nextEpisodeTick(1320, dur, [ed]).advance).toBe(true);
  });

  it('a closed banner lets the ending play, but the end still advances', () => {
    expect(nextEpisodeTick(1330, dur, [ed], true)).toEqual({
      bannerSecs: null,
      advance: false,
    });
    expect(nextEpisodeTick(1440, dur, [ed], true).advance).toBe(true);
  });

  it('an ending shorter than the countdown plays on after it', () => {
    const short = {type: 'ed' as const, start: 1300, end: 1310};
    expect(nextEpisodeTick(1312, dur, [short])).toEqual({
      bannerSecs: null,
      advance: false,
    });
  });

  it('last 30 s without markers; the shorter countdown wins', () => {
    expect(nextEpisodeTick(1410, dur, []).bannerSecs).toBe(30);
    expect(
      nextEpisodeTick(1426, dur, [{type: 'ed', start: 1425, end: 1440}])
        .bannerSecs,
    ).toBe(14);
  });
});
