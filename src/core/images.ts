// Port of the TMDB size ladder in pileus-player lib/core/utils/image_sizing.dart:
// ask TMDB for the smallest rendition that still covers the tile, instead
// of decoding full-size posters on a 1 GB Fire Stick.
//
// mycelium's /img resize proxy is not used yet: it re-encodes to WebP and
// WebP decoding on Vega's Image is still unverified.

import {PixelRatio} from 'react-native';

// Widths come in dp (layout units); TMDB needs real pixels, twice as many on
// a 1080p Fire TV (density 2). Asking for the dp width fetched half-resolution
// posters and fanart.
const toPx = (dp: number) => Math.round(dp * PixelRatio.get());

const TMDB_RE = /^(https?:\/\/image\.tmdb\.org\/t\/p\/)(w\d+|original)(\/.+)$/;
const POSTER_LADDER = [154, 185, 342, 500, 780];
const BACKDROP_LADDER = [300, 780, 1280];

function rewriteTmdb(url: string, ladder: number[], targetPx: number, allowOriginal = false): string {
  const m = TMDB_RE.exec(url);
  if (!m) {
    return url;
  }
  const size = ladder.find(s => s >= targetPx);
  const seg = size ? `w${size}` : allowOriginal ? 'original' : `w${ladder[ladder.length - 1]}`;
  return `${m[1]}${seg}${m[3]}`;
}

/** `widthDp`: the on-screen width in layout units. */
export function posterSrc(upstream: string, widthDp: number): string {
  return upstream ? rewriteTmdb(upstream, POSTER_LADDER, toPx(widthDp)) : upstream;
}

// Full-screen backdrops stop at TMDB's w1280, as pileus-player does on TV
// (backdropCacheWidth): under the dark gradients, from a sofa, 1280 px on a
// 1080p panel doesn't show — while asking for 1920 px fell through to the
// /original file, often a 4K image of several MB to download and decode on
// every hero change.
const BACKDROP_MAX_PX = 1280;

/** `widthDp`: the on-screen width in layout units. */
export function backdropSrc(upstream: string, widthDp: number): string {
  return upstream ? rewriteTmdb(upstream, BACKDROP_LADDER, Math.min(toPx(widthDp), BACKDROP_MAX_PX)) : upstream;
}
