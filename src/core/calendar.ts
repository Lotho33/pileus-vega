// The release calendar (pileus-player's features/media/calendar.dart):
// mycelium's GetCalendar, every plugin in one list like La mia lista; the
// page filters by plugin on what came back.

import {episodeBadge} from '../home/model';
import {CalendarEntry, CatalogItem} from '../gen/media';
import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';

/** How many days the page asks for (today included; the server allows 31). */
export const CALENDAR_DAYS = 14;

export interface CalendarDay {
  /** Local midnight. */
  day: Date;
  entries: CalendarEntry[];
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The request's range: today and the next CALENDAR_DAYS - 1 days, local. */
export function calendarRange(now = new Date()): {from: string; to: string} {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last = new Date(today.getFullYear(), today.getMonth(), today.getDate() + CALENDAR_DAYS - 1);
  return {from: ymd(today), to: ymd(last)};
}

/**
 * When `e` comes out, on the device's clock. An all-day release keeps its
 * own date (converting its midnight could move it to the day before).
 */
export function calendarReleaseTime(e: CalendarEntry): Date | null {
  const raw = e.releaseAt.trim();
  if (!raw) {
    return null;
  }
  if (e.allDay) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }
  const t = new Date(raw);
  return isNaN(t.getTime()) ? null : t;
}

/** `entries` by local day, in the server's order within each. */
export function groupCalendar(entries: CalendarEntry[]): CalendarDay[] {
  const days = new Map<number, CalendarEntry[]>();
  for (const e of entries) {
    const t = calendarReleaseTime(e);
    if (!t) {
      continue;
    }
    const key = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
    const list = days.get(key) ?? [];
    list.push(e);
    days.set(key, list);
  }
  return [...days.keys()].sort((a, b) => a - b).map(k => ({day: new Date(k), entries: days.get(k) ?? []}));
}

const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MONTHS = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
];

/** "Oggi", "Domani", else "giovedì 27 novembre". */
export function calendarDayLabel(day: Date, now = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const diff = Math.round((d.getTime() - today) / 86400000);
  if (diff === 0) {
    return 'Oggi';
  }
  if (diff === 1) {
    return 'Domani';
  }
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "21:00", or '' when only the date is known. */
export function calendarTimeLabel(e: CalendarEntry): string {
  if (e.allDay) {
    return '';
  }
  const t = calendarReleaseTime(e);
  return t ? `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` : '';
}

/** The series' name for an episode, when the plugin sends it (extra.series_title). */
export const calendarSeriesTitle = (e: CalendarEntry) => (e.item?.extra?.series_title ?? '').trim();

/** The big line: the series for an episode when known, else the title. */
export const calendarTitle = (e: CalendarEntry) => calendarSeriesTitle(e) || (e.item?.title ?? '');

/** The small line: "S2 · E8 · Episodio 8" (the episode's own title only under the series' name). */
export function calendarSubtitle(e: CalendarEntry): string {
  const i = e.item;
  // A live event: its competition ("Serie A", "ATP Finals").
  if (i?.mediaType === 'live') {
    return (i.extra?.competition ?? '').trim();
  }
  const badge = episodeBadge(i?.seasonNumber ?? 0, i?.episodeNumber ?? 0);
  const own = calendarSeriesTitle(e) ? (i?.title ?? '').trim() : '';
  return [badge, own].filter(Boolean).join(' · ');
}

/**
 * The row's picture is landscape for an episode item (its still) and a live
 * event (its cover, often "badge vs badge"); a plugin may send the series'
 * own card (its portrait poster) with `series_id` and the episode number
 * instead.
 */
export const calendarLandscapeThumb = (e: CalendarEntry) =>
  e.item?.mediaType === 'episode' || e.item?.mediaType === 'live';

/** The row's picture: a live event's wide image when sent (as the home's live cards), else the poster. */
export function calendarThumbUrl(e: CalendarEntry): string {
  const i = e.item;
  if (i?.mediaType === 'live' && i.bannerUrl) {
    return i.bannerUrl;
  }
  return i?.posterUrl ?? '';
}

/** A live event on air right now (`extra.is_live`, as on the home). */
export const calendarLiveNow = (e: CalendarEntry) => e.item?.mediaType === 'live' && e.item.extra?.is_live === '1';

/**
 * What OK opens: the series of an episode, or the title itself — a
 * "Previsto" one too (its page, to follow or add it ahead of the date).
 * Null only for an entry with nothing to open.
 */
export function calendarOpenTarget(e: CalendarEntry): CatalogItem | null {
  if (!e.item) {
    return null;
  }
  if (e.seriesId) {
    return CatalogItem.fromPartial({
      id: e.seriesId,
      title: calendarTitle(e),
      posterUrl: e.item.posterUrl,
      mediaType: 'series',
    });
  }
  return e.item.id ? e.item : null;
}

/** The calendar's filters, kept per profile across visits (calendar.dart's CalendarFilters). */
export interface CalendarFilters {
  followedOnly: boolean;
  /** '' = every plugin. */
  plugin: string;
}

const filtersKey = (profileId: string) => `pileus.calendar.filters:${profileId}`;

export async function readCalendarFilters(profileId: string): Promise<CalendarFilters> {
  try {
    const raw = await AsyncStorage.getItem(filtersKey(profileId));
    const v = raw ? JSON.parse(raw) : null;
    return {followedOnly: v?.followedOnly === true, plugin: typeof v?.plugin === 'string' ? v.plugin : ''};
  } catch {
    return {followedOnly: false, plugin: ''};
  }
}

export function saveCalendarFilters(profileId: string, f: CalendarFilters): void {
  AsyncStorage.setItem(filtersKey(profileId), JSON.stringify(f)).catch(() => {});
}
