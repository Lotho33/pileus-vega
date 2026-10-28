// Profiling probes, the Vega counterpart of pileus-player's perf_log.dart /
// perf_probes.dart. Everything is collected in memory and written to the
// device log as one summary line per metric every SUMMARY_MS (only when
// something happened), tagged "[pileus/perf]":
//
//   scripts/perf-log.sh <device-ip:port>
//
// What it measures:
//  - rpc <Method>: gRPC-Web round trips (and failures);
//  - key→focus: a D-pad step on a row until the card has focus;
//  - hero bg / hero logo: the hero's image decoded after it was committed;
//  - play first frame: Play pressed until the video is playing;
//  - jank: JS frames later than 2 frames (and stalls over 100 ms), per
//    screen — the JS thread is what runs focus, rows and the hero;
//  - heap: Hermes heap size, when the engine reports it.
//
// The user-facing ones are also kept on the device and shown in
// Preferenze → "Tempi di risposta" (core/metrics.ts).

import {recordFrames, recordMetric} from './metrics';

const TAG = '[pileus/perf]';
const SUMMARY_MS = 15_000;
const FRAME_MS = 1000 / 60;

const samples = new Map<string, number[]>();
const failures = new Map<string, number>();
let screenStack: string[] = ['home'];
const jank = new Map<string, {frames: number; late: number; stalls: number; worst: number}>();

/** Records one duration (ms) under `name`. */
export function sample(name: string, ms: number) {
  if (!Number.isFinite(ms) || ms < 0) {
    return;
  }
  let list = samples.get(name);
  if (!list) {
    list = [];
    samples.set(name, list);
  }
  list.push(ms);
  recordMetric(name, ms);
  ensureRunning();
}

export function failure(name: string) {
  failures.set(name, (failures.get(name) ?? 0) + 1);
  ensureRunning();
}

/** Starts a timer; the returned function records it under `name`. */
export function start(name: string): () => void {
  const t0 = Date.now();
  return () => sample(name, Date.now() - t0);
}

/** The screen jank is attributed to: push on mount, the returned pop on unmount. */
export function enterScreen(name: string): () => void {
  screenStack = [...screenStack, name];
  return () => {
    const i = screenStack.lastIndexOf(name);
    if (i > 0) {
      screenStack = [...screenStack.slice(0, i), ...screenStack.slice(i + 1)];
    }
  };
}

const currentScreen = () => screenStack[screenStack.length - 1];

function pct(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

/** One line per metric, e.g. "rpc GetCatalog n=4 p50=120 p95=480 max=480 err=1". */
export function summaryLines(): string[] {
  const out: string[] = [];
  const names = new Set([...samples.keys(), ...failures.keys()]);
  for (const name of [...names].sort()) {
    const list = (samples.get(name) ?? []).slice().sort((a, b) => a - b);
    const err = failures.get(name);
    const stats = list.length
      ? `n=${list.length} p50=${Math.round(pct(list, 0.5))} p95=${Math.round(pct(list, 0.95))} max=${Math.round(
          list[list.length - 1],
        )}`
      : 'n=0';
    out.push(`${name} ${stats}${err ? ` err=${err}` : ''}`);
  }
  for (const [screen, j] of jank) {
    if (j.late || j.stalls) {
      out.push(`jank ${screen} frames=${j.frames} late=${j.late} stalls=${j.stalls} worst=${Math.round(j.worst)}`);
    }
  }
  return out;
}

function reset() {
  samples.clear();
  failures.clear();
  jank.clear();
}

function heapLine(): string | null {
  const hermes = (globalThis as {HermesInternal?: {getInstrumentedStats?: () => Record<string, number>}})
    .HermesInternal;
  const stats = hermes?.getInstrumentedStats?.();
  const heap = stats?.js_heapSize;
  return heap ? `heap ${Math.round(heap / (1024 * 1024))} MiB` : null;
}

// ── JS frame monitor ─────────────────────────────────────────────────────
// A requestAnimationFrame loop: a gap over two frames is a late frame, over
// 100 ms a stall. Runs only while there's something to report on (it's
// started by the first sample and keeps going while the app is used).

let running = false;
let lastFrame = 0;
let lastActivity = 0;
let summaryTimer: ReturnType<typeof setInterval> | null = null;
let frameId: number | null = null;

function onFrame(now: number) {
  if (!running) {
    return;
  }
  if (lastFrame) {
    const gap = now - lastFrame;
    let j = jank.get(currentScreen());
    if (!j) {
      j = {frames: 0, late: 0, stalls: 0, worst: 0};
      jank.set(currentScreen(), j);
    }
    j.frames++;
    if (gap > FRAME_MS * 2.5) {
      j.late++;
    }
    if (gap > 100) {
      j.stalls++;
    }
    j.worst = Math.max(j.worst, gap);
  }
  lastFrame = now;
  frameId = requestAnimationFrame(onFrame);
}

function ensureRunning() {
  lastActivity = Date.now();
  if (running) {
    return;
  }
  running = true;
  lastFrame = 0;
  if (typeof requestAnimationFrame === 'function') {
    frameId = requestAnimationFrame(onFrame);
  }
  summaryTimer = setInterval(() => {
    const lines = summaryLines();
    const heap = heapLine();
    if (lines.length) {
      console.log(`${TAG} --- ${currentScreen()}${heap ? ` · ${heap}` : ''}`);
      lines.forEach(l => console.log(`${TAG} ${l}`));
    }
    // Frame counts per screen go to Preferenze → "Tempi di risposta" too.
    for (const [screen, j] of jank) {
      recordFrames(screen, j.frames, j.late);
    }
    reset();
    // Nothing measured for a while (app idle in the background): stop the
    // frame loop until the next sample.
    if (Date.now() - lastActivity > SUMMARY_MS * 2) {
      stop();
    }
  }, SUMMARY_MS);
}

function stop() {
  running = false;
  if (frameId !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(frameId);
  }
  frameId = null;
  if (summaryTimer) {
    clearInterval(summaryTimer);
    summaryTimer = null;
  }
}

let startupDone = false;
/** The home shows its first row: "Avvio → home", once per launch. */
export function homeShown() {
  const t0 = (globalThis as {__pileusStart?: number}).__pileusStart;
  if (startupDone || !t0) {
    return;
  }
  startupDone = true;
  sample('startup', Date.now() - t0);
}

/** Marks the user doing something (a key press), so the frame loop stays on. */
export function activity() {
  ensureRunning();
}

// For tests.
export const _internal = {reset, stop};
