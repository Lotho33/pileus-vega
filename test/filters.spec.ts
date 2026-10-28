import {optionLabel, rangeState, rangeValue, setFilter, toggleMulti} from '../src/search/filters';
import type {SearchFilter} from '../src/gen/media';

const year: SearchFilter = {
  id: 'year',
  label: 'Anno',
  type: 'range',
  options: [
    {id: 'min', label: '1950'},
    {id: 'max', label: '2025'},
  ],
};
const genre: SearchFilter = {
  id: 'genre',
  label: 'Genere',
  type: 'multiselect',
  options: [
    {id: 'a', label: 'Azione'},
    {id: 'c', label: 'Commedia'},
  ],
};

describe('filters', () => {
  it('drops a key set to empty', () => {
    expect(setFilter({x: '1', y: '2'}, 'x', '')).toEqual({y: '2'});
    expect(setFilter({}, 'x', 'v')).toEqual({x: 'v'});
  });

  it('toggles multiselect ids', () => {
    expect(toggleMulti('', 'a')).toBe('a');
    expect(toggleMulti('a', 'c')).toBe('a,c');
    expect(toggleMulti('a,c', 'a')).toBe('c');
  });

  it('reads and writes ranges, full span meaning no constraint', () => {
    const r = rangeState(year, '2000..');
    expect([r.min, r.max, r.lo, r.hi]).toEqual([1950, 2025, 2000, 2025]);
    expect(rangeState(year, '2010')).toMatchObject({lo: 2010, hi: 2010});
    expect(rangeValue(r, 2001, 2025)).toBe('2001..2025');
    expect(rangeValue(r, 1950, 2025)).toBe('');
    expect(rangeValue(r, 1900, 2030)).toBe('');
  });

  it('labels active values', () => {
    expect(optionLabel(genre, 'a,c')).toBe('Azione, Commedia');
    expect(optionLabel(year, '2000..2010')).toBe('2000–2010');
    expect(optionLabel(year, '2010..2010')).toBe('2010');
    expect(optionLabel({id: 'b', label: 'B', type: 'bool', options: []}, 'true')).toBe('Sì');
  });
});
