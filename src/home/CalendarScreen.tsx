// "Calendario" page (calendar_screen.dart): what comes out in the next
// CALENDAR_DAYS days, every plugin together like La mia lista, grouped by
// day. "Solo le mie" asks the server for the followed series only; a plugin
// chip filters what came back. OK on a row opens its title (an episode: its
// series), a "Previsto" one too.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Image, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {Text} from '../components/Text';
import {TVFocusGuideView, useKeplerBackHandler} from '@amazon-devices/react-native-kepler';
import {FocusButton} from '../components/FocusButton';
import {FilterChip, PluginChips} from '../components/FilterChip';
import {Icon} from '../components/Icon';
import {mycelium} from '../core/api';
import {
  calendarDayLabel,
  calendarLandscapeThumb,
  calendarLiveNow,
  calendarOpenTarget,
  readCalendarFilters,
  saveCalendarFilters,
  calendarRange,
  calendarReleaseTime,
  calendarSubtitle,
  calendarThumbUrl,
  calendarTimeLabel,
  calendarTitle,
  groupCalendar,
} from '../core/calendar';
import {focusSoon} from '../core/focus';
import {GrpcError, GrpcStatus} from '../core/grpcWeb';
import {posterSrc} from '../core/images';
import {languageBadges} from '../core/language';
import * as perf from '../core/perf';
import {pluginChoices} from '../core/pluginFilter';
import {SquareBackButton} from '../components/SquareBackButton';
import type {CalendarEntry, CalendarResponse} from '../gen/media';
import {errorText} from '../state/auth';
import {colors, scaledStyles} from '../theme';
import type {HomeLayout} from './layout';
import {CardModel, catalogCard} from './model';
import {Spinner} from '../components/Spinner';

const H_PAD = 48 / 1920;
const V_PAD = 28 / 1080;

export function CalendarScreen({
  L,
  covered,
  pluginNames,
  pluginOrder,
  hiddenPlugins,
  onClose,
  onOpenItem,
  onNotice,
}: {
  L: HomeLayout;
  /** A page or popup is on top: Back and focus belong to it. */
  covered: boolean;
  /** plugin id → its name, for the chips and the rows. */
  pluginNames: Record<string, string>;
  /** The side menu's plugins, in its order. */
  pluginOrder: string[];
  /** Hidden from the side menu: hidden here too. */
  hiddenPlugins: Set<string>;
  onClose: () => void;
  onOpenItem: (card: CardModel) => void;
  /** A short message (the toast): what a "Previsto" row says on OK. */
  onNotice: (text: string) => void;
}) {
  useEffect(() => perf.enterScreen('calendar'), []);
  const {W, H} = L;
  const s = H / 1080;
  const keplerBack = useKeplerBackHandler();
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [followedOnly, setFollowedOnly] = useState(false);
  const [chosen, setPlugin] = useState('');
  // Hidden from the side menu since it was chosen: "Tutti".
  const plugin = hiddenPlugins.has(chosen) ? '' : chosen;
  // The filters are remembered per profile; nothing loads before they're read.
  const [ready, setReady] = useState(false);
  const profileId = mycelium.creds.profileId;
  useEffect(() => {
    let alive = true;
    readCalendarFilters(profileId).then(f => {
      if (alive) {
        setFollowedOnly(f.followedOnly);
        setPlugin(f.plugin);
        setReady(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [profileId]);
  useEffect(() => {
    if (ready) {
      saveCalendarFilters(profileId, {followedOnly, plugin});
    }
  }, [ready, profileId, followedOnly, plugin]);

  // Every plugin the calendar has had something from on this page, both
  // filters: "Solo le mie" keeps the plugin choice of "Tutti" (a long
  // watchlist needs it as much).
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const everyAsked = useRef(false);
  const addSeen = useCallback((r: CalendarResponse) => {
    setSeen(prev => {
      const next = new Set(prev);
      r.entries.forEach(e => next.add(e.pluginId));
      return next.size === prev.size ? prev : next;
    });
  }, []);
  const load = useCallback(
    async (followed: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const {from, to} = calendarRange();
        const r = await mycelium.getCalendar(from, to, followed);
        setData(r);
        addSeen(r);
        // Opened on "Solo le mie": which plugins the whole calendar has, for
        // the choice (the server keeps it cached; quiet on failure).
        if (followed && !everyAsked.current) {
          everyAsked.current = true;
          mycelium.getCalendar(from, to, false).then(addSeen, () => {});
        }
      } catch (e) {
        setError(e);
      } finally {
        setLoading(false);
      }
    },
    [addSeen],
  );
  useEffect(() => {
    if (ready) {
      load(followedOnly);
    }
  }, [load, followedOnly, ready]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const sub = keplerBack.addEventListener('hardwareBackPress', () => {
      if (covered) {
        return false;
      }
      onCloseRef.current();
      return true;
    });
    return () => sub.remove();
  }, [covered, keplerBack]);

  const name = (id: string) => pluginNames[id] || id;
  const all = useMemo(() => (data?.entries ?? []).filter(e => !hiddenPlugins.has(e.pluginId)), [data, hiddenPlugins]);
  // In the side menu's order; the remembered plugin stays a choice even
  // when nothing of it came back.
  const choices = useMemo(
    () => pluginChoices(seen, pluginOrder, hiddenPlugins, plugin),
    [seen, pluginOrder, hiddenPlugins, plugin],
  );
  const days = useMemo(() => groupCalendar(all.filter(e => !plugin || e.pluginId === plugin)), [all, plugin]);
  const failed = data?.failedPlugins ?? [];

  // Focus: the first row once loaded, and back on it when a page on top
  // closes; with nothing to show, "Solo le mie" (or Back).
  const firstRow = useRef<View>(null);
  const mineRef = useRef<View>(null);
  const [token, setToken] = useState(0);
  const wasCovered = useRef(covered);
  useEffect(() => {
    if (wasCovered.current && !covered) {
      setToken(t => t + 1);
    }
    wasCovered.current = covered;
  }, [covered]);
  const hasRows = days.length > 0;
  useEffect(
    () => (loading || covered ? undefined : focusSoon(() => (hasRows ? firstRow.current : mineRef.current))),
    [loading, covered, hasRows, token, plugin],
  );

  const open = (e: CalendarEntry) => {
    const target = calendarOpenTarget(e);
    if (target) {
      onOpenItem(catalogCard(e.pluginId, target, 'poster'));
      return;
    }
    const day = calendarReleaseTime(e);
    const time = calendarTimeLabel(e);
    onNotice(
      day
        ? `Previsto ${calendarDayLabel(day).toLowerCase()}${time ? ` alle ${time}` : ''}: non ancora disponibile`
        : 'Non ancora disponibile',
    );
  };

  const hPad = W * H_PAD;
  const vPad = H * V_PAD;
  const old = error instanceof GrpcError && error.code === GrpcStatus.UNIMPLEMENTED;
  let first = true;
  const now = new Date();

  return (
    <TVFocusGuideView style={styles.root} trapFocusLeft trapFocusRight trapFocusUp trapFocusDown>
      <View style={[styles.header, {paddingHorizontal: hPad, paddingTop: vPad}]}>
        <SquareBackButton s={s} onPress={onClose} />
        <Text style={[styles.heading, {fontSize: H * 0.026, marginLeft: W * 0.01}]} numberOfLines={1}>
          Calendario
        </Text>
      </View>
      <View style={[styles.chips, {paddingHorizontal: hPad, marginTop: 16 * s, marginBottom: 8 * s}]}>
        <FilterChip
          ref={mineRef}
          s={s}
          label="Solo le mie"
          icon={followedOnly ? 'check' : undefined}
          selected={followedOnly}
          onPress={() => setFollowedOnly(f => !f)}
        />
        {choices.length > 1 || plugin ? (
          <>
            <View style={{width: 20 * s}} />
            <PluginChips s={s} plugin={plugin} choices={choices} name={name} onPlugin={setPlugin} />
          </>
        ) : null}
      </View>
      {loading && !data ? (
        <View style={styles.center}>
          <Spinner />
        </View>
      ) : error && !data ? (
        <View style={styles.center}>
          <Text style={styles.message}>
            {old ? 'Questo server non ha ancora il calendario delle uscite.' : errorText(error)}
          </Text>
          {old ? null : (
            <View style={styles.actions}>
              <FocusButton label="Riprova" onPress={() => load(followedOnly)} />
            </View>
          )}
        </View>
      ) : !hasRows ? (
        <View style={styles.center}>
          <Text style={styles.message}>
            {followedOnly ? 'Nessuna uscita in arrivo per le serie che segui.' : 'Nessuna uscita nei prossimi giorni.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{paddingHorizontal: hPad, paddingBottom: 40 * s}}>
          {days.map(d => (
            <View key={d.day.getTime()}>
              <Text style={[styles.day, {fontSize: 28 * s, marginTop: 20 * s, marginBottom: 10 * s}]}>
                {calendarDayLabel(d.day, now)}
              </Text>
              {d.entries.map((e, i) => {
                const ref = first ? firstRow : undefined;
                first = false;
                return (
                  <Row
                    key={`${e.pluginId}:${e.item?.id ?? i}:${e.releaseAt}`}
                    ref={ref}
                    s={s}
                    entry={e}
                    pluginName={!plugin && choices.length > 1 ? name(e.pluginId) : ''}
                    onPress={() => open(e)}
                  />
                );
              })}
            </View>
          ))}
          {failed.length ? (
            <Text style={[styles.failed, {fontSize: 20 * s, marginTop: 24 * s}]}>
              Non hanno risposto: {failed.map(name).join(', ')}.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </TVFocusGuideView>
  );
}

const Row = React.forwardRef<View, {s: number; entry: CalendarEntry; pluginName: string; onPress: () => void}>(
  function Row({s, entry: e, pluginName, onPress}, ref) {
    const [focused, setFocused] = useState(false);
    // An episode's still is landscape; a film's poster portrait.
    const thumbH = 96 * s;
    const thumbW = calendarLandscapeThumb(e) ? (thumbH * 16) / 9 : (thumbH * 2) / 3;
    const liveNow = calendarLiveNow(e);
    const dim = !e.available && !liveNow;
    const time = calendarTimeLabel(e);
    // No announced hour: "In giornata" at the head of the small line,
    // "--:--" where the hour would stand.
    const sub = [time ? '' : 'In giornata', calendarSubtitle(e), pluginName].filter(Boolean).join('  ·  ');
    const poster = calendarThumbUrl(e);
    return (
      <Pressable
        ref={ref}
        accessibilityLabel={calendarTitle(e)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPress={onPress}
        style={[
          styles.row,
          {padding: 10 * s, borderRadius: 12 * s, marginBottom: 10 * s},
          focused && styles.rowFocused,
        ]}>
        {/* No announced hour: "--:--", dimmed, in the hour's place. */}
        <Text style={[styles.time, !time && styles.noTime, {width: 110 * s, fontSize: 24 * s}]} numberOfLines={1}>
          {time || '--:--'}
        </Text>
        <View style={[styles.thumb, {width: thumbW, height: thumbH, borderRadius: 8 * s}]}>
          {poster ? (
            <Image
              source={{uri: posterSrc(poster, Math.round(thumbW), true)}}
              style={[StyleSheet.absoluteFill, dim && styles.dim]}
              resizeMode="cover"
            />
          ) : null}
        </View>
        <View style={[styles.text, {marginLeft: 18 * s}]}>
          <View style={styles.titleRow}>
            {e.followed ? <Icon name="bookmark" size={24 * s} color={colors.primary} /> : null}
            <Text style={[styles.title, {fontSize: 26 * s}]} numberOfLines={1}>
              {calendarTitle(e)}
            </Text>
            {/* Which version comes out: sub and dub of the same title are
                separate releases (often minutes or episodes apart). */}
            {languageBadges(e.item?.extra?.lang).map(b => (
              <Text
                key={b.label}
                style={[
                  styles.langPill,
                  {
                    backgroundColor: b.color,
                    fontSize: 16 * s,
                    paddingHorizontal: 10 * s,
                    paddingVertical: 3 * s,
                    borderRadius: 6 * s,
                    marginLeft: 4 * s,
                  },
                ]}>
                {b.label}
              </Text>
            ))}
          </View>
          {sub ? (
            <Text style={[styles.sub, {fontSize: 21 * s, marginTop: 4 * s}]} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
        {dim || liveNow ? (
          // On air: "In diretta" in the live cards' red, where "Previsto" goes.
          <Text
            style={[
              styles.previsto,
              liveNow && styles.onAir,
              {fontSize: 19 * s, paddingHorizontal: 14 * s, paddingVertical: 6 * s, borderRadius: 20 * s},
            ]}>
            {liveNow ? 'In diretta' : 'Previsto'}
          </Text>
        ) : null}
      </Pressable>
    );
  },
);

const styles = scaledStyles({
  root: {...StyleSheet.absoluteFillObject, backgroundColor: colors.bg},
  header: {flexDirection: 'row', alignItems: 'center'},
  heading: {flex: 1, color: '#fff', fontWeight: '700'},
  chips: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap'},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 64},
  message: {color: colors.textMid, fontSize: 24, textAlign: 'center', maxWidth: 1100},
  actions: {flexDirection: 'row', gap: 24, marginTop: 40},
  day: {color: colors.textHigh, fontWeight: '700'},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rowFocused: {backgroundColor: 'rgba(255,255,255,0.10)', borderColor: colors.primary},
  time: {color: colors.textMid, fontWeight: '600', textAlign: 'center'},
  noTime: {color: colors.textLow},
  thumb: {overflow: 'hidden', backgroundColor: colors.surface2},
  dim: {opacity: 0.55},
  text: {flex: 1},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  title: {flexShrink: 1, color: colors.textHigh, fontWeight: '700'},
  sub: {color: colors.textMid},
  previsto: {
    marginLeft: 12,
    color: colors.textMid,
    borderWidth: 1,
    borderColor: colors.textLow,
    overflow: 'hidden',
  },
  onAir: {color: '#fff', fontWeight: '700', backgroundColor: 'red', borderColor: 'red'},
  langPill: {color: '#fff', fontWeight: '700', overflow: 'hidden'},
  failed: {color: colors.textLow},
});
