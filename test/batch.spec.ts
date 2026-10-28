import {batchGroups, DownloadMeta} from '../src/downloads/batch';

const ep = (n: number): DownloadMeta => ({
  mediaId: `e${n}`,
  parentId: 's',
  title: `Ep ${n}`,
  seriesTitle: 'Show',
  poster: '',
  seasonNumber: 1,
  episodeNumber: n,
});

describe('batch download groups', () => {
  const season = [1, 2, 3, 4, 5, 6, 7, 8].map(ep);

  it('offers the season and the next five', () => {
    const g = batchGroups(season, 1);
    expect(g.map(x => x.label)).toEqual(['Tutta la stagione (8 episodi)', 'I prossimi 5 episodi']);
    expect(g[1].episodes.map(e => e.mediaId)).toEqual(['e2', 'e3', 'e4', 'e5', 'e6']);
  });

  it('shrinks "next" near the end and drops it on the last episode', () => {
    expect(batchGroups(season, 5)[1].episodes).toHaveLength(3);
    expect(batchGroups(season, 7).map(x => x.label)).toEqual(['Tutta la stagione (8 episodi)']);
  });

  it('has nothing for a single episode or an unknown position', () => {
    expect(batchGroups([ep(1)], 0)).toEqual([]);
    expect(batchGroups(season, -1)).toEqual([]);
  });
});
