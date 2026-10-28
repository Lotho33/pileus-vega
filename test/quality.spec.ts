import {capRestrictions, qualityTier, rememberBandwidth, startBandwidth, tierLabel} from '../src/player/quality';

describe('quality tiers', () => {
  it('names non-16:9 pictures by their standard tier', () => {
    expect(qualityTier(1920, 1080)).toBe(1080);
    expect(qualityTier(1920, 800)).toBe(1080);
    expect(qualityTier(1916, 1036)).toBe(1080);
    expect(qualityTier(1280, 536)).toBe(720);
    expect(qualityTier(1920, 1088)).toBe(1080);
    expect(qualityTier(3840, 1600)).toBe(2160);
    expect(qualityTier(854, 480)).toBe(480);
    expect(qualityTier(640, 360)).toBe(360);
    expect(qualityTier(1440, 1080)).toBe(1080); // 4:3
  });

  it('labels', () => {
    expect(tierLabel(2160)).toBe('4K');
    expect(tierLabel(720)).toBe('720p');
  });

  it('a 720p cap also stops a wide 1080p picture', () => {
    expect(capRestrictions(720)).toEqual({maxHeight: 720, maxWidth: 1280});
    expect(capRestrictions(0).maxWidth).toBe(Infinity);
  });
});

describe('start bandwidth', () => {
  it('starts from the last measured throughput, clamped', async () => {
    expect(await startBandwidth()).toBe(10e6);
    rememberBandwidth(42e6);
    expect(await startBandwidth()).toBe(42e6);
    rememberBandwidth(100);
    expect(await startBandwidth()).toBe(1.5e6);
  });
});
