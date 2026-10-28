// "Formato" modes of pileus-player's video_view_mode.dart. On Vega the
// picture fills the KeplerVideoSurfaceView, so each mode is a surface box:
// fitted, covering (cropped by the screen), the whole screen, or a forced
// ratio fitted in.

export type ViewMode = 'fit' | 'zoom' | 'stretch' | 'ratio16x9' | 'ratio4x3';

export const VIEW_MODES: {id: ViewMode; label: string}[] = [
  {id: 'fit', label: 'Adatta'},
  {id: 'zoom', label: 'Riempi (zoom)'},
  {id: 'stretch', label: 'Allunga'},
  {id: 'ratio16x9', label: '16:9'},
  {id: 'ratio4x3', label: '4:3'},
];

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function surfaceBox(mode: ViewMode, W: number, H: number, videoW: number, videoH: number): Box {
  const full = {left: 0, top: 0, width: W, height: H};
  const aspect =
    mode === 'ratio16x9' ? 16 / 9 : mode === 'ratio4x3' ? 4 / 3 : videoW > 0 && videoH > 0 ? videoW / videoH : 0;
  if (mode === 'stretch' || aspect <= 0) {
    return full;
  }
  const screen = W / H;
  // zoom covers the screen; the other modes fit inside it.
  const widthBound = mode === 'zoom' ? aspect < screen : aspect >= screen;
  const width = widthBound ? W : H * aspect;
  const height = widthBound ? W / aspect : H;
  return {left: (W - width) / 2, top: (H - height) / 2, width, height};
}

// The chosen mode lasts for the app session, like Flutter's shared notifier.
let current: ViewMode = 'fit';
export const getViewMode = () => current;
export const setViewMode = (m: ViewMode) => {
  current = m;
};
