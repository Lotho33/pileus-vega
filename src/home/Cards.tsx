// Poster (2:3) and landscape (16:9) cards — focus cue is a primary-colored
// border plus a slight scale, no glow (same as pileus-player's poster_card).
//
// Sizes: pileus-player's TV canvas is 540 units tall, so its plain values
// (radius 8, border 3, badge offset 8…) are twice that in the 1080p pixels
// these sheets are written in; AppScale.space() values are already 1080p.

import React, {forwardRef, memo, useState} from 'react';
import {Image, Pressable, StyleSheet, View} from 'react-native';
import {Text} from '../components/Text';
import {Gradient} from '../components/Gradient';
import {Icon} from '../components/Icon';
import {posterSrc} from '../core/images';
import {colors, px, scaledStyles} from '../theme';
import {FOCUS_SCALE_CARD as FOCUS_SCALE} from './layout';
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
            source={{uri: posterSrc(p.card.image, Math.round(p.width), true)}}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <Placeholder title={p.card.title} />
        )}
        {p.card.badge ? <Text style={styles.live}>{p.card.badge}</Text> : null}
        {p.card.lang ? (
          <Text style={[styles.pill, styles.lang, {backgroundColor: p.card.lang.color}]}>{p.card.lang.label}</Text>
        ) : null}
        {p.card.subtype ? <Text style={[styles.pill, styles.subtype]}>{p.card.subtype}</Text> : null}
      </View>
    </Pressable>
  );
  if (!p.captionFs) {
    return poster;
  }
  // Always two lines tall, clipped: a longer title (numberOfLines isn't
  // always honoured) or a one-line one must not change the card's height,
  // or the row's vertical centering shifts that card against its neighbours.
  return (
    <View style={{width: p.width}}>
      {poster}
      <Text
        style={[
          styles.caption2,
          {fontSize: p.captionFs, lineHeight: p.captionFs * 1.3, height: p.captionFs * 1.3 * 2},
          focused && styles.caption2On,
        ]}
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
  const on = focused || !!p.highlight;
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
        styles.landscapeFrame,
        {width: p.width, height: p.height},
        // Scaled about the bottom edge (Alignment.bottomCenter): the scale
        // works from the middle, so lift the card by half its growth.
        on && {transform: [{translateY: (-p.height * (FOCUS_SCALE - 1)) / 2}, {scale: FOCUS_SCALE}]},
      ]}>
      <View style={styles.landscapeClip}>
        {c.image ? (
          <Image
            source={{uri: posterSrc(c.image, Math.round(p.width), true)}}
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
              <Text style={styles.overline} numberOfLines={1}>
                {c.overline}
              </Text>
            ) : null}
            <Text style={styles.cardTitle} numberOfLines={2}>
              {c.title}
            </Text>
            {c.progressLabel ? (
              <Text style={styles.progressLabel} numberOfLines={1}>
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
      {/* continue_watching.dart: the ring is drawn over the picture, which
          keeps filling the whole card. */}
      {on ? <View style={styles.ring} pointerEvents="none" /> : null}
    </Pressable>
  );
  }),
);

const styles = scaledStyles({
  // poster_card.dart: radius 8, border 3, picture clipped at 6 (×2).
  frame: {borderRadius: 16, borderWidth: 6, borderColor: 'transparent'},
  focused: {borderColor: colors.primary, transform: [{scale: FOCUS_SCALE}]},
  clip: {flex: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface2},
  // continue_watching.dart: radius 10 (×2), the focus scale grows from the
  // bottom edge, so the card rises out of the row instead of spreading
  // over the header above it.
  landscapeFrame: {borderRadius: 20},
  landscapeClip: {flex: 1, borderRadius: 20, overflow: 'hidden', backgroundColor: '#1A1A2A'},
  ring: {...StyleSheet.absoluteFillObject, borderRadius: 20, borderWidth: 6, borderColor: colors.primary},
  caption2: {color: colors.textMid, marginTop: 8, fontWeight: '500', textAlign: 'center', overflow: 'hidden'},
  caption2On: {color: colors.textHigh},
  // _PosterFallback: 12 type, 8 padding (×2).
  placeholder: {alignItems: 'center', justifyContent: 'center', padding: 16},
  placeholderText: {color: colors.textLow, fontSize: 24, textAlign: 'center'},
  caption: {position: 'absolute', left: 0, right: 0, bottom: 0},
  // Padding 8/16/8/10, 8/20/8/14 with a progress bar (×2); type sizes are
  // AppScale.space values, already 1080p.
  captionBody: {paddingHorizontal: 16, paddingTop: 32, paddingBottom: 20},
  captionWithBar: {paddingTop: 40, paddingBottom: 28},
  overline: {color: colors.textMid, fontSize: 11, fontWeight: '600', letterSpacing: 0.3, marginBottom: 4},
  cardTitle: {color: colors.textHigh, fontSize: 16, fontWeight: '700'},
  progressLabel: {color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '500', marginTop: 6},
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 10,
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
  // poster_card.dart _StatusPill: type max(8, 10/1080·h) on the 540 canvas
  // (16 here), padding 6/2 of 1080, radius 4 and 8 from the corner (×2).
  pill: {
    position: 'absolute',
    top: 16,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  lang: {right: 16},
  subtype: {left: 16, backgroundColor: 'rgba(167,139,250,0.9)'},
});
