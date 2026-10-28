// Quick look at a title without leaving the page: poster on the left, then
// title, relation label, meta, genres, plot and cast from GetDetails, with
// "Vai ai dettagli" / "Chiudi" at the bottom. Same popup as pileus-player's
// _RelatedDetailsPopup (related row) and _MediaDetailsPopup (card menu).
// ↑/↓ scroll the text; Back closes it.

import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {TVFocusGuideView, useKeplerBackHandler, useTVEventHandler} from '@amazon-devices/react-native-kepler';
import {Icon, IconName} from '../components/Icon';
import {mycelium} from '../core/api';
import {focusSoon} from '../core/focus';
import {posterSrc} from '../core/images';
import {colors, px, scaledStyles} from '../theme';
import {Info, infoOf} from './format';

const SCROLL_STEP = 0.35; // of the visible text height

function ActionButton({
  icon,
  label,
  primary,
  first,
  onPress,
}: {
  icon: IconName;
  label: string;
  primary?: boolean;
  first?: boolean;
  onPress: () => void;
}) {
  const ref = useRef<View>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => (first ? focusSoon(() => ref.current) : undefined), [first]);
  const color = focused ? colors.textHigh : primary ? '#B8A9FF' : colors.textLow;
  return (
    <Pressable
      ref={ref}
      accessibilityLabel={label}
      hasTVPreferredFocus={first}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[styles.action, focused && (primary ? styles.actionPrimaryOn : styles.actionOn)]}>
      <Icon name={icon} size={px(28)} color={color} />
      <Text style={[styles.actionText, {color}]}>{label}</Text>
    </Pressable>
  );
}

export function InfoPopup({
  pluginId,
  mediaId,
  title,
  poster,
  relLabel = '',
  W,
  H,
  onNavigate,
  onClose,
}: {
  pluginId: string;
  mediaId: string;
  title: string;
  poster: string;
  /** "Sequel", "Prequel"… shown as a chip under the title. */
  relLabel?: string;
  W: number;
  H: number;
  /** Opens the full details page ("Vai ai dettagli"). */
  onNavigate?: () => void;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [failed, setFailed] = useState(false);
  const [resolvedPoster, setResolvedPoster] = useState(poster);
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  const viewH = useRef(0);

  useEffect(() => {
    let alive = true;
    mycelium
      .getDetails(pluginId, mediaId)
      .then(r => {
        if (alive) {
          setInfo(infoOf(r));
          if (!poster && r.item?.posterUrl) {
            setResolvedPoster(r.item.posterUrl);
          }
        }
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [pluginId, mediaId, poster]);

  const keplerBack = useKeplerBackHandler();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const sub = keplerBack.addEventListener('hardwareBackPress', () => {
      onCloseRef.current();
      return true;
    });
    return () => sub.remove();
  }, [keplerBack]);

  // Focus sits on the action bar, so ↑/↓ are free to scroll the text.
  useTVEventHandler(evt => {
    if (evt.eventKeyAction === 1 || (evt.eventType !== 'up' && evt.eventType !== 'down')) {
      return;
    }
    const step = Math.max(80, viewH.current * SCROLL_STEP) * (evt.eventType === 'up' ? -1 : 1);
    offset.current = Math.max(0, offset.current + step);
    scroll.current?.scrollTo({y: offset.current, animated: true});
  });

  const u = H / 540;
  const dialogW = Math.min(W - 24 * u, Math.min(1000 * u, Math.max(520 * u, W * 0.6)));
  const dialogH = Math.min(H - 24 * u, Math.min(760 * u, Math.max(420 * u, H * 0.72)));
  const barH = Math.min(74 * u, Math.max(46 * u, H * 0.055));
  const posterW = (dialogH - barH) * (2 / 3);
  const fs = Math.min(22 * u, Math.max(12 * u, H * (15 / 1080)));

  const meta: {icon?: string; text: string; star?: boolean}[] = [];
  if (info) {
    if (info.rating > 0) {
      meta.push({text: info.rating.toFixed(1), star: true});
    }
    for (const t of [info.year > 0 ? String(info.year) : '', info.runtime, info.contentRating, info.status, info.network]) {
      if (t) {
        meta.push({text: t});
      }
    }
  }

  return (
    <View style={styles.scrim}>
      <TVFocusGuideView
        style={[styles.card, {width: dialogW, height: dialogH, borderRadius: 18 * u}]}
        trapFocusLeft
        trapFocusRight
        trapFocusUp
        trapFocusDown>
        <View style={styles.body}>
          <View style={[styles.poster, {width: posterW}]}>
            {resolvedPoster ? (
              <Image
                source={{uri: posterSrc(resolvedPoster, Math.round(posterW))}}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            ) : null}
          </View>
          <View style={[styles.info, {padding: 22 * u}]}>
            <Text
              style={[styles.title, {fontSize: Math.min(56, Math.max(18 * u, H * 0.026)), lineHeight: Math.min(56, Math.max(18 * u, H * 0.026)) * 1.15}]}
              numberOfLines={2}>
              {title}
            </Text>
            {relLabel ? (
              <View style={[styles.chip, {marginTop: 8 * u}]}>
                <Text style={[styles.chipText, {fontSize: fs * 0.87}]}>{relLabel}</Text>
              </View>
            ) : null}
            {!info && !failed ? (
              <ActivityIndicator color={colors.textLow} style={{marginTop: 24 * u}} />
            ) : (
              <ScrollView
                ref={scroll}
                style={{marginTop: 12 * u}}
                scrollEventThrottle={50}
                onLayout={e => (viewH.current = e.nativeEvent.layout.height)}
                onScroll={e => (offset.current = e.nativeEvent.contentOffset.y)}
                showsVerticalScrollIndicator={false}>
                {meta.length ? (
                  <View style={[styles.metaRow, {gap: 10 * u}]}>
                    {meta.map(m => (
                      <Text key={m.text} style={[m.star ? styles.metaHigh : styles.meta, {fontSize: fs}]}>
                        {m.star ? <Text style={styles.star}>★ </Text> : null}
                        {m.text}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {info?.genres.length ? (
                  <View style={[styles.genres, {gap: 6 * u, marginTop: 10 * u}]}>
                    {info.genres.slice(0, 5).map(g => (
                      <View key={g} style={styles.chip}>
                        <Text style={[styles.chipText, {fontSize: fs * 0.8}]}>{g}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {info?.plot ? (
                  <Text style={[styles.plot, {fontSize: fs, lineHeight: fs * 1.6, marginTop: 12 * u}]}>{info.plot}</Text>
                ) : null}
                {info?.cast.length ? (
                  <Text style={[styles.cast, {fontSize: fs * 0.93, lineHeight: fs * 1.4, marginTop: 12 * u}]}>
                    <Text style={styles.castKey}>Cast  </Text>
                    {info.cast.slice(0, 10).join(', ')}
                  </Text>
                ) : null}
                {failed ? (
                  <Text style={[styles.meta, {fontSize: fs, marginTop: 12 * u}]}>Dettagli non disponibili.</Text>
                ) : null}
              </ScrollView>
            )}
          </View>
        </View>
        <View style={[styles.bar, {height: barH}]}>
          {onNavigate ? (
            <>
              <ActionButton icon="info" label="Vai ai dettagli" primary first onPress={onNavigate} />
              <View style={styles.divider} />
            </>
          ) : null}
          <ActionButton icon="close" label="Chiudi" first={!onNavigate} onPress={onClose} />
        </View>
      </TVFocusGuideView>
    </View>
  );
}

const styles = scaledStyles({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {overflow: 'hidden', backgroundColor: '#0E0E1A'},
  body: {flex: 1, flexDirection: 'row'},
  poster: {backgroundColor: '#1A1A2A'},
  info: {flex: 1, backgroundColor: '#13131E'},
  title: {color: colors.textHigh, fontWeight: '800'},
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(124,106,247,0.4)',
    backgroundColor: 'rgba(124,106,247,0.18)',
  },
  chipText: {color: '#B8A9FF', fontWeight: '600'},
  metaRow: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center'},
  meta: {color: colors.textLow},
  metaHigh: {color: colors.textMid},
  star: {color: '#FFD700'},
  genres: {flexDirection: 'row', flexWrap: 'wrap'},
  plot: {color: 'rgba(255,255,255,0.63)'},
  cast: {color: colors.textMid},
  castKey: {color: colors.textLow},
  bar: {flexDirection: 'row', borderTopWidth: 2, borderTopColor: 'rgba(242,242,240,0.07)'},
  divider: {width: 2, backgroundColor: 'rgba(242,242,240,0.07)'},
  action: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16},
  actionOn: {backgroundColor: 'rgba(242,242,240,0.08)'},
  actionPrimaryOn: {backgroundColor: 'rgba(124,106,247,0.25)'},
  actionText: {fontSize: 26, fontWeight: '700'},
});
