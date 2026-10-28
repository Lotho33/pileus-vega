import {surfaceBox} from '../src/player/viewMode';

describe('surfaceBox', () => {
  it('fits a 4:3 picture with side bars and a 2.39:1 one with top bars', () => {
    expect(surfaceBox('fit', 1920, 1080, 640, 480)).toEqual({left: 240, top: 0, width: 1440, height: 1080});
    const wide = surfaceBox('fit', 1920, 1080, 2390, 1000);
    expect(wide.width).toBe(1920);
    expect(Math.round(wide.height)).toBe(803);
  });

  it('zoom covers the screen, cropping', () => {
    const b = surfaceBox('zoom', 1920, 1080, 640, 480);
    expect(b.width).toBe(1920);
    expect(b.height).toBe(1440);
    expect(b.top).toBe(-180);
  });

  it('stretch and unknown sizes use the whole screen', () => {
    expect(surfaceBox('stretch', 1920, 1080, 640, 480)).toEqual({left: 0, top: 0, width: 1920, height: 1080});
    expect(surfaceBox('fit', 1920, 1080, 0, 0)).toEqual({left: 0, top: 0, width: 1920, height: 1080});
  });

  it('forced ratios ignore the stream', () => {
    expect(surfaceBox('ratio4x3', 1920, 1080, 1920, 1080).width).toBe(1440);
    expect(surfaceBox('ratio16x9', 1920, 1080, 640, 480).width).toBe(1920);
  });
});
