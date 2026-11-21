import {PixelRatio} from 'react-native';
import {backdropSrc, imgProxy, isMyceliumImage, posterSrc, setImageProxyBase} from '../src/core/images';

jest.spyOn(PixelRatio, 'get').mockReturnValue(2);

describe('images', () => {
  beforeEach(() => setImageProxyBase('http://10.0.0.204:8000/'));

  test('/img takes the URL as base64url without padding, like image_sizing.dart', () => {
    // base64Url.encode(utf8.encode(u)).replaceAll('=', '') in Dart.
    expect(imgProxy('https://example.com/a b/é?x=1')).toBe(
      'http://10.0.0.204:8000/img?u=aHR0cHM6Ly9leGFtcGxlLmNvbS9hIGIvw6k_eD0x',
    );
  });

  test('home cards go through the proxy, detail pages load directly', () => {
    const up = 'https://commons.wikimedia.org/wiki/Special:FilePath/Poster.jpg';
    expect(posterSrc(up, 200, true)).toMatch(/^http:\/\/10\.0\.0\.204:8000\/img\?u=/);
    expect(posterSrc(up, 200)).toBe(up);
  });

  test('TMDB picks its own size and never goes through the proxy', () => {
    const up = 'https://image.tmdb.org/t/p/original/abc.jpg';
    expect(posterSrc(up, 120, true)).toBe('https://image.tmdb.org/t/p/w342/abc.jpg');
    expect(backdropSrc(up, 960, true)).toBe('https://image.tmdb.org/t/p/w1280/abc.jpg');
  });

  test('Jellyfin is asked for the width', () => {
    const up = 'http://jf.lan/Items/0123456789abcdef0123456789abcdef/Images/Primary';
    expect(posterSrc(up, 150)).toBe(`${up}?maxWidth=360`);
    expect(posterSrc(`${up}?maxWidth=100`, 150)).toBe(`${up}?maxWidth=100`);
  });

  test('SVG and data: URLs are left alone', () => {
    expect(posterSrc('https://x.org/logo.svg', 100, true)).toBe('https://x.org/logo.svg');
    expect(posterSrc('data:image/png;base64,AAAA', 100, true)).toBe('data:image/png;base64,AAAA');
  });

  test('no server yet: the upstream URL', () => {
    setImageProxyBase('');
    expect(posterSrc('https://x.org/p.jpg', 100, true)).toBe('https://x.org/p.jpg');
  });

  test('a mycelium image under another base is left as it is', () => {
    const versus = 'https://media.example/img/versus?h=aA&a=bB';
    expect(imgProxy(versus)).toBeNull();
    expect(posterSrc(versus, 150, true)).toBe(versus);
    expect(posterSrc('http://other:8000/img?u=aHR0cA', 150, true)).toBe('http://other:8000/img?u=aHR0cA');
  });

  test('only the /img endpoints count as mycelium images', () => {
    expect(isMyceliumImage('https://site.example/img/versus?h=a&a=b')).toBe(true);
    expect(isMyceliumImage('https://site.example/img?u=abc')).toBe(true);
    expect(isMyceliumImage('https://site.example/img/poster.jpg')).toBe(false);
    expect(isMyceliumImage('https://site.example/img')).toBe(false);
    expect(isMyceliumImage('https://site.example/x?next=/img/versus')).toBe(false);
  });
});
