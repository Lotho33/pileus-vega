import {DownloadInfo} from '../src/gen/media';
import {episodeRowLabel, groupDownloads, groupInProgress, groupTotalBytes} from '../src/downloads/groups';

const d = (over: Partial<DownloadInfo>) => DownloadInfo.fromPartial({pluginId: 'p', ...over});

describe('downloads grouped by series', () => {
  const list = [
    d({
      downloadId: '1',
      mediaId: 'e3',
      parentId: 'show',
      seriesTitle: 'Show',
      title: 'Tre',
      seasonNumber: 1,
      episodeNumber: 3,
      status: 'running',
      estimatedBytes: 100,
    }),
    d({downloadId: '2', mediaId: 'film', title: 'Film', status: 'completed', fileBytes: 50}),
    d({
      downloadId: '3',
      mediaId: 'e1',
      parentId: 'show',
      seriesTitle: 'Show',
      title: 'Uno',
      seasonNumber: 1,
      episodeNumber: 1,
      status: 'completed',
      fileBytes: 40,
    }),
    d({
      downloadId: '4',
      mediaId: 'e21',
      parentId: 'show',
      seriesTitle: 'Show',
      title: '',
      seasonNumber: 2,
      episodeNumber: 1,
      status: 'completed',
      fileBytes: 10,
    }),
  ];

  test('one row per series, in the order first seen; a movie alone', () => {
    const g = groupDownloads(list);
    expect(g.map(x => [x.title, x.isSeries])).toEqual([
      ['Show', true],
      ['Film', false],
    ]);
    expect(g[0].items.map(i => i.mediaId)).toEqual(['e1', 'e3', 'e21']);
  });

  test('size and state of a series', () => {
    const [show] = groupDownloads(list);
    expect(groupTotalBytes(show)).toBe(150);
    expect(groupInProgress(show)).toBe(true);
  });

  test('episode labels', () => {
    expect(episodeRowLabel(list[0])).toBe('S1 · E3 — Tre');
    expect(episodeRowLabel(list[3])).toBe('S2 · E1');
    expect(episodeRowLabel(d({title: 'Solo', episodeNumber: 0}))).toBe('Solo');
    expect(episodeRowLabel(d({title: 'X', episodeNumber: 4}))).toBe('E4 — X');
  });
});
