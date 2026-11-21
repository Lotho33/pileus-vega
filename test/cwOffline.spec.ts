import {mycelium} from '../src/core/api';
import {GrpcError, GrpcStatus} from '../src/core/grpcWeb';
import {
  CwQueuedOp,
  deleteProgress,
  fetchContinueWatching,
  flushCwOffline,
  overlayQueued,
  queuedOps,
  resetCwOffline,
  updateProgress,
  withAdvance,
  withDelete,
  withUpdate,
} from '../src/core/cwOffline';
import type {ContinueWatchingItem} from '../src/gen/media';
import type {CwAdvanceRequest} from '../src/player/cwAdvance';

const adv = {pluginId: 'p', seriesId: 'show', currentCwId: 'e1'} as CwAdvanceRequest;
const down = () => new GrpcError(GrpcStatus.UNAVAILABLE, 'down');

describe('offline queue operations', () => {
  test('one entry per row, the latest', () => {
    let ops: CwQueuedOp[] = [];
    ops = withUpdate(ops, {pluginId: 'p', mediaId: 'm', currentPosition: 10});
    ops = withUpdate(ops, {pluginId: 'p', mediaId: 'm', currentPosition: 20});
    expect(ops).toEqual([{k: 'u', r: {pluginId: 'p', mediaId: 'm', currentPosition: 20}}]);
    ops = withDelete(ops, 'p', 'm');
    expect(ops).toEqual([{k: 'd', p: 'p', m: 'm'}]);
  });

  test('a newer write for a series drops its pending advance', () => {
    let ops = withAdvance([], adv);
    ops = withUpdate(ops, {pluginId: 'p', mediaId: 'e2', parentId: 'show'});
    expect(ops.map(o => o.k)).toEqual(['u']);
  });

  test('the row shows what was watched offline', () => {
    const server = [
      {pluginId: 'p', mediaId: 'e1', parentId: 'show', title: 'old'},
      {pluginId: 'p', mediaId: 'movie', parentId: '', title: 'movie'},
      {pluginId: 'p', mediaId: 'gone', parentId: '', title: 'gone'},
    ] as ContinueWatchingItem[];
    const ops: CwQueuedOp[] = [
      {k: 'u', r: {pluginId: 'p', mediaId: 'e2', parentId: 'show', title: 'new', currentPosition: 300}},
      {k: 'd', p: 'p', m: 'gone'},
    ];
    const out = overlayQueued(server, ops);
    expect(out.map(i => i.title)).toEqual(['new', 'movie']);
    expect(out[0].progressTime).toBe(300);
  });
});

describe('writes while offline', () => {
  let online = false;
  let sent: string[];

  beforeEach(() => {
    online = false;
    sent = [];
    resetCwOffline();
    mycelium.creds.profileId = 'prof';
    jest.spyOn(mycelium, 'updateProgress').mockImplementation(async (r, replay) => {
      if (!online) {
        throw down();
      }
      sent.push(`u ${r.mediaId} ${r.currentPosition}${replay ? ' replay' : ''}`);
      return {playbackElsewhere: false} as never;
    });
    jest.spyOn(mycelium, 'deleteProgress').mockImplementation(async (_p, m) => {
      if (!online) {
        throw down();
      }
      sent.push(`d ${m}`);
      return {} as never;
    });
    jest.spyOn(mycelium, 'getContinueWatching').mockImplementation(async () => {
      if (!online) {
        throw down();
      }
      return [];
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    mycelium.creds.profileId = '';
  });

  test('are queued, then replayed in order once the server answers', async () => {
    expect(await updateProgress({pluginId: 'p', mediaId: 'a', currentPosition: 10})).toBeNull();
    await deleteProgress('p', 'b');
    await updateProgress({pluginId: 'p', mediaId: 'a', currentPosition: 40});
    expect(queuedOps().length).toBe(2);

    online = true;
    await fetchContinueWatching([]);
    expect(sent).toEqual(['d b', 'u a 40 replay']);
    expect(queuedOps()).toEqual([]);
  });

  test('a direct write supersedes what is queued for that row', async () => {
    await updateProgress({pluginId: 'p', mediaId: 'a', currentPosition: 10});
    online = true;
    await updateProgress({pluginId: 'p', mediaId: 'a', currentPosition: 99});
    await flushCwOffline();
    expect(sent).toEqual(['u a 99']);
  });

  test('server still down: the row on screen with the offline writes over it', async () => {
    await updateProgress({pluginId: 'p', mediaId: 'a', currentPosition: 10, title: 'A'});
    const out = await fetchContinueWatching([{pluginId: 'p', mediaId: 'z', title: 'Z'} as ContinueWatchingItem]);
    expect(out.map(i => i.title)).toEqual(['A', 'Z']);
  });

  test('no profile: nothing is kept', async () => {
    mycelium.creds.profileId = '';
    await updateProgress({pluginId: 'p', mediaId: 'a', currentPosition: 10});
    expect(queuedOps()).toEqual([]);
  });
});
