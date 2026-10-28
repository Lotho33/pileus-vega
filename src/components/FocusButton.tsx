import React, {forwardRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import {colors, font, scaledStyles, space} from '../theme';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  primary?: boolean;
  hasTVPreferredFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const FocusButton = forwardRef<View, Props>(function FocusButton(
  {label, onPress, disabled, busy, primary, hasTVPreferredFocus, style, testID},
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      ref={ref}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[
        styles.base,
        primary && styles.primary,
        focused && styles.focused,
        (disabled || busy) && styles.disabled,
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={colors.textHigh} />
      ) : (
        <Text style={[styles.label, focused && styles.labelFocused]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
});

const styles = scaledStyles({
  base: {
    minWidth: 220,
    height: 64,
    paddingHorizontal: space.m,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  primary: {backgroundColor: colors.primary},
  focused: {
    borderColor: colors.textHigh,
    transform: [{scale: 1.06}],
  },
  disabled: {opacity: 0.5},
  label: {color: colors.textMid, fontSize: font.body, fontWeight: '600'},
  labelFocused: {color: colors.textHigh},
});
