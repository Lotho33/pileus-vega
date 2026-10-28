import React, {useEffect, useRef} from 'react';
import {Animated, Easing, Text, View} from 'react-native';
import {colors, scaledStyles} from '../theme';
import type {HomeLayout} from './layout';

/**
 * Row title, led by a single dot gliding down a short vertical track to the
 * active row's position (pileus-player's _RowPositionIndicator).
 */
export function SectionHeader({
  title,
  active,
  total,
  L,
}: {
  title: string;
  active: number;
  total: number;
  L: HomeLayout;
}) {
  const trackH = L.H * 0.037;
  const dot = Math.min(20, Math.max(5, trackH * 0.225));
  const lineW = Math.min(6, Math.max(1.2, dot * 0.22));
  const span = trackH - dot;
  const y = useRef(new Animated.Value(0)).current;
  const target = total > 1 ? Math.min(1, active / (total - 1)) * span : 0;

  useEffect(() => {
    Animated.timing(y, {
      toValue: target,
      duration: 420,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [target, y]);

  return (
    <View
      style={[
        styles.row,
        {
          top: L.carouselTop,
          height: L.headerH,
          paddingLeft: L.hPad,
          paddingTop: L.H * 0.017,
          paddingBottom: L.H * 0.011,
        },
      ]}
      pointerEvents="none">
      {total > 1 ? (
        <View style={{width: dot, height: trackH}}>
          <View
            style={[
              styles.track,
              {top: dot / 2, left: (dot - lineW) / 2, width: lineW, height: span, borderRadius: lineW / 2},
            ]}
          />
          <Animated.View
            style={[
              styles.dot,
              {width: dot, height: dot, borderRadius: dot / 2, transform: [{translateY: y}]},
            ]}
          />
        </View>
      ) : (
        <View style={[styles.bar, {width: L.H * (5 / 1080), height: L.H * 0.033}]} />
      )}
      <Text style={[styles.title, {fontSize: L.H * 0.03, marginLeft: L.H * (18 / 1080)}]} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

const styles = scaledStyles({
  row: {position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center'},
  track: {position: 'absolute', backgroundColor: 'rgba(242,242,240,0.25)'},
  dot: {position: 'absolute', top: 0, left: 0, backgroundColor: colors.primary},
  bar: {backgroundColor: colors.primary, borderRadius: 3},
  title: {color: colors.textHigh, fontWeight: '700'},
});
