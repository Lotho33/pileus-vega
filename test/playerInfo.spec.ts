import {DetailsResponse} from '../src/gen/media';
import {mergePlayerInfo, playerInfoBase} from '../src/player/playerInfo';

describe('player info panel', () => {
  test('a film: facts at once, cast and direction from the details', () => {
    const base = playerInfoBase({title: 'Inception', year: 2010, rating: 8.4, durationSeconds: 148 * 60});
    expect(base.facts).toEqual(['2010', '2 h 28 min', '★ 8.4']);
    const full = mergePlayerInfo(
      base,
      DetailsResponse.fromPartial({
        movie: {
          plot: 'Un ladro di sogni…',
          contentRating: 'PG-13',
          directors: ['Christopher Nolan'],
          released: '2010-07-16',
        },
      }),
    );
    expect(full.facts).toEqual(['2010', '2 h 28 min', '★ 8.4', 'PG-13']);
    expect(full.plot).toBe('Un ladro di sogni…');
    expect(full.rows).toEqual([
      ['Regia', 'Christopher Nolan'],
      ['Uscita', '16 luglio 2010'],
    ]);
  });

  test("an episode: series above, S·E badge, the episode's own plot", () => {
    const base = playerInfoBase({title: 'Il pilota', showTitle: 'Breaking Bad', seasonNumber: 1, episodeNumber: 1});
    expect(base.overline).toBe('Breaking Bad');
    expect(base.badge).toBe('S1 · E1');
    const full = mergePlayerInfo(
      base,
      DetailsResponse.fromPartial({episode: {plot: 'Walter White scopre…', duration: 58}}),
      DetailsResponse.fromPartial({series: {year: 2008, genres: ['Drama'], network: 'AMC', status: 'Ended'}}),
    );
    expect(full.plot).toBe('Walter White scopre…');
    expect(full.facts).toEqual(['2008', '58 min']);
    expect(full.rows).toEqual([
      ['Rete', 'AMC'],
      ['Stato', 'Conclusa'],
    ]);
  });

  test('a live: competition above, teams and channel', () => {
    const full = mergePlayerInfo(
      playerInfoBase({title: 'Inter – Milan', isLive: true}),
      DetailsResponse.fromPartial({live: {competition: 'Serie A', teams: ['Inter', 'Milan'], channelName: 'Canale 1'}}),
    );
    expect(full.badge).toBe('In diretta');
    expect(full.overline).toBe('Serie A');
    expect(full.rows.slice(0, 2)).toEqual([
      ['Squadre', 'Inter, Milan'],
      ['Canale', 'Canale 1'],
    ]);
  });
});
