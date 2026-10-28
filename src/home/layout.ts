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

export function useHomeLayout(): HomeLayout {
  const {width, height} = useWindowDimensions();
  return computeLayout(width, height);
}
