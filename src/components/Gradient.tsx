import React, {useMemo, useState} from 'react';
import {Image, ImageStyle, StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import {GRADIENT_ASSETS} from '../gradients/assets';
import DEFS from '../gradients/defs.json';
import {scaledStyles} from '../theme';

export interface GradientStop {
  offset: number;
  color: string;
  opacity: number;
}

function rgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h
      .split('')
      .map(c => c + c)
      .join('');
  }
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Color at t in [0, 1]: linear between stops, clamped outside them. */
export function colorAt(stops: GradientStop[], t: number): string {
  let a = stops[0];
  let b = stops[stops.length - 1];
  if (t <= a.offset) {
    b = a;
  } else if (t >= b.offset) {
    a = b;
  } else {
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i].offset) {
        a = stops[i - 1];
        b = stops[i];
        break;
      }
    }
  }
  const k = b.offset > a.offset ? (t - a.offset) / (b.offset - a.offset) : 0;
  const ca = rgb(a.color);
  const cb = rgb(b.color);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * k);
  const alpha = a.opacity + (b.opacity - a.opacity) * k;
  return `rgba(${mix(ca[0], cb[0])},${mix(ca[1], cb[1])},${mix(ca[2], cb[2])},${alpha.toFixed(3)})`;
}

/**
 * Bands needed so that no step between two neighbours exceeds ~1 level of
 * 255 in alpha: 32 fixed bands over a black 0→1 fade were 8 levels apart
 * and showed as visible grey steps on the TV.
 */
export function bandsFor(stops: GradientStop[]): number {
  let span = 0;
  for (let i = 1; i < stops.length; i++) {
    span += Math.abs(stops[i].opacity - stops[i - 1].opacity);
  }
  return Math.max(4, Math.min(256, Math.ceil(span * 255)));
}

export type GradientName = keyof typeof GRADIENT_ASSETS;

/** A defs.json entry as stops (the fallback bands and the tests use these). */
export function stopsOf(name: GradientName): GradientStop[] {
  const d = (DEFS as Record<string, {color: string; stops: number[][]}>)[name];
  return d.stops.map(([offset, opacity]) => ({offset, color: d.color, opacity}));
}

function Bands({stops, direction, style}: {stops: GradientStop[]; direction: 'toRight' | 'toBottom'; style?: StyleProp<ViewStyle>}) {
  const fills = useMemo(() => {
    const n = bandsFor(stops);
    return Array.from({length: n}, (_, i) => colorAt(stops, (i + 0.5) / n));
  }, [stops]);
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, direction === 'toRight' ? styles.row : styles.column, style]}>
      {fills.map((c, i) => (
        <View key={i} style={[styles.band, {backgroundColor: c}]} />
      ))}
    </View>
  );
}

/**
 * Absolutely-filling linear gradient. Vega has no native gradient (and
 * react-native-svg's LinearGradient drew a flat translucent block), so it's
 * a 256-step PNG ramp from src/gradients (scripts/gen-gradients.mjs)
 * stretched by the GPU: one view, smooth. Should the image ever fail to
 * load, it falls back to flat bands computed from the same definition.
 */
export function Gradient({
  name,
  direction,
  style,
}: {
  name: GradientName;
  direction: 'toRight' | 'toBottom';
  /** Position/size overrides (it fills its parent by default). */
  style?: StyleProp<ImageStyle>;
}) {
  const [failed, setFailed] = useState(false);
  const stops = useMemo(() => stopsOf(name), [name]);
  if (failed) {
    return <Bands stops={stops} direction={direction} style={style as StyleProp<ViewStyle>} />;
  }
  return (
    <Image
      source={GRADIENT_ASSETS[name][direction === 'toRight' ? 'h' : 'v']}
      resizeMode="stretch"
      fadeDuration={0}
      onError={() => {
        console.warn(`pileus: gradient ${name}/${direction} failed to load, using bands`);
        setFailed(true);
      }}
      style={[StyleSheet.absoluteFill, styles.image, style]}
    />
  );
}

const styles = scaledStyles({
  row: {flexDirection: 'row'},
  column: {flexDirection: 'column'},
  band: {flex: 1},
  image: {width: '100%', height: '100%'},
});
