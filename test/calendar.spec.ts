import {
  calendarDayLabel,
  calendarLandscapeThumb,
  calendarLiveNow,
  calendarOpenTarget,
  calendarRange,
  calendarReleaseTime,
  calendarSubtitle,
  calendarThumbUrl,
  calendarTimeLabel,
  calendarTitle,
  groupCalendar,
} from '../src/core/calendar';
import {CalendarEntry, CatalogItem} from '../src/gen/media';

const entry = (
  releaseAt: string,
  o: Partial<CalendarEntry> & {title?: string; extra?: Record<string, string>; s?: number; ep?: number} = {},
) =>
  CalendarEntry.fromPartial({
    pluginId: 'p',
    releaseAt,
    allDay: o.allDay ?? false,
    available: o.available ?? true,
    seriesId: o.seriesId ?? '',
    item: CatalogItem.fromPartial({
      id: 'i',
      title: o.title ?? 'T',
      extra: o.extra ?? {},
      seasonNumber: o.s ?? 0,
      episodeNumber: o.ep ?? 0,
    }),
  });

describe('calendar', () => {
  it('an all-day release keeps its own date', () => {
    const e = entry('2026-11-26T00:00:00+09:00', {allDay: true});
    expect(calendarReleaseTime(e)).toEqual(new Date(2026, 10, 26));
    expect(calendarTimeLabel(e)).toBe('');
  });

  it('a timed release on the device clock', () => {
    const local = new Date('2026-11-26T20:30:00Z');
    const two = (n: number) => String(n).padStart(2, '0');
    expect(calendarTimeLabel(entry('2026-11-26T20:30:00Z'))).toBe(
      `${two(local.getHours())}:${two(local.getMinutes())}`,
    );
  });

  it('grouped by day, unreadable dates left out', () => {
    const days = groupCalendar([
      entry('2026-11-27', {allDay: true, title: 'b'}),
      entry('2026-11-26', {allDay: true, title: 'a'}),
      entry('2026-11-27', {allDay: true, title: 'c'}),
      entry('', {title: 'x'}),
    ]);
    expect(days.map(d => d.day)).toEqual([new Date(2026, 10, 26), new Date(2026, 10, 27)]);
    expect(days[1].entries.map(e => e.item?.title)).toEqual(['b', 'c']);
  });

  it('labels and range', () => {
    const now = new Date(2026, 10, 24, 21);
    expect(calendarDayLabel(new Date(2026, 10, 24), now)).toBe('Oggi');
    expect(calendarDayLabel(new Date(2026, 10, 25), now)).toBe('Domani');
    expect(calendarDayLabel(new Date(2026, 10, 27), now)).toBe('venerdì 27 novembre');
    expect(calendarRange(now)).toEqual({from: '2026-11-24', to: '2026-12-07'});
  });

  it('titles', () => {
    const named = entry('2026-11-26', {allDay: true, title: 'Episodio 8', extra: {series_title: 'Dark'}, s: 2, ep: 8});
    expect(calendarTitle(named)).toBe('Dark');
    expect(calendarSubtitle(named)).toBe('S2 · E8 · Episodio 8');
    const bare = entry('2026-11-26', {allDay: true, title: 'Episodio 8', s: 2, ep: 8});
    expect(calendarTitle(bare)).toBe('Episodio 8');
    expect(calendarSubtitle(bare)).toBe('S2 · E8');
  });

  it('OK opens the series, "Previsto" ones too', () => {
    expect(calendarOpenTarget(entry('2026-11-26', {available: false, seriesId: 's1'}))?.id).toBe('s1');
    const ep = calendarOpenTarget(entry('2026-11-26', {seriesId: 's1'}));
    expect(ep?.id).toBe('s1');
    expect(ep?.mediaType).toBe('series');
    expect(calendarOpenTarget(entry('2026-11-26'))?.id).toBe('i');
  });

  it('a live event: competition, landscape, wide image, "In diretta" on air', () => {
    const live = (o: {banner?: string; onAir?: boolean} = {}): CalendarEntry =>
      CalendarEntry.fromPartial({
        pluginId: 'p',
        releaseAt: '2026-11-26T20:45:00Z',
        item: {
          id: 'e',
          title: 'Inter - Milan',
          mediaType: 'live',
          posterUrl: 'poster',
          bannerUrl: o.banner ?? '',
          extra: {competition: 'Serie A', ...(o.onAir ? {is_live: '1'} : {})},
        },
      });
    expect(calendarSubtitle(live())).toBe('Serie A');
    expect(calendarLandscapeThumb(live())).toBe(true);
    expect(calendarThumbUrl(live())).toBe('poster');
    expect(calendarThumbUrl(live({banner: 'wide'}))).toBe('wide');
    expect(calendarLiveNow(live())).toBe(false);
    expect(calendarLiveNow(live({onAir: true}))).toBe(true);
  });
});
