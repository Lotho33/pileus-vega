// Live-event helpers, ported from pileus-player's sdui/sport_theme.dart.

export function isLiveNow(extra: {[k: string]: string} | undefined): boolean {
  return extra?.is_live === '1' || extra?.is_live === 'true';
}

const START_KEYS = [
  'stream_start',
  'streamStart',
  'start_time',
  'start',
  'start_at',
  'starts_at',
  'start_unix',
  'event_time',
  'kickoff',
  'time',
  'begin',
  'scheduled',
];

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Best-effort local "HH:MM" start of an event, from whichever key the plugin set. */
export function liveStartTimeLabel(extra: {[k: string]: string} | undefined): string | null {
  for (const k of START_KEYS) {
    const v = extra?.[k]?.trim();
    if (!v) {
      continue;
    }
    if (/^\d+$/.test(v)) {
      const n = Number(v);
      if (n > 1e9) {
        return hhmm(new Date(n > 1e11 ? n : n * 1000));
      }
    }
    const m = /\b(\d{1,2}):(\d{2})\b/.exec(v);
    if (m) {
      return `${m[1].padStart(2, '0')}:${m[2]}`;
    }
    const t = Date.parse(v);
    if (!Number.isNaN(t)) {
      return hhmm(new Date(t));
    }
  }
  const fromPlot = liveStartAt(extra);
  return fromPlot ? hhmm(fromPlot) : null;
}

// "Inizio: 25/10 12:00" (local) or "Inizio: 25/10 12:00 UTC" — the line the
// sport plugins write at the top of the plot.
const PLOT_START = /^\s*Inizio:\s*(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})(\s*UTC)?/im;
const PLOT_START_LINE = /^\s*Inizio:\s*\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}/i;
const DAY_MS = 86_400_000;

/**
 * When an event starts, as a full date — from a start key (Unix s/ms or
 * ISO-8601), else from the plot's "Inizio: dd/mm hh:mm" line. Null when
 * neither says (sport_theme.dart liveStartAt).
 */
export function liveStartAt(extra: {[k: string]: string} | undefined, now: Date = new Date()): Date | null {
  for (const k of START_KEYS) {
    const v = extra?.[k]?.trim();
    if (!v) {
      continue;
    }
    if (/^\d+$/.test(v)) {
      const n = Number(v);
      if (n > 1e9) {
        return new Date(n > 1e11 ? n : n * 1000);
      }
    }
    // Only a full date here: a bare "21:45" has no day.
    if (/\d{4}-\d{2}-\d{2}/.test(v)) {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) {
        return new Date(t);
      }
    }
  }
  const m = PLOT_START.exec(extra?.plot ?? '');
  if (!m) {
    return null;
  }
  const [day, month, hour, minute] = [m[1], m[2], m[3], m[4]].map(Number);
  const at = (year: number) =>
    m[5] ? new Date(Date.UTC(year, month - 1, day, hour, minute)) : new Date(year, month - 1, day, hour, minute);
  // No year in the line: the one nearest to today.
  let d = at(now.getFullYear());
  if (d.getTime() - now.getTime() > 180 * DAY_MS) {
    d = at(now.getFullYear() - 1);
  }
  if (now.getTime() - d.getTime() > 180 * DAY_MS) {
    d = at(now.getFullYear() + 1);
  }
  return d;
}

const dayDiff = (a: Date, b: Date) =>
  Math.round(
    (new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime() -
      new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()) /
      DAY_MS,
  );
// Date.getDay(): 0 = Sunday.
const WEEKDAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const ddmm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

/** "Tra 25 min", "Oggi alle 20:45", "Domani alle 15:00", "Sabato alle 18:00", "02/11 alle 21:00". */
export function liveWhenLabel(start: Date, now: Date = new Date()): string {
  const hm = hhmm(start);
  const mins = Math.floor((start.getTime() - now.getTime()) / 60000);
  if (mins < 0) {
    return `Doveva iniziare alle ${hm}`;
  }
  if (mins < 60) {
    return mins <= 1 ? 'Sta per iniziare' : `Tra ${mins} min`;
  }
  const days = dayDiff(start, now);
  if (days === 0) {
    return `Oggi alle ${hm}`;
  }
  if (days === 1) {
    return `Domani alle ${hm}`;
  }
  return days < 7 ? `${WEEKDAYS[start.getDay()]} alle ${hm}` : `${ddmm(start)} alle ${hm}`;
}

/** Card badge form, by day so it can't go stale: "Oggi 20:45", "Sab 18:00"; past its start "In attesa". */
export function liveWhenShort(start: Date, now: Date = new Date()): string {
  if (start.getTime() < now.getTime()) {
    return 'In attesa';
  }
  const hm = hhmm(start);
  const days = dayDiff(start, now);
  if (days === 0) {
    return `Oggi ${hm}`;
  }
  if (days === 1) {
    return `Domani ${hm}`;
  }
  return days < 7 ? `${WEEKDAYS_SHORT[start.getDay()]} ${hm}` : `${ddmm(start)} ${hm}`;
}

/**
 * The plot without what the status line already shows: "Inizio: …" (when the
 * start is shown) and a bare "IN DIRETTA". "IN DIRETTA · 63' (1-0)" stays.
 */
export function livePlotWithoutStatus(plot: string, startShown: boolean): string {
  return plot
    .split('\n')
    .filter(l => {
      const t = l.trim();
      return t !== '' && t.toUpperCase() !== 'IN DIRETTA' && !(startShown && PLOT_START_LINE.test(t));
    })
    .join('\n');
}

const ACCENT: Record<string, string> = {
  football: '#2E7D32',
  basketball: '#E65100',
  tennis: '#558B2F',
  baseball: '#1565C0',
  hockey: '#0277BD',
  'ice-hockey': '#0277BD',
  rugby: '#4E342E',
  'rugby-league': '#4E342E',
  'rugby-union': '#4E342E',
  'motor-sports': '#B71C1C',
  'american-football': '#4527A0',
  cycling: '#00695C',
  golf: '#33691E',
  boxing: '#880E4F',
  fight: '#880E4F',
  mma: '#880E4F',
  cricket: '#1A237E',
  volleyball: '#006064',
  darts: '#37474F',
  afl: '#4E342E',
};

export function sportAccentColor(cat: string): string {
  return ACCENT[cat] ?? '#1A237E';
}
