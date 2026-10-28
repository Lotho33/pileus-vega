jest.mock('@amazon-devices/react-native-async-storage__async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

import {mycelium} from '../src/core/api';
import {RECENT_MAX, recentSearches, withQuery} from '../src/core/recentSearches';

describe('recent searches', () => {
  it('drops older prefixes and duplicates, newest first, capped', () => {
    expect(withQuery(['brea', 'dark'], 'Breaking Bad')).toEqual(['Breaking Bad', 'dark']);
    expect(withQuery(['Dark'], 'dark')).toEqual(['dark']);
    const many = Array.from({length: 20}, (_, i) => `q${i}`);
    expect(withQuery(many, 'new')).toHaveLength(RECENT_MAX);
  });

  it('is kept per profile and per plugin, never without a profile', () => {
    mycelium.creds.profileId = '';
    recentSearches.add('pl', 'naruto');
    expect(recentSearches.list('pl')).toEqual([]);
    mycelium.creds.profileId = 'p1';
    recentSearches.add('pl', 'naruto');
    recentSearches.add('pl', 'x'); // too short
    expect(recentSearches.list('pl')).toEqual(['naruto']);
    expect(recentSearches.list('other')).toEqual([]);
    mycelium.creds.profileId = 'p2';
    expect(recentSearches.list('pl')).toEqual([]);
    mycelium.creds.profileId = 'p1';
    recentSearches.clear('pl');
    expect(recentSearches.list('pl')).toEqual([]);
    mycelium.creds.profileId = '';
  });
});
