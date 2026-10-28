// Pieces shared by the details layouts (pileus-player details_common.dart).

import React, {forwardRef, useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {Gradient, GradientName} from '../components/Gradient';
import {Icon, IconName} from '../components/Icon';
import {backdropSrc, posterSrc} from '../core/images';
import {colors, scaledStyles} from '../theme';

// Ratios of the 1920×1080 canvas, same numbers as details_common.dart.
export const detailsVPadRatio = 12 / 1080;
export const detailsPosterWRatio = 340 / 1920;
export const detailsInfoWRatio = 560 / 1920;
export const detailsGapRatio = 24 / 1920;
export const detailsEpisodeTileHRatio = 100 / 1080;
export const catalogHPadRatio = 56 / 1920;

export function Backdrop({url, W, shade}: {url: string; W: number; shade: GradientName}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {url ? (
        <Image source={{uri: backdropSrc(url, Math.round(W))}} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      <Gradient name={shade} direction="toBottom" />
    </View>
  );
}

export const BackButton = forwardRef<View, {s: number; onPress: () => void}>(function BackButton({s, onPress}, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      ref={ref}
      accessibilityLabel="Indietro"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[styles.back, {paddingHorizontal: 16 * s, paddingVertical: 8 * s}, focused && styles.backFocused]}>
      <Icon name="back" size={24 * s} color={focused ? colors.textHigh : colors.textMid} />
      <Text style={[styles.backText, {fontSize: 18 * s}, focused && styles.textOn]}>Indietro</Text>
    </Pressable>
  );
});

export function Poster({url, title, width}: {url: string; title: string; width: number}) {
  return (
    <View style={[styles.poster, {width, height: width * 1.5}]}>
      {url ? (
        <Image source={{uri: posterSrc(url, Math.round(width))}} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <Text style={styles.posterTitle} numberOfLines={4}>
          {title}
        </Text>
      )}
    </View>
  );
}

export function GenreChips({genres, s, max = 4}: {genres: string[]; s: number; max?: number}) {
  if (!genres.length) {
    return null;
  }
  return (
    <View style={styles.genres}>
      {genres.slice(0, max).map(g => (
        <View key={g} style={[styles.genre, {paddingHorizontal: 10 * s, paddingVertical: 4 * s}]}>
          <Text style={[styles.genreText, {fontSize: 15 * s}]}>{g}</Text>
        </View>
      ))}
    </View>
  );
}

/** ★ rating · year · runtime · content-rating badge. */
export function MetaRow({
  rating,
  year,
  runtime,
  contentRating,
  extra,
  s,
}: {
  rating: number;
  year: number;
  runtime?: string;
  contentRating?: string;
  extra?: string;
  s: number;
}) {
  const fs = 16 * s;
  return (
    <View style={styles.meta}>
      {rating > 0 ? (
        <Text style={[styles.metaMid, {fontSize: fs}]}>
          <Text style={styles.star}>★ </Text>
          {rating.toFixed(1)}
        </Text>
      ) : null}
      {year > 0 ? <Text style={[styles.metaLow, {fontSize: fs}]}>{year}</Text> : null}
      {runtime ? <Text style={[styles.metaLow, {fontSize: fs}]}>{runtime}</Text> : null}
      {extra ? <Text style={[styles.metaLow, {fontSize: fs}]}>{extra}</Text> : null}
      {contentRating ? (
        <View style={[styles.cr, {paddingHorizontal: 7 * s, paddingVertical: 2 * s}]}>
          <Text style={[styles.metaLow, {fontSize: 13 * s}]}>{contentRating}</Text>
        </View>
      ) : null}
    </View>
  );
}

export const PrimaryAction = forwardRef<
  View,
  {label: string; icon: IconName; s: number; preferred?: boolean; onPress: () => void}
>(function PrimaryAction({label, icon, s, preferred, onPress}, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      ref={ref}
      hasTVPreferredFocus={preferred}
      accessibilityLabel={label}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[
        styles.action,
        {paddingHorizontal: 28 * s, paddingVertical: 14 * s, gap: 10 * s},
        focused && styles.actionFocused,
      ]}>
      <Icon name={icon} size={26 * s} color={focused ? colors.bg : colors.textHigh} />
      <Text style={[styles.actionText, {fontSize: 20 * s}, focused && styles.actionTextFocused]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
});

const styles = scaledStyles({
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  backFocused: {borderColor: colors.primary, backgroundColor: 'rgba(124,106,247,0.25)'},
  backText: {color: colors.textMid, fontWeight: '600'},
  textOn: {color: colors.textHigh},
  poster: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterTitle: {color: colors.textLow, fontSize: 22, textAlign: 'center', padding: 16},
  genres: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  genre: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(242,242,240,0.08)',
  },
  genreText: {color: 'rgba(255,255,255,0.6)'},
  meta: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14},
  metaMid: {color: colors.textMid},
  metaLow: {color: 'rgba(255,255,255,0.54)'},
  star: {color: '#FFD700'},
  cr: {borderWidth: 1, borderColor: colors.textLow, borderRadius: 4},
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.primary,
  },
  actionFocused: {backgroundColor: colors.textHigh, borderColor: colors.textHigh, transform: [{scale: 1.05}]},
  actionText: {color: colors.textHigh, fontWeight: '700'},
  actionTextFocused: {color: colors.bg},
});
