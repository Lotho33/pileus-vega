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
import {sportAccentColor} from '../details/live';
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

// live_card.dart _LiveBadge (on air) / _StartBadge (when it starts), top right.
function LiveBadges({card}: {card: CardModel}) {
  if (card.badge) {
    return (
      <View style={[styles.badge, styles.liveBadge]}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>{card.badge}</Text>
      </View>
    );
  }
  if (card.when) {
    return (
      <View style={[styles.badge, styles.when]}>
        <Icon name="schedule" size={px(28)} color="rgba(255,255,255,0.7)" />
        <Text style={styles.whenText}>{card.when}</Text>
      </View>
    );
  }
  return null;
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
        {p.card.badge ? <LiveBadges card={p.card} /> : null}
        {p.card.langs?.length ? (
          <View style={styles.langs}>
            {p.card.langs.map(b => (
              <Text key={b.label} style={[styles.langPill, {backgroundColor: b.color}]}>
                {b.label}
              </Text>
            ))}
          </View>
        ) : null}
        {p.card.rel ? (
          <Text style={[styles.relPill, {maxWidth: p.width - px(24)}]} numberOfLines={1} ellipsizeMode="tail">
            {p.card.rel}
          </Text>
        ) : p.card.subtype ? (
          <Text style={[styles.pill, styles.subtype]}>{p.card.subtype}</Text>
        ) : null}
        {p.card.flag ? (
          <View style={styles.flagWrap}>
            <Text style={styles.flag} numberOfLines={1}>
              {p.card.flag}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
  if (!p.captionFs) {
    return poster;
  }
  // Always two lines tall: a one-line title must not change the card's
  // height, or the row's vertical centering shifts that card against its
  // neighbours. The fixed height sits on a wrapper, not on the Text: with
  // the height on the Text itself Vega laid all the lines out and clipped
  // them, so a longer title lost its "…".
  return (
    <View style={{width: p.width}}>
      {poster}
      <View style={[styles.caption2Box, {height: p.captionFs * 1.3 * 2}]}>
        <Text
          style={[styles.caption2, {fontSize: p.captionFs, lineHeight: p.captionFs * 1.3}, focused && styles.caption2On]}
          numberOfLines={2}
          ellipsizeMode="tail">
          {p.card.title}
        </Text>
      </View>
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
        {/* "Nuovo episodio" at the top: the bottom holds title and progress. */}
        {c.flag ? (
          <View style={styles.flagTopWrap}>
            <Text style={[styles.flag, styles.flagTop]} numberOfLines={1}>
              {c.flag}
            </Text>
          </View>
        ) : null}
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
        <LiveBadges card={c} />
      </View>
      {/* continue_watching.dart: the ring is drawn over the picture, which
          keeps filling the whole card. */}
      {on ? <View style={styles.ring} pointerEvents="none" /> : null}
    </Pressable>
  );
  }),
);

/**
 * A live catalog's home card (live_card.dart _LiveCardView): 16:9 picture or
 * a sport-tinted placeholder, bottom fade, title bottom left, a 3-unit
 * accent strip, LIVE / start badge top right; focused: 1.05 and an accent
 * border.
 */
export const LiveCard = memo(
  forwardRef<View, CardProps>(function LiveCard(p, ref) {
    const [focused, setFocused] = useState(false);
    const c = p.card;
    const on = focused || !!p.highlight;
    const accent = sportAccentColor(c.sport ?? '');
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
        style={[{width: p.width, height: p.height}, on && styles.liveOn]}>
        <View style={styles.liveClip}>
          {c.image ? (
            <Image
              source={{uri: posterSrc(c.image, Math.round(p.width), true)}}
              style={{width: p.width, height: p.height}}
              resizeMode="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.livePlaceholder, {backgroundColor: hexA(accent, 0.22)}]}>
              <Icon name="tv" size={px(112)} color="rgba(255,255,255,0.85)" />
            </View>
          )}
          <Gradient name="liveCardFade" direction="toBottom" style={StyleSheet.absoluteFill} />
          <View style={[styles.liveStrip, {backgroundColor: accent}]} />
          <Text style={styles.liveTitle} numberOfLines={2}>
            {c.title}
          </Text>
          <LiveBadges card={c} />
        </View>
        <View
          pointerEvents="none"
          style={[styles.liveRing, {borderColor: on ? hexA(accent, 0.9) : 'transparent'}]}
        />
      </Pressable>
    );
  }),
);

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

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
  caption2Box: {marginTop: 8, overflow: 'hidden'},
  caption2: {color: colors.textMid, fontWeight: '500', textAlign: 'center'},
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
  // live_card.dart (dp of the 540 canvas, ×2): badges 12 from the corner,
  // padding 10/4, radius 6; LIVE 15 w700 on red with an 8 dot.
  badge: {
    position: 'absolute',
    top: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 12,
  },
  liveBadge: {backgroundColor: '#F44336'},
  liveDot: {width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff'},
  liveText: {color: '#fff', fontSize: 30, fontWeight: '700', letterSpacing: 1.6},
  when: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  whenText: {color: '#fff', fontSize: 30, fontWeight: '700', letterSpacing: 0.6},
  // _LiveCardView: radius 12, focus border 2.5 in the accent, scale 1.05,
  // accent strip 3 tall, title 16 from the edges at 22/1080 of the height
  // (clamped 11–30 units) w700.
  liveOn: {transform: [{scale: 1.05}]},
  liveClip: {flex: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: colors.surface2},
  livePlaceholder: {alignItems: 'center', justifyContent: 'center'},
  liveStrip: {position: 'absolute', left: 0, right: 0, bottom: 0, height: 6},
  liveTitle: {
    position: 'absolute',
    left: 32,
    right: 32,
    bottom: 32,
    color: '#fff',
    fontSize: 22,
    lineHeight: 28.6,
    fontWeight: '700',
    textShadowColor: '#000',
    textShadowRadius: 8,
  },
  liveRing: {...StyleSheet.absoluteFillObject, borderRadius: 24, borderWidth: 5},
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
  // Up to 5 language pills stacked under each other, clear of the subtype
  // pill on the left.
  langs: {position: 'absolute', top: 16, right: 16, alignItems: 'flex-end', gap: 6},
  langPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // related_carousel.dart's label: 6 from the corner, padding 7/3, radius 5,
  // type 8.6 on the 540 canvas, accent background (×2 here).
  relPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.primary,
    color: colors.textHigh,
    fontSize: 17.2,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  subtype: {left: 16, backgroundColor: 'rgba(167,139,250,0.9)'},
  // card_badge.dart: a strip at the bottom centre (the top corners hold
  // the type and language pills).
  flagWrap: {position: 'absolute', left: 8, right: 8, bottom: 0, alignItems: 'center'},
  flagTopWrap: {position: 'absolute', left: 8, right: 8, top: 0, alignItems: 'center', zIndex: 1},
  flagTop: {borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: 9, borderBottomRightRadius: 9},
  flag: {
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    overflow: 'hidden',
    backgroundColor: colors.primary,
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
});
