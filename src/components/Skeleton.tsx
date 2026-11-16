// Loading placeholders shaped like what's coming (pileus-player
// shared/widgets/skeleton.dart): flat boxes in one color, no shimmer, instead
// of a spinner on an empty screen.
//
// Sizes: skeleton.dart's DetailsSkeleton works in `height / 1080` units, the
// same 1080p pixels as px(); the home row's box radius (continue_watching
// _SkeletonRow, 12 on Flutter's 540-tall TV canvas) is 24 of them.

import React, {useEffect, useRef} from 'react';
import {Pressable, StyleSheet, View, ViewStyle} from 'react-native';
import {focusSoon} from '../core/focus';
import {homeRowLayout, HomeLayout} from '../home/layout';
import {px} from '../theme';

export const SKELETON_COLOR = '#1A1A2A';

export function SkeletonBox({width, height, radius = px(6), style}: {
  width?: number | `${number}%`;
  height: number;
  radius?: number;
  style?: ViewStyle;
}) {
  return <View style={[{width, height, borderRadius: radius, backgroundColor: SKELETON_COLOR}, style]} />;
}

/** A home row while its first page loads: poster-shaped boxes. */
export function RowSkeleton({L: home, landscape}: {L: HomeLayout; landscape?: boolean}) {
  const L = homeRowLayout(home, landscape ? 'landscape' : 'poster');
  const w = Math.round(landscape ? L.landscapeW : L.posterW);
  const h = Math.round(L.posterH);
  const gap = Math.round(L.gap);
  const n = Math.max(1, Math.ceil((L.W - L.hPad) / (w + gap)));
  return (
    <View style={[styles.row, {height: h * 1.2, paddingLeft: Math.round(L.hPad), gap}]}>
      {Array.from({length: n}, (_, i) => (
        <SkeletonBox key={i} width={w} height={h} radius={px(24)} />
      ))}
    </View>
  );
}

/**
 * A details page while GetDetails answers: title, meta line, plot and the
 * play button, on the plain background. It also holds focus: with nothing
 * focusable on the page, focus stayed on the home card underneath and OK
 * opened that title a second time.
 */
export function DetailsSkeleton({W, H}: {W: number; H: number}) {
  const hold = useRef<View>(null);
  useEffect(() => focusSoon(() => hold.current), []);
  const u = H / 1080;
  return (
    <View style={[styles.details, {paddingLeft: W * 0.06, paddingTop: H * 0.22, paddingRight: W * 0.45}]}>
      <Pressable ref={hold} accessibilityLabel="Caricamento" style={styles.hold} />
      <SkeletonBox width={W * 0.32} height={56 * u} />
      <View style={{height: 24 * u}} />
      <SkeletonBox width={W * 0.18} height={18 * u} />
      <View style={{height: 32 * u}} />
      {[1, 0.96, 0.9, 0.6].map(f => (
        <SkeletonBox key={f} width={`${f * 100}%`} height={16 * u} style={{marginBottom: 12 * u}} />
      ))}
      <View style={{height: 24 * u}} />
      <SkeletonBox width={200 * u} height={58 * u} radius={8 * u} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center'},
  details: {...StyleSheet.absoluteFillObject, alignItems: 'flex-start'},
  // Full-size and transparent, like PlayerScreen's FocusCatcher: a tiny or
  // opacity-0 view isn't reliably focusable on Vega.
  hold: {...StyleSheet.absoluteFillObject, backgroundColor: 'transparent'},
});
