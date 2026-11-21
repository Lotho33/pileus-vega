import {mycelium} from '../src/core/api';
import {emptyRequest, markStarted, saveProgress} from '../src/player/session';

describe('Continue Watching writes', () => {
  let sent: Array<{mediaId?: string; currentPosition?: number; totalDuration?: number}>;
  let elsewhere = false;

  beforeEach(() => {
    sent = [];
    elsewhere = false;
    jest.spyOn(mycelium, 'updateProgress').mockImplementation(async req => {
      sent.push(req);
      return {playbackElsewhere: elsewhere, playingOn: 'Salotto'} as never;
    });
  });
  afterEach(() => jest.restoreAllMocks());

  const req = emptyRequest({pluginId: 'p', streamId: 'ep1#ita', startAt: 754});

  test('the row is written as the title opens, at its resume point', async () => {
    await markStarted(req, 0);
    expect(sent).toEqual([expect.objectContaining({mediaId: 'ep1#ita', currentPosition: 754, totalDuration: 0})]);
  });

  test('a fresh title opens at 0, which a heartbeat would skip', async () => {
    await markStarted({...req, startAt: 0}, 1500);
    expect(sent[0]).toMatchObject({currentPosition: 0, totalDuration: 1500});
    await saveProgress({...req, startAt: 0}, 0, 1500);
    expect(sent).toHaveLength(1);
  });

  test('live never writes', async () => {
    await markStarted({...req, isLive: true}, 0);
    expect(sent).toHaveLength(0);
  });

  test('reports the device that took the playback over', async () => {
    elsewhere = true;
    expect(await markStarted(req, 0)).toBe('Salotto');
  });
});
