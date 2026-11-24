import {episodeKindLabel} from '../src/core/episodeKind';
import {episodesOf} from '../src/player/episodes';
import type {BrowseResponse} from '../src/gen/media';

describe('episodeKindLabel', () => {
  it('reads extra.filler', () => {
    expect(episodeKindLabel('filler')).toBe('Filler');
    expect(episodeKindLabel(' Recap ')).toBe('Riassunto');
    expect(episodeKindLabel('')).toBe('');
    expect(episodeKindLabel(undefined)).toBe('');
    expect(episodeKindLabel('canon')).toBe('');
  });

  it('reaches the player episode list', () => {
    const r = {
      episodes: [
        {id: 'a', title: 'A', thumbnailUrl: '', episodeNumber: 1, seasonNumber: 1, extra: {filler: 'filler'}},
        {id: 'b', title: 'B', thumbnailUrl: '', episodeNumber: 2, seasonNumber: 1, extra: {}},
      ],
      items: [],
    } as unknown as BrowseResponse;
    expect(episodesOf(r).map(e => e.kind)).toEqual(['Filler', '']);
  });
});
