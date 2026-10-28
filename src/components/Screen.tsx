import React from 'react';
import {Text, View} from 'react-native';
import {colors, font, scaledStyles, space} from '../theme';

/** Centered single-task screen (connect, pairing, profiles). */
export function CenteredScreen({
  title,
  subtitle,
  error,
  children,
}: {
  title: string;
  subtitle?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.body}>{children}</View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = scaledStyles({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  title: {color: colors.textHigh, fontSize: font.hero, fontWeight: '700'},
  subtitle: {
    color: colors.textMid,
    fontSize: font.body,
    marginTop: space.s,
    textAlign: 'center',
    maxWidth: 1100,
  },
  body: {marginTop: space.l, alignItems: 'center', gap: space.m},
  error: {
    color: colors.error,
    fontSize: font.body,
    marginTop: space.l,
    textAlign: 'center',
    maxWidth: 1100,
  },
});
