import {scaleStyle} from '../src/theme';

describe('scaleStyle', () => {
  it('scales sizes, not opacity, flex or percentages', () => {
    expect(
      scaleStyle({fontSize: 26, padding: 24, opacity: 0.5, flex: 1, width: '100%', borderWidth: 2, color: '#fff'}, 0.5),
    ).toEqual({fontSize: 13, padding: 12, opacity: 0.5, flex: 1, width: '100%', borderWidth: 1, color: '#fff'});
  });
});
