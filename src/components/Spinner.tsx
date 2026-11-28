// The app's loading spinner (pileus-player's PileusSpinner): a three-quarter
// ring in the accent colour turning once a second, fading in so a fetch that
// resolves at once doesn't flash it. In place of React Native's
// ActivityIndicator, which on Vega is the system's three dots.

import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import {colors, px} from '../theme';

export function Spinner({
  size = 'small',
  color = colors.primary,
  style,
}: {
  /** 'small' (inline, a button), 'large' (a whole page), or dp. */
  size?: 'small' | 'large' | number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const d = typeof size === 'number' ? size : px(size === 'large' ? 48 : 24);
  const stroke = Math.max(1.5, (d * 2.5) / 30);
  const spin = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, {toValue: 1, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true}).start();
    const loop = Animated.loop(
      Animated.timing(spin, {toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true}),
    );
    loop.start();
    return () => loop.stop();
  }, [fade, spin]);
  const rotate = spin.interpolate({inputRange: [0, 1], outputRange: ['0deg', '360deg']});
  // The caller's style places the box (a full-page `flex: 1` centres it);
  // only the ring inside turns, about its own centre.
  return (
    <View accessibilityLabel="Caricamento" style={[styles.box, style]}>
      <Animated.View style={{width: d, height: d, opacity: fade, transform: [{rotate}]}}>
        <View
          style={[styles.ring, {width: d, height: d, borderRadius: d / 2, borderWidth: stroke, borderColor: color}]}
        />
      </Animated.View>
    </View>
  );
}

// Plain StyleSheet: sizes here are already dp.
const styles = StyleSheet.create({
  box: {alignItems: 'center', justifyContent: 'center'},
  // The quarter left open.
  ring: {borderTopColor: 'transparent'},
});
