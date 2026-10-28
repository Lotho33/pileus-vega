import {bandsFor, colorAt} from '../src/components/Gradient';

const stops = [
  {offset: 0.4, color: '#000', opacity: 0},
  {offset: 1, color: '#000', opacity: 1},
];

describe('colorAt', () => {
  it('clamps before the first and after the last stop', () => {
    expect(colorAt(stops, 0)).toBe('rgba(0,0,0,0.000)');
    expect(colorAt(stops, 1)).toBe('rgba(0,0,0,1.000)');
  });

  it('interpolates opacity and color between stops', () => {
    expect(colorAt(stops, 0.7)).toBe('rgba(0,0,0,0.500)');
    const mixed = [
      {offset: 0, color: '#000000', opacity: 1},
      {offset: 1, color: '#ff8000', opacity: 1},
    ];
    expect(colorAt(mixed, 0.5)).toBe('rgba(128,64,0,1.000)');
  });
});

describe('bandsFor', () => {
  it('keeps each step at about one alpha level', () => {
    expect(bandsFor(stops)).toBe(255);
    expect(bandsFor([{offset: 0, color: '#000', opacity: 0.67}, {offset: 0.6, color: '#000', opacity: 0}])).toBe(171);
    expect(bandsFor([{offset: 0, color: '#000', opacity: 0.5}, {offset: 1, color: '#000', opacity: 0.5}])).toBe(4);
  });
});

import {stopsOf} from '../src/components/Gradient';
describe('stopsOf', () => {
  it('reads gradient definitions as stops', () => {
    expect(stopsOf('heroFade')).toEqual([
      {offset: 0.4, color: '#000000', opacity: 0},
      {offset: 1, color: '#000000', opacity: 1},
    ]);
  });
});
