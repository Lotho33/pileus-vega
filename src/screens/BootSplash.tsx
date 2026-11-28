// The start-up screen (pileus-player's splash_screen.dart): the Pileus icon
// grows in, the wordmark and its accent rule are revealed from the left,
// then the spinner fades in. Once the app knows where to go (`ready`) and
// the reveal is over, the lockup fades and shrinks away and `onDone` fires.

import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, View} from 'react-native';
import {SvgXml} from '@amazon-devices/react-native-svg';
import {ICON_ASPECT, ICON_SVG, WORDMARK_ASPECT, WORDMARK_SVG} from '../assets/branding';
import {Spinner} from '../components/Spinner';
import {colors, px, scaledStyles} from '../theme';

// The reveal's length: the Flutter splash's warm-start hold.
const INTRO_MS = 1000;
const CLOSE_MS = 380;

export function BootSplash({ready, onDone}: {ready: boolean; onDone: () => void}) {
  const t = useRef(new Animated.Value(0)).current;
  const close = useRef(new Animated.Value(0)).current;
  const [introDone, setIntroDone] = useState(false);
  useEffect(() => {
    Animated.timing(t, {toValue: 1, duration: INTRO_MS, easing: Easing.linear, useNativeDriver: true}).start(() =>
      setIntroDone(true),
    );
  }, [t]);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    if (ready && introDone) {
      Animated.timing(close, {
        toValue: 1,
        duration: CLOSE_MS,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start(() => onDoneRef.current());
    }
  }, [ready, introDone, close]);

  // One phase of the reveal, as an Interval of the Flutter animation.
  const phase = (from: number, to: number, easing: (v: number) => number = Easing.out(Easing.ease)) =>
    t.interpolate({inputRange: [from, to], outputRange: [0, 1], easing, extrapolate: 'clamp'});
  const iconFade = phase(0.05, 0.3);
  const iconScale = phase(0.05, 0.42, Easing.out(Easing.back(1.7))).interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });
  const wordmark = phase(0.4, 0.64, Easing.out(Easing.cubic));
  const rule = phase(0.66, 0.86);
  const spinner = phase(0.88, 1);

  const iconH = px(176);
  const iconW = iconH * ICON_ASPECT;
  const wordmarkH = px(148);
  const wordmarkW = wordmarkH * WORDMARK_ASPECT;
  const gap = px(26);
  const ruleGap = px(12);
  const ruleH = Math.max(1.5, px(3));
  const colH = wordmarkH + ruleGap + ruleH;

  return (
    <View style={styles.root}>
      <Animated.View
        style={[
          styles.center,
          {
            opacity: close.interpolate({inputRange: [0, 1], outputRange: [1, 0]}),
            transform: [{scale: close.interpolate({inputRange: [0, 1], outputRange: [1, 0.94]})}],
          },
        ]}>
        <View style={{width: iconW + gap + wordmarkW, height: iconH}}>
          <Animated.View style={[styles.icon, {opacity: iconFade, transform: [{scale: iconScale}]}]}>
            <SvgXml xml={ICON_SVG} width={iconW} height={iconH} color={colors.textHigh} />
          </Animated.View>
          <View style={[styles.abs, {left: iconW + gap, top: (iconH - colH) / 2}]}>
            <Reveal p={wordmark} w={wordmarkW} h={wordmarkH}>
              <SvgXml xml={WORDMARK_SVG} width={wordmarkW} height={wordmarkH} color={colors.textHigh} />
            </Reveal>
            <View style={{height: ruleGap}} />
            <Reveal p={rule} w={wordmarkW} h={ruleH}>
              <View style={{width: wordmarkW, height: ruleH, borderRadius: 2, backgroundColor: colors.primary}} />
            </Reveal>
          </View>
        </View>
        <Animated.View style={{marginTop: px(40), opacity: spinner}}>
          <Spinner size="large" />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/**
 * [children] shown from the left up to `p` of `w`: a clip window sliding
 * right over content held still (both moves on the native driver).
 */
function Reveal({
  p,
  w,
  h,
  children,
}: {
  p: Animated.AnimatedInterpolation<number>;
  w: number;
  h: number;
  children: React.ReactNode;
}) {
  const off = p.interpolate({inputRange: [0, 1], outputRange: [w, 0]});
  return (
    <Animated.View
      style={{width: w, height: h, overflow: 'hidden', transform: [{translateX: Animated.multiply(off, -1)}]}}>
      <Animated.View style={{transform: [{translateX: off}]}}>{children}</Animated.View>
    </Animated.View>
  );
}

const styles = scaledStyles({
  root: {flex: 1, backgroundColor: colors.bg},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  icon: {position: 'absolute', left: 0, top: 0},
  abs: {position: 'absolute'},
});
