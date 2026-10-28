import {Dimensions, StyleSheet} from 'react-native';

// Palette mirrored from pileus-player lib/core/theme/app_theme.dart.
export const colors = {
  bg: '#0D0D1A',
  surface: '#141428',
  surface2: '#1A1A2E',
  border: '#2A2A4A',
  primary: '#7C6AF7',
  secondary: '#4FC3F7',
  // Soft off-white: pure #FFF is harsh on a TV in a dim room.
  textHigh: '#F2F2F0',
  textMid: 'rgba(255,255,255,0.70)',
  textLow: 'rgba(255,255,255,0.38)',
  error: '#FF6B6B',
};

// Sizes are authored in pixels of a 1080p screen and scaled by K. Vega
// reports the TV window in dp — 960×540 at density 2 on a 1080p Fire TV —
// so a raw "26" would be twice the intended size.
export const K = Dimensions.get('window').height / 1080 || 0.5;
export const px = (v: number) => v * K;

const SCALED = new Set([
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'top',
  'bottom',
  'left',
  'right',
  'gap',
  'rowGap',
  'columnGap',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
  'padding',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingHorizontal',
  'paddingVertical',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'borderWidth',
  'borderTopWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderRightWidth',
  'textShadowRadius',
  'shadowRadius',
]);

/** One style with its 1080p pixel sizes scaled by `k` (exported for tests). */
export function scaleStyle<T extends Record<string, unknown>>(style: T, k: number): T {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(style)) {
    out[key] = typeof v === 'number' && SCALED.has(key) ? v * k : v;
  }
  return out as T;
}

/** StyleSheet.create for styles written in 1080p pixels. */
export function scaledStyles<T extends StyleSheet.NamedStyles<T>>(styles: T): T {
  const out: Record<string, unknown> = {};
  for (const [name, style] of Object.entries(styles)) {
    out[name] = scaleStyle(style as Record<string, unknown>, K);
  }
  return StyleSheet.create(out as T);
}

// 1080p pixels, like every literal in a scaledStyles() sheet; wrap in px()
// when used outside one.
export const space = {xs: 8, s: 16, m: 24, l: 40, xl: 64};
export const font = {small: 22, body: 26, title: 40, hero: 56};
