// The square "back" button of the full pages opened from the side nav
// (pileus-player's TvBackButton, the settings pages' one): an arrow in a
// rounded square, accent fill and border when focused.

import React, {forwardRef, useState} from 'react';
import {Pressable, View} from 'react-native';
import {Icon} from './Icon';
import {colors, scaledStyles} from '../theme';

export const SquareBackButton = forwardRef<View, {s: number; onPress: () => void}>(function SquareBackButton(
  {s, onPress},
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      ref={ref}
      accessibilityLabel="Indietro"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[styles.back, {padding: 10 * s, borderRadius: 20 * s}, focused && styles.focused]}>
      <Icon name="back" size={28 * s} color={focused ? colors.textHigh : 'rgba(255,255,255,0.7)'} />
    </Pressable>
  );
});

const styles = scaledStyles({
  back: {borderWidth: 2, borderColor: 'transparent', backgroundColor: 'rgba(255,255,255,0.05)'},
  focused: {borderColor: colors.primary, backgroundColor: 'rgba(124,106,247,0.22)'},
});
