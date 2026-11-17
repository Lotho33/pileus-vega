// "Dettagli" from a card's long-press menu: pileus-player's
// _MediaDetailsPopup (home_screen/popups.dart). Poster, title, meta chips and
// genres on top, then TRAMA and CAST, and a "Chiudi" bar at the bottom that
// holds focus: ↑/↓ scroll the text, OK and Back close it.
// Sizes are Flutter's, in dp of the 540-tall TV canvas — the same unit as
// dp here, so no px() / scaledStyles.

import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {Text} from '../components/Text';
import {TVFocusGuideView, useKeplerBackHandler, useTVEventHandler} from '@amazon-devices/react-native-kepler';
import {Icon, IconName} from '../components/Icon';
import {mycelium} from '../core/api';
import {focusSoon} from '../core/focus';
import {posterSrc} from '../core/images';
import {colors} from '../theme';
import {Info, infoOf} from './format';

const BG = '#0E0E1A';
const LILAC = '#B8A9FF';
const META = '#9E9EA8';
const SCROLL_STEP = 140;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function MetaChip({icon, label, color = META, fs}: {icon: IconName; label: string; color?: string; fs: number}) {
  return (
    <View style={styles.metaChip}>
      <Icon name={icon} size={fs * 1.08} color={color} />
      <Text style={{color, fontSize: fs, fontWeight: '500', marginLeft: fs * 0.31}}>{label}</Text>
    </View>
  );
}

function CloseBar({onClose}: {onClose: () => void}) {
  const ref = useRef<View>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => focusSoon(() => ref.current), []);
  const color = focused ? LILAC : colors.textLow;
  return (
    <Pressable
      ref={ref}
      accessibilityLabel="Chiudi"
      hasTVPreferredFocus
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onClose}
      style={[styles.bar, focused && styles.barOn]}>
      <Icon name="close" size={8} color={color} />
      <Text style={[styles.barText, {color}]}>CHIUDI</Text>
      <View style={styles.key}>
        <Text style={styles.keyText}>↑↓ scorri</Text>
      </View>
    </Pressable>
  );
}

function Section({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function MediaInfoPopup({
  pluginId,
  mediaId,
  title,
  poster,
  rating = 0,
  year = 0,
  plot = '',
  W,
  H,
  onClose,
}: {
  pluginId: string;
  mediaId: string;
  title: string;
  poster: string;
  /** The card's own values, shown until GetDetails answers (and kept when it has none). */
  rating?: number;
  year?: number;
  plot?: string;
  W: number;
  H: number;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState(false);
  const [headH, setHeadH] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);

  useEffect(() => {
    let alive = true;
    mycelium
      .getDetails(pluginId, mediaId)
      .then(r => alive && setInfo(infoOf(r)))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [pluginId, mediaId]);

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

  useTVEventHandler(evt => {
    if (evt.eventKeyAction === 1 || (evt.eventType !== 'up' && evt.eventType !== 'down')) {
      return;
    }
    offset.current = Math.max(0, offset.current + SCROLL_STEP * (evt.eventType === 'up' ? -1 : 1));
    scroll.current?.scrollTo({y: offset.current, animated: true});
  });

  const k = H / 1080;
  const posterW = clamp(H * (140 / 1080), 100, 360);
  const metaFs = clamp(H * (13 / 1080), 10, 32);
  const shownYear = info?.year || year;
  const shownRating = info?.rating || rating;
  const shownPlot = info?.plot || plot;

  const meta: {icon: IconName; label: string; color?: string}[] = [];
  if (shownYear > 0) {
    meta.push({icon: 'calendar', label: String(shownYear)});
  }
  if (shownRating > 0) {
    meta.push({icon: 'star', label: shownRating.toFixed(1), color: '#FFB300'});
  }
  if (info?.contentRating) {
    meta.push({icon: 'shield', label: info.contentRating});
  }
  if (info?.runtime) {
    meta.push({icon: 'timer', label: info.runtime});
  }
  if (info?.status) {
    meta.push({icon: 'info', label: info.status});
  }
  if (info?.network) {
    meta.push({icon: 'tv', label: info.network});
  }

  const loading = !info && !error;
  return (
    <View style={styles.scrim}>
      <TVFocusGuideView
        style={[
          styles.card,
          {width: W - 2 * W * (60 / 1920), maxHeight: H - 2 * H * (40 / 1080)},
        ]}
        trapFocusLeft
        trapFocusRight
        trapFocusUp
        trapFocusDown>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.loading}>
            <Text style={styles.error}>Dettagli non disponibili.</Text>
          </View>
        ) : (
          <ScrollView
            ref={scroll}
            style={styles.flexible}
            scrollEventThrottle={50}
            onScroll={e => (offset.current = e.nativeEvent.contentOffset.y)}
            showsVerticalScrollIndicator={false}>
            <View
              style={[styles.header, poster ? {minHeight: posterW * 1.5} : null]}
              onLayout={e => setHeadH(e.nativeEvent.layout.height)}>
              {poster ? (
                <View style={[styles.poster, {width: posterW}]}>
                  {headH > 0 ? (
                    <Image
                      source={{uri: posterSrc(poster, Math.round(posterW), true)}}
                      style={{width: posterW, height: headH}}
                      resizeMode="cover"
                    />
                  ) : null}
                </View>
              ) : null}
              <View style={[styles.headInfo, {padding: 24 * k, paddingBottom: 20 * k}]}>
                <Text style={[styles.title, {fontSize: clamp(H * (22 / 1080), 14, 52)}]}>{title}</Text>
                {meta.length ? (
                  <View style={[styles.wrap, {marginTop: 10 * k, columnGap: 12 * k, rowGap: 6 * k}]}>
                    {meta.map(m => (
                      <MetaChip key={m.icon} icon={m.icon} label={m.label} color={m.color} fs={metaFs} />
                    ))}
                  </View>
                ) : null}
                {info?.genres.length ? (
                  <View style={[styles.wrap, {marginTop: 10 * k, gap: 6 * k}]}>
                    {info.genres.map(g => (
                      <View key={g} style={[styles.genre, {paddingHorizontal: 10 * k, paddingVertical: 3 * k}]}>
                        <Text style={[styles.genreText, {fontSize: clamp(H * (12 / 1080), 9, 30)}]}>{g}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
            {shownPlot ? (
              <Section title="TRAMA">
                <Text
                  style={[
                    styles.plot,
                    {fontSize: clamp(H * (15 / 1080), 11, 36), lineHeight: clamp(H * (15 / 1080), 11, 36) * 1.65},
                  ]}>
                  {shownPlot}
                </Text>
              </Section>
            ) : null}
            {info?.cast.length ? (
              <Section title="CAST">
                <Text
                  style={[
                    styles.cast,
                    {fontSize: clamp(H * (14 / 1080), 10, 34), lineHeight: clamp(H * (14 / 1080), 10, 34) * 1.5},
                  ]}>
                  {info.cast.slice(0, 10).join(', ')}
                </Text>
              </Section>
            ) : null}
            <View style={{height: 24 * k}} />
          </ScrollView>
        )}
        {loading ? null : <CloseBar onClose={onClose} />}
      </TVFocusGuideView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.54)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {borderRadius: 18, overflow: 'hidden', backgroundColor: BG},
  loading: {height: 200, alignItems: 'center', justifyContent: 'center'},
  error: {color: '#E57373', fontSize: 11},
  flexible: {flexGrow: 0, flexShrink: 1},
  header: {flexDirection: 'row', alignItems: 'stretch'},
  poster: {backgroundColor: '#1A1A2A'},
  headInfo: {flex: 1, backgroundColor: '#13131E'},
  title: {color: colors.textHigh, fontWeight: '800', lineHeight: undefined},
  wrap: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center'},
  metaChip: {flexDirection: 'row', alignItems: 'center'},
  genre: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(124,106,247,0.4)',
    backgroundColor: 'rgba(124,106,247,0.18)',
  },
  genreText: {color: LILAC, fontWeight: '500'},
  section: {paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2},
  sectionTitle: {color: colors.textLow, fontSize: 8, fontWeight: '700', letterSpacing: 1.5, marginBottom: 5},
  plot: {color: 'rgba(255,255,255,0.8)'},
  cast: {color: 'rgba(255,255,255,0.7)'},
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: 'rgba(242,242,240,0.08)',
  },
  barOn: {backgroundColor: 'rgba(124,106,247,0.15)'},
  barText: {fontSize: 6.5, fontWeight: '700', letterSpacing: 1.5, marginLeft: 10},
  key: {
    marginLeft: 24,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(242,242,240,0.18)',
  },
  keyText: {color: colors.textLow, fontSize: 5.5, fontWeight: '600'},
});
