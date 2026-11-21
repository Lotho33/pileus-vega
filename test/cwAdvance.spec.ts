import {mycelium} from '../src/core/api';
import {GrpcError, GrpcStatus} from '../src/core/grpcWeb';
import {resetCwOffline, queuedOps} from '../src/core/cwOffline';
import {BrowseResponse, DetailsResponse} from '../src/gen/media';
import {
  advanceContinueWatching,
  CwAdvanceRequest,
  isEpisodeOfSeries,
  tryAdvanceContinueWatching,
} from '../src/player/cwAdvance';

const ep = (id: string, s: number, e: number) => ({
  id,
  title: `Ep ${e}`,
  thumbnailUrl: `${id}.jpg`,
  seasonNumber: s,
  episodeNumber: e,
});
const seasons: Record<string, ReturnType<typeof ep>[]> = {
  s1: [ep('e11', 1, 1), ep('e12', 1, 2)],
  s2: [ep('e21', 2, 1), ep('e22', 2, 2)],
};

const req = (over: Partial<CwAdvanceRequest> = {}): CwAdvanceRequest => ({
  pluginId: 'p',
  seriesId: 'show',
  currentCwId: 'e12#ita',
  currentTitle: 'Ep 2',
  seasonNumber: 1,
  episodeNumber: 2,
  knownSeasonIds: [],
  sourceLabel: 'ITA',
  showTitle: 'Show',
  seriesPoster: 'show.jpg',
  fallbackPoster: '',
  rating: 0,
  genres: [],
  plot: '',
  year: 0,
  ...over,
});

describe('Continue Watching past the last episode of a season', () => {
  let updates: Array<Record<string, unknown>>;
  let deletes: string[];

  beforeEach(() => {
    updates = [];
    deletes = [];
    resetCwOffline();
    mycelium.creds.profileId = 'prof';
    jest.spyOn(mycelium, 'getDetails').mockResolvedValue(
      DetailsResponse.fromPartial({
        series: {
          seasons: [
            {directoryId: 's1', number: 1},
            {directoryId: 's2', number: 2},
          ],
        },
      }),
    );
    jest
      .spyOn(mycelium, 'browse')
      .mockImplementation(async (_p, id) => BrowseResponse.fromPartial({episodes: seasons[id] ?? []}));
    jest.spyOn(mycelium, 'getStreams').mockImplementation(
      async (_p, id) =>
        [
          {id: `${id}#eng`, label: 'ENG'},
          {id: `${id}#ita`, label: 'ITA'},
        ] as never,
    );
    jest.spyOn(mycelium, 'updateProgress').mockImplementation(async r => {
      updates.push(r as Record<string, unknown>);
      return {} as never;
    });
    jest.spyOn(mycelium, 'deleteProgress').mockImplementation(async (_p, m) => {
      deletes.push(m);
      return {} as never;
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    mycelium.creds.profileId = '';
  });

  test('moves the row to the next season, same language, 31 s in', async () => {
    expect(await tryAdvanceContinueWatching(req())).toBe(true);
    expect(updates).toEqual([
      expect.objectContaining({
        mediaId: 'e21#ita',
        parentId: 'show',
        currentPosition: 31,
        seasonNumber: 2,
        episodeNumber: 1,
        poster: 'e21.jpg',
      }),
    ]);
    expect(deletes).toEqual(['e12#ita']);
  });

  test('removes the row when the series is over', async () => {
    await tryAdvanceContinueWatching(req({currentCwId: 'e22#ita', currentTitle: 'Ep 2', seasonNumber: 2}));
    expect(updates).toEqual([]);
    expect(deletes).toEqual(['e22#ita']);
  });

  test('finds the episode by its numbers when the id and title differ', async () => {
    await tryAdvanceContinueWatching(req({currentCwId: 'other', currentTitle: '', seasonNumber: 1, episodeNumber: 1}));
    expect(updates[0]).toMatchObject({mediaId: 'e12#ita'});
  });

  test('a plugin error leaves the row as it is', async () => {
    (mycelium.getDetails as jest.Mock).mockRejectedValue(new GrpcError(GrpcStatus.INTERNAL, 'boom'));
    expect(await tryAdvanceContinueWatching(req())).toBe(true);
    expect(updates).toEqual([]);
    expect(deletes).toEqual([]);
  });

  test('offline: queued for later', async () => {
    (mycelium.getDetails as jest.Mock).mockRejectedValue(new GrpcError(GrpcStatus.UNAVAILABLE, 'down'));
    await advanceContinueWatching(req());
    expect(queuedOps()).toEqual([{k: 'a', r: req()}]);
  });

  test('only an episode of a series moves on', () => {
    expect(isEpisodeOfSeries('show', 'e1')).toBe(true);
    expect(isEpisodeOfSeries('', 'movie')).toBe(false);
    expect(isEpisodeOfSeries('movie', 'movie')).toBe(false);
  });
});
