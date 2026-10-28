import React from 'react';
import {StyleProp, Text, View, ViewStyle} from 'react-native';
import {colors, font, scaledStyles, space} from '../theme';

/**
 * Read-only field showing what the on-screen keyboard typed. Not focusable:
 * focus lives on the keys (see OnScreenKeyboard).
 */
export function TextField({
  value,
  placeholder,
  secure,
  center,
  style,
}: {
  value: string;
  placeholder: string;
  secure?: boolean;
  center?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const shown = secure ? '•'.repeat(Array.from(value).length) : value;
  return (
    <View style={[styles.box, center && styles.center, style]}>
      {value ? (
        <Text style={styles.value} numberOfLines={1}>
          {shown}
          <Text style={styles.caret}>|</Text>
        </Text>
      ) : (
        <Text style={styles.placeholder} numberOfLines={1}>
          <Text style={styles.caret}>|</Text>
          {placeholder}
        </Text>
      )}
    </View>
  );
}

const styles = scaledStyles({
  box: {
    width: 720,
    height: 76,
    paddingHorizontal: space.m,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.primary,
    justifyContent: 'center',
  },
  center: {alignItems: 'center'},
  value: {color: colors.textHigh, fontSize: font.body * 1.1, letterSpacing: 1},
  placeholder: {color: colors.textLow, fontSize: font.body},
  caret: {color: colors.primary, fontWeight: '300'},
});
