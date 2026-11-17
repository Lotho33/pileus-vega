// The app's Text: React Native's, set in DM Sans like pileus-player
// (AppTheme's fontFamily 'DMSans'). Vega loads the TTFs in assets/fonts by
// file name, one family per weight, so the weight in a style picks the file.
//
// 800/900 use the Bold file, as in pileus-player, which bundles nothing
// heavier. Its renderer then thickens the Bold synthetically for w900 (the
// hero title); Vega doesn't, so that one title draws the effect itself
// (home/Hero.tsx).
// fontWeight stays on the style: with a bold file already chosen it adds
// nothing, and a Text nested inside this one keeps inheriting it.
//
// Only a Text that sets its own size or weight gets a family: one nested in
// another without either (a bold word inside a sentence goes the other way
// round) inherits its parent's.

import React, {forwardRef} from 'react';
import {StyleSheet, Text as RNText, TextProps, TextStyle} from 'react-native';

const FAMILY: Record<string, string> = {
  normal: 'DMSans-Regular',
  '100': 'DMSans-Regular',
  '200': 'DMSans-Regular',
  '300': 'DMSans-Regular',
  '400': 'DMSans-Regular',
  '500': 'DMSans-Medium',
  '600': 'DMSans-SemiBold',
  '700': 'DMSans-Bold',
  bold: 'DMSans-Bold',
  '800': 'DMSans-Bold',
  '900': 'DMSans-Bold',
};

/**
 * The DM Sans file for a style's weight (exported for tests). Italic has one
 * file, regular weight, as in pileus-player's pubspec.
 */
export function fontFamilyFor(weight: TextStyle['fontWeight'] | undefined, italic = false): string {
  return italic ? 'DMSans-Italic' : FAMILY[String(weight ?? 'normal')] ?? FAMILY.normal;
}

export const Text = forwardRef<RNText, TextProps>(function Text(props, ref) {
  const flat = (StyleSheet.flatten(props.style) ?? {}) as TextStyle;
  if (
    flat.fontFamily ||
    (flat.fontSize === undefined && flat.fontWeight === undefined && flat.fontStyle === undefined)
  ) {
    return <RNText ref={ref} {...props} />;
  }
  const family = fontFamilyFor(flat.fontWeight, flat.fontStyle === 'italic');
  return <RNText ref={ref} {...props} style={[props.style, {fontFamily: family}]} />;
});
