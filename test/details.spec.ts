import {
  episodeWindow,
  fmtAirDate,
  fmtStatus,
  infoOf,
  isEpisodeList,
  parseRelated,
  relatedLists,
  seasonLabel,
} from '../src/details/format';
import {CatalogItem, DetailsResponse, SeasonInfo} from '../src/gen/media';

const season = (o: Partial<SeasonInfo>): SeasonInfo => ({
  number: 0,
  label: '',
  directoryId: '',
  posterUrl: '',
  year: 0,
  episodeCount: 0,
  overview: '',
  airDate: '',
  ...o,
});

describe('details format', () => {
  it('labels seasons like the Flutter page', () => {
    const ss = [season({number: 2}), season({label: 'Speciali'}), season({})];
    expect(seasonLabel(ss, 0)).toBe('Stagione 2');
    expect(seasonLabel(ss, 1)).toBe('Speciali');
    expect(seasonLabel(ss, 2)).toBe('Gruppo 3');
  });

  it('formats status and air dates', () => {
    expect(fmtStatus('RELEASING')).toBe('In corso');
    expect(fmtStatus('Ended')).toBe('Conclusa');
    expect(fmtStatus('Pilot')).toBe('Pilot');
    expect(fmtAirDate('2023-04-02')).toBe('apr 2023');
    expect(fmtAirDate('2019')).toBe('2019');
  });

  it('merges related and similar without duplicates, ignoring bad JSON', () => {
    const extra = {
      related: JSON.stringify([{id: '1', title: 'A', poster: 'p', rel: 'SEQUEL'}]),
      similar: JSON.stringify([{id: '1', title: 'A'}, {id: '2', title: 'B'}, {title: 'no id'}]),
    };
    expect(parseRelated(extra).map(e => e.id)).toEqual(['1', '2']);
    expect(parseRelated({related: '{oops'})).toEqual([]);
    const lists = relatedLists(extra);
    expect(lists.related.map(e => e.id)).toEqual(['1']);
    expect(lists.similar.map(e => e.id)).toEqual(['1', '2']);
    expect(parseRelated(undefined)).toEqual([]);
  });

  it('slides the episode window only past its edges', () => {
    expect(episodeWindow(0, 3, 5, 20)).toBe(0);
    expect(episodeWindow(0, 5, 5, 20)).toBe(1);
    expect(episodeWindow(4, 3, 5, 20)).toBe(3);
    expect(episodeWindow(0, 19, 5, 20)).toBe(15);
    expect(episodeWindow(0, 2, 5, 3)).toBe(0);
  });
});

describe('browse and quick look', () => {
  const item = (o: Partial<CatalogItem>) => CatalogItem.fromPartial(o);

  it('shows episode-like children as a list', () => {
    expect(isEpisodeList([item({episodeNumber: 3})])).toBe(true);
    expect(isEpisodeList([item({extra: {anilist_id: '1'}})])).toBe(true);
    expect(isEpisodeList([item({isDir: true, episodeNumber: 3})])).toBe(false);
    expect(isEpisodeList([item({title: 'Film'})])).toBe(false);
    expect(isEpisodeList([])).toBe(false);
  });

  it('takes the popup fields from movie or series details', () => {
    const movie = infoOf(
      DetailsResponse.fromPartial({
        item: {rating: 7.5, year: 1999, extra: {plot: 'fallback'}},
        movie: {plot: 'Plot', runtime: '120 min', genres: ['Drama'], cast: ['A']},
      }),
    );
    expect(movie).toMatchObject({rating: 7.5, year: 1999, plot: 'Plot', runtime: '120 min', genres: ['Drama']});
    const series = infoOf(
      DetailsResponse.fromPartial({item: {extra: {plot: 'Item plot'}}, series: {status: 'Ended', episodeRuntime: '24 min'}}),
    );
    expect(series).toMatchObject({plot: 'Item plot', status: 'Ended', runtime: '24 min'});
  });
});
