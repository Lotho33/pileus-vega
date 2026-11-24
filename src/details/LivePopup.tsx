// Live event popup (shared/widgets/live_event_popup.dart): hero image or the
// two team badges, sport chip, IN DIRETTA / start time, title, and the list
// of SORGENTI (the first one marked MIGLIORE). Picking one opens the player
// with every source, so it can switch without coming back here.
//
// Sizes follow the Flutter popup: AppScale.space values scale with the
// height (k = H/1080), plain logical values are Flutter dp, two pixels each
// on a 1080p Fire TV (u = H/540).

import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View} from 'react-native';
import {Text} from '../components/Text';
import {TVFocusGuideView, useKeplerBackHandler} from '@amazon-devices/react-native-kepler';
import {Bands, Gradient} from '../components/Gradient';
import {Icon} from '../components/Icon';
import {focusSoon} from '../core/focus';
import {backdropSrc} from '../core/images';
import type {CatalogItem, StreamSource} from '../gen/media';
import {colors, scaledStyles} from '../theme';
import {isLiveNow, livePlotWithoutStatus, liveStartAt, liveStartTimeLabel, liveWhenLabel, sportAccentColor} from './live';
import {useSources} from './Sources';

function SourceRow({
  src,
  best,
  accent,
  first,
  k,
  u,
  onPress,
}: {
  src: StreamSource;
  best: boolean;
  accent: string;
  first: boolean;
  k: number;
  u: number;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<View>(null);
  useEffect(() => (first ? focusSoon(() => ref.current) : undefined), [first]);
  return (
    <Pressable
      ref={ref}
      accessibilityLabel={src.label}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[
        styles.row,
        {paddingHorizontal: 14 * u, paddingVertical: 11 * u, marginBottom: 7 * u, gap: 10 * u, borderRadius: 10 * u},
        focused ? {backgroundColor: `${accent}38`, borderColor: `${accent}A6`} : null,
      ]}>
      <Icon name="play" size={20 * k} color={focused ? '#fff' : 'rgba(255,255,255,0.54)'} />
      <Text style={[styles.rowText, {fontSize: 14 * k}, focused && styles.rowTextOn]} numberOfLines={1}>
        {src.label || 'Sorgente'}
      </Text>
      {best ? (
        <View style={[styles.best, {backgroundColor: `${accent}40`, paddingHorizontal: 6 * u, paddingVertical: 2 * u}]}>
          <Text style={[styles.bestText, {fontSize: 9 * k}]}>MIGLIORE</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function LivePopup({
  pluginId,
  item,
  onPlay,
  onClose,
}: {
  pluginId: string;
  item: CatalogItem;
  onPlay: (src: StreamSource, all: StreamSource[]) => void;
  onClose: () => void;
}) {
  const keplerBack = useKeplerBackHandler();
  const {height: H} = useWindowDimensions();
  const k = H / 1080;
  const u = H / 540;
  const width = 620 * k;
  const sources = useSources(pluginId, item.id);
  const closeRef = useRef<View>(null);
  const [closeFocused, setCloseFocused] = useState(false);
  const e = item.extra ?? {};
  const live = isLiveNow(e);
  // "Tra 25 min" / "Domani alle 15:00" when the full date is known, else
  // the bare time (live_event_popup.dart).
  const startAt = live ? null : liveStartAt(e);
  const hm = live ? null : liveStartTimeLabel(e);
  const start = startAt ? liveWhenLabel(startAt) : hm ? `Inizio ${hm}` : null;
  const plot = livePlotWithoutStatus(e.plot ?? '', !!start);
  const sport = e.sport_cat ?? '';
  const accent = sportAccentColor(sport);
  const home = e.home_badge_url ?? '';
  const away = e.away_badge_url ?? '';

  useEffect(() => {
    const sub = keplerBack.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [keplerBack, onClose]);

  useEffect(() => {
    if (!sources.loading && (!sources.sources.length || sources.error)) {
      return focusSoon(() => closeRef.current);
    }
  }, [sources.loading, sources.sources.length, sources.error]);

  return (
    <View style={styles.scrim}>
      <TVFocusGuideView
        style={[styles.card, {width, maxHeight: H - 96 * k, borderRadius: 14 * u, borderColor: `${accent}4D`}]}
        trapFocusLeft
        trapFocusRight
        trapFocusUp
        trapFocusDown>
        {/* live_event_popup.dart _HeroArea: accent .35 fading into #111, the
            poster (else the two team badges), an 80-unit fade into the body. */}
        <View style={[styles.hero, {height: (width * 9) / 16}]}>
          <Bands
            stops={[
              {offset: 0, color: accent, opacity: 0.35},
              {offset: 1, color: accent, opacity: 0},
            ]}
            direction="toBottom"
            style={StyleSheet.absoluteFill}
          />
          {item.posterUrl ? (
            <Image
              source={{uri: backdropSrc(item.posterUrl, width, true)}}
              style={{position: 'absolute', top: 0, left: 0, width, height: (width * 9) / 16}}
              resizeMode="cover"
            />
          ) : home && away ? (
            <View style={[styles.badges, {gap: 24 * u}]}>
              <Image source={{uri: home}} style={{width: 90 * k, height: 90 * k}} resizeMode="contain" />
              <Text style={[styles.vs, {fontSize: 18 * k}]}>vs</Text>
              <Image source={{uri: away}} style={{width: 90 * k, height: 90 * k}} resizeMode="contain" />
            </View>
          ) : null}
          <View style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 80 * u}} pointerEvents="none">
            <Gradient name="liveHeroFade" direction="toBottom" />
          </View>
          <Pressable
            ref={closeRef}
            accessibilityLabel="Chiudi"
            onFocus={() => setCloseFocused(true)}
            onBlur={() => setCloseFocused(false)}
            onPress={onClose}
            style={[
              styles.close,
              {top: 8 * u, right: 8 * u, width: 34 * u, height: 34 * u, borderRadius: 17 * u},
              closeFocused && styles.closeFocused,
            ]}>
            <Icon name="close" size={18 * k} color="#fff" />
          </Pressable>
        </View>
        <View style={{paddingHorizontal: 20 * u, paddingTop: 14 * u, paddingBottom: 20 * u}}>
          <View style={[styles.chips, {gap: 10 * u}]}>
            {sport ? (
              <View
                style={[
                  styles.sport,
                  {paddingHorizontal: 8 * u, paddingVertical: 3 * u, borderRadius: 6 * u},
                  {backgroundColor: `${accent}2E`, borderColor: `${accent}73`},
                ]}>
                <Text style={[styles.sportText, {fontSize: 10 * k, color: accent}]}>
                  {sport.toUpperCase().replace(/-/g, ' ')}
                </Text>
              </View>
            ) : null}
            {live ? (
              <View style={[styles.liveChip, {gap: 5 * u}]}>
                <View style={[styles.dot, {width: 7 * u, height: 7 * u, borderRadius: 3.5 * u}]} />
                <Text style={[styles.liveText, {fontSize: 11 * k}]}>IN DIRETTA</Text>
              </View>
            ) : start ? (
              <Text style={[styles.start, {fontSize: 11 * k}]}>{start}</Text>
            ) : null}
          </View>
          <Text style={[styles.title, {fontSize: 20 * k, lineHeight: 24 * k, marginTop: 8 * u}]} numberOfLines={2}>
            {item.title}
          </Text>
          {plot && !live ? (
            <Text style={[styles.plot, {fontSize: 13 * k, lineHeight: 13 * k * 1.4, marginTop: 6 * u}]} numberOfLines={2}>
              {plot}
            </Text>
          ) : null}
          <View style={{marginTop: 16 * u}}>
            {sources.loading ? (
              <View style={[styles.loading, {gap: 10 * u}]}>
                <ActivityIndicator color={colors.textLow} />
                <Text style={[styles.note, {fontSize: 13 * k}]}>Caricamento sorgenti...</Text>
              </View>
            ) : sources.error ? (
              <View>
                <Text style={[styles.note, {fontSize: 13 * k}]}>Errore: {sources.error}</Text>
                <SourceRow
                  src={{id: '', label: 'Riprova', quality: '', isLive: false, path: []}}
                  best={false}
                  accent={accent}
                  first={false}
                  k={k}
                  u={u}
                  onPress={sources.reload}
                />
              </View>
            ) : !sources.sources.length ? (
              <Text style={[styles.note, {fontSize: 13 * k}]}>Nessuna sorgente disponibile</Text>
            ) : (
              <>
                <Text style={[styles.header, {fontSize: 10 * k, marginBottom: 8 * u}]}>SORGENTI</Text>
                <ScrollView style={{maxHeight: 5 * (14 * k * 1.3 + 22 * u + 7 * u)}}>
                  {sources.sources.map((src, i) => (
                    <SourceRow
                      key={src.id}
                      src={src}
                      best={i === 0}
                      accent={accent}
                      first={i === 0}
                      k={k}
                      u={u}
                      onPress={() => onPlay(src, sources.sources)}
                    />
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </TVFocusGuideView>
    </View>
  );
}

const styles = scaledStyles({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {borderWidth: 1, overflow: 'hidden', backgroundColor: '#0E0E0E'},
  hero: {alignItems: 'center', justifyContent: 'center', backgroundColor: '#111111'},
  badges: {flexDirection: 'row', alignItems: 'center'},
  vs: {color: 'rgba(255,255,255,0.7)', fontWeight: '700'},
  close: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    // _CloseButton: white24 ring on black .55; focused white70 on white .25.
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  closeFocused: {borderColor: 'rgba(255,255,255,0.7)', backgroundColor: 'rgba(255,255,255,0.25)'},
  chips: {flexDirection: 'row', alignItems: 'center'},
  sport: {borderWidth: 1},
  sportText: {fontWeight: '700', letterSpacing: 1},
  liveChip: {flexDirection: 'row', alignItems: 'center'},
  dot: {backgroundColor: '#E53935'},
  liveText: {color: '#E53935', fontWeight: '800', letterSpacing: 1},
  start: {color: colors.textMid, fontWeight: '600'},
  title: {color: '#fff', fontWeight: '700'},
  plot: {color: 'rgba(255,255,255,0.54)'},
  header: {color: 'rgba(255,255,255,0.38)', letterSpacing: 1.5},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  rowText: {flex: 1, color: 'rgba(255,255,255,0.7)'},
  rowTextOn: {color: '#fff', fontWeight: '600'},
  best: {borderRadius: 5},
  bestText: {color: 'rgba(255,255,255,0.6)', letterSpacing: 1},
  loading: {flexDirection: 'row', alignItems: 'center'},
  note: {color: 'rgba(255,255,255,0.38)', marginBottom: 8},
});
