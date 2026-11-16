// Home geometry, ported from _StandardHomeShellState.build() /
// _buildMetaLayers() in pileus-player (home_screen/shell.dart). Everything
// is a ratio of the screen so it holds at 720p and 1080p alike.

import {useWindowDimensions} from 'react-native';

export const VISIBLE_CARDS = 7;

export interface HomeLayout {
  W: number;
  H: number;
  hPad: number;
  gap: number;
  posterW: number;
  posterH: number;
  landscapeW: number;
  headerH: number;
  carouselTop: number;
  metaTop: number;
  metaW: number;
  titleFs: number;
  zTitleH: number;
  metaFs: number;
  zMetaH: number;
  genreFs: number;
  zGenreH: number;
  plotFs: number;
  plotLines: number;
  tMeta: number;
  tGenres: number;
  tPlot: number;
  navW: number;
}

export function computeLayout(W: number, H: number): HomeLayout {
  const hPad = W * (56 / 1920);
  const gap = W * (20 / 1920);
  const posterW = (W - hPad * 2 - gap * (VISIBLE_CARDS - 1)) / VISIBLE_CARDS;
  const posterH = posterW * 1.5;
  const headerH = H * 0.017 + Math.max(H * 0.033, H * 0.03 * 1.2) + H * 0.011;
  const scaleOvf = posterH * 0.1;
  const spacersH = H * (44 / 1080);
  const carouselTop = H - (headerH + scaleOvf + posterH + scaleOvf + spacersH);

  const metaTop = H * 0.085;
  const metaW = W * 0.42;
  const titleFs = H * 0.045;
  const zTitleH = H * 0.14;
  const metaFs = Math.min(48, Math.max(11, H * 0.022));
  const zMetaH = metaFs * 1.35;
  const genreFs = H * 0.013;
  const zGenreH = genreFs * 1.5 + H * (6 / 1080);
  const tMeta = metaTop + zTitleH + H * 0.012;
  const tGenres = tMeta + zMetaH + H * 0.009;
  const tPlot = tGenres + zGenreH + H * 0.009;

  // Plot auto-fits to 4 lines in the room left above the carousel.
  const availPlotH = Math.min(Math.max(carouselTop - H * 0.004 - tPlot, 0), H * 0.42);
  const nominalFs = Math.min(22, Math.max(12, H * 0.02));
  const plotFs = Math.min(nominalFs, Math.max(11, availPlotH / (4 * 1.5)));
  const plotLines = Math.min(8, Math.max(2, Math.floor(availPlotH / (plotFs * 1.5))));

  return {
    W,
    H,
    hPad,
    gap,
    posterW,
    posterH,
    landscapeW: (posterH * 16) / 9,
    headerH,
    carouselTop,
    metaTop,
    metaW,
    titleFs,
    zTitleH,
    metaFs,
    zMetaH,
    genreFs,
    zGenreH,
    plotFs,
    plotLines,
    tMeta,
    tGenres,
    tPlot,
    navW: W * (460 / 1920),
  };
}

/** Focus scale of a card (AppScale.focusScaleCard). */
export const FOCUS_SCALE_CARD = 1.07;
/** Share of an 8th poster showing past the last whole one (_kPeekFraction). */
const PEEK_FRACTION = 0.16;

/**
 * The geometry one home row draws its cards with, as pileus-player's:
 * - poster rows (fixed_carousel.dart): seven cards plus 16% of an eighth,
 *   which peeks in at the right edge so the row reads as scrollable — a bit
 *   smaller than the seven-across `posterW` the strip's height is based on;
 * - Continue Watching (continue_watching.dart): 16:9 cards as tall as that
 *   seven-across poster, with the gap and the margin widened by how much
 *   more a wide card grows on focus than a poster does, so a focused card
 *   never overlaps its neighbour and its edge lines up with the rows below.
 */
export function homeRowLayout(L: HomeLayout, variant: 'poster' | 'landscape'): HomeLayout {
  if (variant === 'landscape') {
    const grow = (FOCUS_SCALE_CARD - 1) / 2;
    const overflowCw = L.landscapeW * grow;
    const overflowPoster = L.posterW * grow;
    return {...L, hPad: L.hPad + (overflowCw - overflowPoster), gap: L.gap + overflowCw};
  }
  const posterW = (L.W - L.hPad * 2 - L.gap * VISIBLE_CARDS) / (VISIBLE_CARDS + PEEK_FRACTION);
  return {...L, posterW, posterH: posterW * 1.5};
}

/**
 * Card titles under posters (app_scale.dart caption: 21/1080 of the height,
 * 11–30 units).
 */
export function captionFont(H: number): number {
  return Math.min(30, Math.max(11, (H * 21) / 1080));
}

export function useHomeLayout(): HomeLayout {
  const {width, height} = useWindowDimensions();
  return computeLayout(width, height);
}
