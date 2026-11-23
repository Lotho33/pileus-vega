// The player's info panel (player_info_panel.dart): a translucent column on
// the right with what is known about the title playing — the video keeps
// playing beside it. ↑/↓ scroll, OK closes; Back is the player's (it closes
// the panel first).

import React, {useEffect, useRef, useState} from 'react';
import {ScrollView, useWindowDimensions, View} from 'react-native';
import {useTVEventHandler} from '@amazon-devices/react-native-kepler';
import {Text} from '../components/Text';
import {colors, scaledStyles} from '../theme';
import type {PlayerInfo} from './playerInfo';

export function InfoPanel({
  base,
  details,
  onClose,
}: {
  base: PlayerInfo;
  details: Promise<PlayerInfo> | null;
  onClose: () => void;
}) {
  const [info, setInfo] = useState(base);
  const [loading, setLoading] = useState(!!details);
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  const {width, height} = useWindowDimensions();

  useEffect(() => {
    let alive = true;
    setInfo(base);
    setLoading(!!details);
    details
      ?.then(full => alive && setInfo(full))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [base, details]);

  useTVEventHandler(evt => {
    if (evt.eventKeyAction === 1) {
      return;
    }
    const t = evt.eventType;
    if (t === 'down' || t === 'up') {
      offset.current = Math.max(0, offset.current + (t === 'down' ? 1 : -1) * height * 0.12);
      scroll.current?.scrollTo({y: offset.current, animated: true});
    } else if (t === 'select' || t === 'info' || t === 'menu') {
      onClose();
    }
  });

  return (
    <View style={[styles.panel, {width: width * 0.38}]} pointerEvents="box-none">
      <ScrollView
        ref={scroll}
        focusable={false}
        onScroll={e => {
          offset.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={64}
        contentContainerStyle={styles.content}>
        {info.overline ? <Text style={styles.overline}>{info.overline}</Text> : null}
        {info.badge ? <Text style={styles.badge}>{info.badge}</Text> : null}
        <Text style={styles.title}>{info.title}</Text>
        {info.facts.length ? (
          <View style={styles.facts}>
            {info.facts.map(f => (
              <Text key={f} style={styles.chip}>
                {f}
              </Text>
            ))}
          </View>
        ) : null}
        {info.genres.length ? <Text style={styles.genres}>{info.genres.join(' · ')}</Text> : null}
        {info.plot ? <Text style={styles.plot}>{info.plot}</Text> : null}
        {info.rows.map(([label, value]) => (
          <Text key={label} style={styles.row}>
            <Text style={styles.rowLabel}>{label} </Text>
            {value}
          </Text>
        ))}
        {loading ? <Text style={styles.hint}>Carico altri dettagli…</Text> : null}
        <Text style={styles.hint}>↑↓ scorri · OK o Indietro per chiudere</Text>
      </ScrollView>
    </View>
  );
}

// Sizes in 1080p pixels, as the TV player's controls (player_info_panel.dart).
const styles = scaledStyles({
  panel: {position: 'absolute', top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(13,13,26,0.92)'},
  content: {padding: 48, paddingBottom: 72},
  overline: {color: colors.textMid, fontSize: 24, fontWeight: '600'},
  badge: {color: colors.primary, fontSize: 24, fontWeight: '700', marginTop: 8},
  title: {color: colors.textHigh, fontSize: 40, fontWeight: '800', marginTop: 8, lineHeight: 46},
  facts: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18},
  chip: {
    color: colors.textHigh,
    fontSize: 22,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  genres: {color: colors.textMid, fontSize: 22, marginTop: 16},
  plot: {color: 'rgba(242,242,240,0.9)', fontSize: 24, lineHeight: 35, marginTop: 24},
  row: {color: colors.textHigh, fontSize: 22, lineHeight: 30, marginTop: 14},
  rowLabel: {color: colors.textLow},
  hint: {color: colors.textLow, fontSize: 20, marginTop: 24},
});
