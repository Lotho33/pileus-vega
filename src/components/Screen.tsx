import React, {forwardRef, useState} from 'react';
import {Dimensions, Image, Pressable, StyleSheet, View} from 'react-native';
import {Text} from './Text';
import {colors, font, scaledStyles, space} from '../theme';

const AUTH_GLOW = require('../../assets/image/auth_glow.png');

/**
 * Connect and pairing (server_discovery_screen.dart / device_pairing_screen
 * .dart): a violet radial glow, "Pileus" over a one-line subtitle, and the
 * screen's content in a 480-wide card (1080p pixels).
 */
export function AuthFrame({subtitle, children}: {subtitle: string; children: React.ReactNode}) {
  const {width, height} = Dimensions.get('window');
  return (
    <View style={styles.authRoot}>
      <Image source={AUTH_GLOW} style={[StyleSheet.absoluteFill, {width, height}]} resizeMode="stretch" />
      <Text style={styles.brand}>Pileus</Text>
      <Text style={[styles.authSubtitle, {fontSize: height * 0.0265}]}>{subtitle}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/** A plain text link ("Cambia server", "Riprova scansione automatica"). */
export const TextLink = forwardRef<View, {label: string; onPress: () => void}>(function TextLink({label, onPress}, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      ref={ref}
      accessibilityLabel={label}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={styles.link}>
      <Text style={[styles.linkText, focused && styles.linkOn]}>{label}</Text>
    </Pressable>
  );
});

/** Label + hint above a field inside the card. */
export function FieldLabel({label, hint}: {label: string; hint?: string}) {
  return (
    <View style={styles.fieldLabel}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

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
  authRoot: {flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32},
  // 62 type, letterSpacing 2 units (×2), regular weight.
  brand: {color: '#fff', fontSize: 62, letterSpacing: 4},
  authSubtitle: {color: 'rgba(255,255,255,0.54)', marginTop: 8},
  // Color 0xFF141428, radius 20 and a 1-unit 0xFF2A2A4A border (×2),
  // padding 40/36, at most 480 wide.
  card: {
    marginTop: 40,
    width: 480,
    paddingHorizontal: 40,
    paddingVertical: 36,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'stretch',
    gap: 20,
  },
  link: {alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8},
  linkText: {color: 'rgba(255,255,255,0.38)', fontSize: 22},
  linkOn: {color: '#fff'},
  fieldLabel: {gap: 6},
  label: {color: 'rgba(255,255,255,0.7)', fontSize: 20, fontWeight: '600'},
  hint: {color: 'rgba(255,255,255,0.38)', fontSize: 17},
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
