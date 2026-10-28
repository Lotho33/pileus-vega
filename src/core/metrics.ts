// User-facing response times, readable in Preferenze → "Tempi di risposta"
// (pileus-player's core/utils/metrics.dart). The waits that decide whether
// the app feels fast are kept — the last KEEP samples of each, saved on the
// device so they survive restarts — together with the share of slow frames
// per screen. Fed by core/perf.ts: a perf sample whose name is one of the
// metric ids below is recorded here too.

import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';

export interface Metric {
  id: string;
  label: string;
  hint: string;
}

export const METRICS: Metric[] = [
  {id: 'startup', label: 'Avvio → home', hint: "Da quando l'app parte alla prima riga della home."},
  {id: 'rpc GetCatalog', label: 'Righe della home', hint: 'Una pagina di catalogo dal server.'},
  {id: 'key→focus', label: 'Risposta alle frecce', hint: 'Da ←/→ su una riga alla card evidenziata.'},
  {id: 'hero bg', label: 'Sfondo della home', hint: 'Immagine di sfondo pronta dopo il cambio di card.'},
  {id: 'hero logo', label: 'Logo della home', hint: 'Logo del titolo pronto dopo il cambio di card.'},
  {id: 'rpc GetDetails', label: 'Apertura dettaglio', hint: 'Scheda di un titolo dal server.'},
  {id: 'rpc GetStreams', label: 'Ricerca sorgenti', hint: 'Elenco delle sorgenti (GetStreams).'},
  {id: 'rpc ResolveStream', label: 'Preparazione stream', hint: 'Preparazione del video sul server.'},
  {id: 'play first frame', label: 'Play → primo frame', hint: 'Da Play al primo fotogramma sullo schermo.'},
];

export const SCREEN_LABELS: Record<string, string> = {
  home: 'Home',
  details: 'Scheda titolo',
  search: 'Ricerca',
  player: 'Player',
};

const KEY = 'pileus.metrics.v1';
const KEEP = 20;
// Longer is an abandoned flow (screen left open, app in the background).
const MAX_SAMPLE_MS = 120_000;
// Fluidity covers about the last this-many frames per screen, so it reflects
// the current build rather than the whole install's history.
const FLUIDITY_WINDOW = 20_000;

interface Stored {
  samples: Record<string, number[]>;
  fluidity: Record<string, {frames: number; slow: number}>;
}

let data: Stored = {samples: {}, fluidity: {}};
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export async function loadMetrics(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') {
      // Samples taken this session before the load win.
      const samples: Record<string, number[]> = {...(parsed.samples ?? {})};
      for (const [id, list] of Object.entries(data.samples)) {
        samples[id] = [...(samples[id] ?? []), ...list].slice(-KEEP);
      }
      data = {samples, fluidity: {...(parsed.fluidity ?? {}), ...data.fluidity}};
    }
  } catch {
    // A corrupt blob only costs the history.
  }
}

function scheduleSave() {
  if (saveTimer) {
    return;
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    AsyncStorage.setItem(KEY, JSON.stringify(data)).catch(() => {});
  }, 5000);
}

const tracked = new Set(METRICS.map(m => m.id));

export function recordMetric(id: string, ms: number) {
  if (!tracked.has(id) || ms < 0 || ms > MAX_SAMPLE_MS) {
    return;
  }
  const list = (data.samples[id] ??= []);
  list.push(Math.round(ms));
  if (list.length > KEEP) {
    list.splice(0, list.length - KEEP);
  }
  scheduleSave();
}

/** Frames seen on `screen` since the last call, `slow` of them late. */
export function recordFrames(screen: string, frames: number, slow: number) {
  if (!frames) {
    return;
  }
  const f = (data.fluidity[screen] ??= {frames: 0, slow: 0});
  f.frames += frames;
  f.slow += slow;
  if (f.frames > FLUIDITY_WINDOW) {
    const k = FLUIDITY_WINDOW / f.frames;
    f.frames = Math.round(f.frames * k);
    f.slow = Math.round(f.slow * k);
  }
  scheduleSave();
}

export interface MetricSummary {
  metric: Metric;
  median: number;
  last: number;
  worst: number;
  count: number;
}

export function metricSummaries(): MetricSummary[] {
  const out: MetricSummary[] = [];
  for (const m of METRICS) {
    const list = data.samples[m.id];
    if (!list?.length) {
      continue;
    }
    const sorted = [...list].sort((a, b) => a - b);
    out.push({
      metric: m,
      median: sorted[Math.floor(sorted.length / 2)],
      last: list[list.length - 1],
      worst: sorted[sorted.length - 1],
      count: list.length,
    });
  }
  return out;
}

export function fluiditySummaries(): {label: string; slowPct: number; frames: number}[] {
  return Object.entries(data.fluidity)
    .filter(([, f]) => f.frames > 0)
    .map(([screen, f]) => ({
      label: SCREEN_LABELS[screen] ?? screen,
      slowPct: (f.slow / f.frames) * 100,
      frames: f.frames,
    }));
}

export async function clearMetrics(): Promise<void> {
  data = {samples: {}, fluidity: {}};
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await AsyncStorage.removeItem(KEY).catch(() => {});
}

/** Drops a pending save (tests). */
export function _cancelSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

export const fmtMs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
