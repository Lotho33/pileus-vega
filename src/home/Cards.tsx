// Poster (2:3) and landscape (16:9) cards — focus cue is a primary-colored
// border plus a slight scale, no glow (same as pileus-player's poster_card).

import React, {forwardRef, memo, useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {Gradient} from '../components/Gradient';
import {Icon} from '../components/Icon';
import {posterSrc} from '../core/images';
import {colors, px, scaledStyles} from '../theme';
import type {CardModel} from './model';

interface CardProps {
  card: CardModel;
  width: number;
  height: number;
  preferred: boolean;
  /** Focus look without focus (the side nav is open over the row). */
  highlight?: boolean;
  /** Title under the poster, two lines at this size (details footer). */
  captionFs?: number;
  onFocus: () => void;
  onBlur?: () => void;
  onPress: () => void;
  /** Select held (context menu). */
  onLongPress?: () => void;
}

function Placeholder({title}: {title: string}) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
      <Text style={styles.placeholderText} numberOfLines={3}>
        {title}
      </Text>
    </View>
  );
}

// Refs reach the Pressable so rows can move focus explicitly (core/focus).
export const PosterCard = memo(
  forwardRef<View, CardProps>(function PosterCard(p, ref) {
  const [focused, setFocused] = useState(false);
  const poster = (
    <Pressable
      ref={ref}
      hasTVPreferredFocus={p.preferred}
      accessibilityLabel={p.card.title}
      onFocus={() => {
        setFocused(true);
        p.onFocus();
      }}
      onBlur={() => {
        setFocused(false);
        p.onBlur?.();
      }}
      onPress={p.onPress}
      onLongPress={p.onLongPress}
      style={[
        styles.frame,
        {width: p.width, height: p.height},
        (focused || p.highlight) && styles.focused,
      ]}>
      <View style={styles.clip}>
        {p.card.image ? (
          <Image
            source={{uri: posterSrc(p.card.image, Math.round(p.width))}}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <Placeholder title={p.card.title} />
        )}
        {p.card.badge ? <Text style={styles.live}>{p.card.badge}</Text> : null}
        {p.card.lang ? (
          <Text style={[styles.lang, {backgroundColor: p.card.lang.color}]}>{p.card.lang.label}</Text>
        ) : null}
      </View>
    </Pressable>
  );
  if (!p.captionFs) {
    return poster;
  }
  return (
    <View style={{width: p.width}}>
      {poster}
      <Text
        style={[styles.caption2, {fontSize: p.captionFs, lineHeight: p.captionFs * 1.3}, focused && styles.caption2On]}
        numberOfLines={2}>
        {p.card.title}
      </Text>
    </View>
  );
  }),
);

export const LandscapeCard = memo(
  forwardRef<View, CardProps>(function LandscapeCard(p, ref) {
  const [focused, setFocused] = useState(false);
  const c = p.card;
  const fs = p.height / 362; // type scale relative to the 1080p card height
  return (
    <Pressable
      ref={ref}
      hasTVPreferredFocus={p.preferred}
      accessibilityLabel={c.title}
      onFocus={() => {
        setFocused(true);
        p.onFocus();
      }}
      onBlur={() => {
        setFocused(false);
        p.onBlur?.();
      }}
      onPress={p.onPress}
      onLongPress={p.onLongPress}
      style={[
        styles.frame,
        styles.landscapeFrame,
        {width: p.width, height: p.height},
        (focused || p.highlight) && styles.focused,
      ]}>
      <View style={[styles.clip, styles.landscapeClip]}>
        {c.image ? (
          <Image
            source={{uri: posterSrc(c.image, Math.round(p.width))}}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <Placeholder title={c.title} />
        )}
        <View style={styles.caption}>
          <Gradient name="captionFade" direction="toBottom" />
          <View style={[styles.captionBody, c.progress > 0 && styles.captionWithBar]}>
            {c.overline ? (
              <Text style={[styles.overline, {fontSize: 20 * fs}]} numberOfLines={1}>
                {c.overline}
              </Text>
            ) : null}
            <Text style={[styles.cardTitle, {fontSize: 28 * fs}]} numberOfLines={2}>
              {c.title}
            </Text>
            {c.progressLabel ? (
              <Text style={[styles.progressLabel, {fontSize: 20 * fs}]} numberOfLines={1}>
                {c.progressLabel}
              </Text>
            ) : null}
          </View>
          {c.progress > 0 ? (
            <View style={styles.track}>
              <View style={[styles.bar, {width: `${c.progress * 100}%`}]} />
            </View>
          ) : null}
        </View>
        {c.badge ? <Text style={styles.live}>{c.badge}</Text> : null}
        {!c.badge && c.when ? (
          <View style={styles.when}>
            <Icon name="schedule" size={px(14)} color="rgba(255,255,255,0.7)" />
            <Text style={styles.whenText}>{c.when}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
  }),
);

const styles = scaledStyles({
  frame: {borderRadius: 8, borderWidth: 3, borderColor: 'transparent'},
  landscapeFrame: {borderRadius: 10},
  focused: {borderColor: colors.primary, transform: [{scale: 1.07}]},
  clip: {flex: 1, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.surface2},
  landscapeClip: {borderRadius: 8},
  caption2: {color: colors.textMid, marginTop: 8, fontWeight: '500', textAlign: 'center'},
  caption2On: {color: colors.textHigh},
  placeholder: {alignItems: 'center', justifyContent: 'center', padding: 12},
  placeholderText: {color: colors.textLow, fontSize: 20, textAlign: 'center'},
  caption: {position: 'absolute', left: 0, right: 0, bottom: 0},
  captionBody: {paddingHorizontal: 12, paddingTop: 28, paddingBottom: 12},
  captionWithBar: {paddingBottom: 18},
  overline: {color: colors.textMid, fontWeight: '600', letterSpacing: 0.3},
  cardTitle: {color: colors.textHigh, fontWeight: '700'},
  progressLabel: {color: 'rgba(255,255,255,0.7)', fontWeight: '500', marginTop: 3},
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 6,
    backgroundColor: 'rgba(242,242,240,0.22)',
  },
  bar: {height: '100%', backgroundColor: colors.primary},
  live: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(229,57,53,0.9)',
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // live_card.dart _StartBadge: when a scheduled event starts.
  when: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  whenText: {color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.3},
  // poster_card.dart _StatusPill: 10/1080 type, 8 from the corner.
  lang: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
