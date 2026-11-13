import {
  _resetLogoPending,
  haloOffsets,
  LOGO_PENDING_WINDOW_MS,
  logoDisplaySize,
  logoHaloFor,
  logoPending,
} from '../src/core/logo';
import {LogoMeta} from '../src/gen/media';

const meta = (m: Partial<LogoMeta>) => LogoMeta.fromPartial({width: 300, height: 100, coverage: 0.5, ...m});

describe('logo halo (smart_logo.dart)', () => {
  it('on the dark theme follows the server hint', () => {
    expect(logoHaloFor('l.png', meta({halo: 'light'})).kind).toBe('light');
    expect(logoHaloFor('l.png', meta({halo: ''})).kind).toBe('none');
  });

  it('on a light background decides from the luminance', () => {
    expect(logoHaloFor('l.png', meta({lumMid: 0.7}), 0.8).kind).toBe('dark');
    expect(logoHaloFor('l.png', meta({lightShare: 0.35}), 0.8).kind).toBe('dark');
    expect(logoHaloFor('l.png', meta({lumMid: 0.3, lightShare: 0.1, halo: 'light'}), 0.8).kind).toBe('none');
  });

  it('is stronger for thin strokes', () => {
    expect(logoHaloFor('l.png', meta({halo: 'light', coverage: 0.1})).strong).toBe(true);
    expect(logoHaloFor('l.png', meta({halo: 'light', coverage: 0.3})).strong).toBe(false);
  });

  it('without measurements uses the legacy dark flag', () => {
    expect(logoHaloFor('l.png|800|200|1', undefined).kind).toBe('light');
    expect(logoHaloFor('l.png|800|200|0', undefined).kind).toBe('none');
    expect(logoHaloFor('l.png|800|200|1', undefined, 0.9).kind).toBe('none');
    // An all-zero message is "not measured".
    expect(logoHaloFor('l.png|800|200|1', LogoMeta.fromPartial({})).kind).toBe('light');
  });

  it('draws 4 copies, 8 when strong, none without a halo', () => {
    expect(haloOffsets({kind: 'none', strong: false})).toHaveLength(0);
    expect(haloOffsets({kind: 'light', strong: false})).toHaveLength(4);
    const strong = haloOffsets({kind: 'light', strong: true});
    expect(strong).toHaveLength(8);
    expect(Math.max(...strong.map(o => Math.abs(o.x)))).toBe(2);
  });
});

describe('logo draw size', () => {
  it('uses the measured proportions, then the suffix, then 3:1', () => {
    expect(logoDisplaySize('l.png', meta({width: 400, height: 100}), 200, 100)).toEqual({w: 200, h: 50});
    expect(logoDisplaySize('l.png|200|100|0', undefined, 200, 200)).toEqual({w: 200, h: 100});
    expect(logoDisplaySize('l.png', undefined, 300, 200)).toEqual({w: 300, h: 100});
  });
});

describe('logo pending (logo_meta not there yet)', () => {
  beforeEach(() => _resetLogoPending());

  it('is pending only without measurements, and not for non-TMDB SVGs', () => {
    expect(logoPending('', undefined)).toBe(false);
    expect(logoPending('a.png', meta({}))).toBe(false);
    expect(logoPending('a.png', undefined)).toBe(true);
    expect(logoPending('https://x/y.svg', undefined)).toBe(false);
    expect(logoPending('https://image.tmdb.org/t/p/original/y.svg', undefined)).toBe(true);
  });

  it('stops after the 2-minute window from the first sighting', () => {
    const t0 = 1_000_000;
    expect(logoPending('b.png', undefined, t0)).toBe(true);
    expect(logoPending('b.png', undefined, t0 + LOGO_PENDING_WINDOW_MS - 1)).toBe(true);
    expect(logoPending('b.png', undefined, t0 + LOGO_PENDING_WINDOW_MS)).toBe(false);
    // Another logo has its own clock.
    expect(logoPending('c.png', undefined, t0 + LOGO_PENDING_WINDOW_MS)).toBe(true);
  });
});
