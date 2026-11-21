// Port of pileus-player lib/core/utils/image_sizing.dart:
// - TMDB: the smallest pre-generated rendition that still covers the tile,
//   instead of decoding full-size posters on a 1 GB Fire Stick;
// - Jellyfin/Emby: ask the server for that width (maxWidth);
// - anything else, where the caller asks for it (`proxy`: the home's cards
//   and hero, as in pileus-player): mycelium's `/img` proxy, which fetches the
//   upstream once, re-encodes it to WebP and caches it for every device. It
//   also sends the request a plain image host expects (Wikimedia, for one,
//   refuses a request without a browser-like User-Agent, which Vega's image
//   loader doesn't send) and fails open with a redirect to the original.
//   Detail pages load the upstream directly, like pileus-player's.

import {PixelRatio} from 'react-native';
import {encode as base64} from 'base-64';

// Widths come in dp (layout units); TMDB needs real pixels, twice as many on
// a 1080p Fire TV (density 2). Asking for the dp width fetched half-resolution
// posters and fanart.
const toPx = (dp: number) => Math.round(dp * PixelRatio.get());

const TMDB_RE = /^(https?:\/\/image\.tmdb\.org\/t\/p\/)(w\d+|original)(\/.+)$/;
const POSTER_LADDER = [154, 185, 342, 500, 780];
const BACKDROP_LADDER = [300, 780, 1280];

function rewriteTmdb(url: string, ladder: number[], targetPx: number): string {
  const m = TMDB_RE.exec(url);
  if (!m) {
    return url;
  }
  const size = ladder.find(s => s >= targetPx) ?? ladder[ladder.length - 1];
  return `${m[1]}w${size}${m[3]}`;
}

// Jellyfin/Emby image endpoints return the stored original unless asked for
// a width. Rounded up to a short ladder so the /img cache (keyed by the
// upstream URL) holds a few entries per image, not one per device width.
const JELLYFIN_RE = /\/Items\/[0-9a-fA-F-]{32,36}\/Images\/(Primary|Backdrop|Thumb|Banner|Art)\b/i;
const JELLYFIN_POSTER_LADDER = [240, 360, 480, 720, 960];
const JELLYFIN_BACKDROP_LADDER = [780, 1280, 1920];

function rewriteJellyfin(url: string, ladder: number[], targetPx: number): string {
  if (!JELLYFIN_RE.test(url)) {
    return url;
  }
  const lower = url.toLowerCase();
  if (lower.includes('maxwidth=') || lower.includes('fillwidth=')) {
    return url;
  }
  const w = ladder.find(s => s >= targetPx) ?? ladder[ladder.length - 1];
  return `${url}${url.includes('?') ? '&' : '?'}maxWidth=${w}`;
}

let proxyBase = '';

/** The mycelium origin `/img` lives on (set with the server address). */
export function setImageProxyBase(origin: string) {
  proxyBase = origin.replace(/\/+$/, '');
}

/** UTF-8 bytes as a binary string, for base-64's encode. */
function utf8(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x80) {
      out += String.fromCharCode(c);
    } else if (c < 0x800) {
      out += String.fromCharCode(0xc0 | (c >> 6), 0x80 | (c & 63));
    } else if (c < 0x10000) {
      out += String.fromCharCode(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    } else {
      out += String.fromCharCode(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return out;
}

/**
 * Already a mycelium image (`/img?u=…`, or the `/img/versus` cover the sports
 * plugins hand out) on any host — when the server wrote its URL with another
 * base than ours. It is WebP already; wrapping it again in /img made that
 * request hold one of the server's few conversion slots while fetching the
 * inner one, which queued for a slot too: 10 s, then "busy", no image.
 */
export function isMyceliumImage(url: string): boolean {
  const m = /^https?:\/\/[^/?#]+(\/[^?#]*)?(\?[^#]*)?/i.exec(url);
  if (!m) {
    return false;
  }
  const path = m[1] ?? '';
  return path === '/img/versus' || (path === '/img' && /[?&]u=/.test(m[2] ?? ''));
}

/** `/img?u=<base64url, no padding>`, or null when there's no server to ask. */
export function imgProxy(upstream: string): string | null {
  if (!proxyBase || upstream.startsWith(proxyBase) || isMyceliumImage(upstream)) {
    return null;
  }
  const u = base64(utf8(upstream)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${proxyBase}/img?u=${u}`;
}

function source(
  upstream: string,
  targetPx: number,
  tmdbLadder: number[],
  jellyfinLadder: number[],
  proxy: boolean,
): string {
  if (!upstream) {
    return upstream;
  }
  const lower = upstream.toLowerCase();
  if (lower.startsWith('data:') || lower.includes('.svg')) {
    return upstream;
  }
  if (lower.includes('image.tmdb.org/t/p/')) {
    return rewriteTmdb(upstream, tmdbLadder, targetPx);
  }
  const url = rewriteJellyfin(upstream, jellyfinLadder, targetPx);
  return (proxy && imgProxy(url)) || url;
}

/**
 * `widthDp`: the on-screen width in layout units. `proxy`: route a non-TMDB
 * image through mycelium's /img (the home's cards, as in pileus-player).
 */
export function posterSrc(upstream: string, widthDp: number, proxy = false): string {
  return source(upstream, toPx(widthDp), POSTER_LADDER, JELLYFIN_POSTER_LADDER, proxy);
}

// Full-screen backdrops stop at TMDB's w1280, as pileus-player does on TV
// (backdropCacheWidth): under the dark gradients, from a sofa, 1280 px on a
// 1080p panel doesn't show — while asking for 1920 px fell through to the
// /original file, often a 4K image of several MB to download and decode on
// every hero change.
const BACKDROP_MAX_PX = 1280;

/** `widthDp`: the on-screen width in layout units; `proxy` as posterSrc. */
export function backdropSrc(upstream: string, widthDp: number, proxy = false): string {
  return source(upstream, Math.min(toPx(widthDp), BACKDROP_MAX_PX), BACKDROP_LADDER, JELLYFIN_BACKDROP_LADDER, proxy);
}
