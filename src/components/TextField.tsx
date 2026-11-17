import React from 'react';
import {StyleProp, View, ViewStyle} from 'react-native';
import {Text} from './Text';
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
  inCard,
  style,
}: {
  value: string;
  placeholder: string;
  secure?: boolean;
  center?: boolean;
  /** Inside AuthFrame's card: as wide as the card, the connect screen's field look. */
  inCard?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const shown = secure ? '•'.repeat(Array.from(value).length) : value;
  return (
    <View style={[styles.box, inCard && styles.inCard, center && styles.center, style]}>
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
  inCard: {
    width: undefined,
    alignSelf: 'stretch',
    height: 64,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: '#0D0D1A',
  },
  center: {alignItems: 'center'},
  value: {color: colors.textHigh, fontSize: font.body * 1.1, letterSpacing: 1},
  placeholder: {color: colors.textLow, fontSize: font.body},
  caret: {color: colors.primary, fontWeight: '300'},
});
