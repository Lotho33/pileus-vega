// Which source a Play picks, and the language choices remembered per series —
// the Vega counterpart of pileus-player's source_preference.dart and
// audio_lang_pref.dart.
//
// On a VOD title the sources of a plugin are its language versions
// ("Italiano" / "Inglese", "Italiano (Doppiato)" / "Giapponese (Sub ITA)");
// on a live event they are the nodes serving it, where none of this applies.
//
// The rule, in order:
//  1. an explicit label (the source of the episode being continued);
//  2. the label last played for this series, on this profile;
//  3. the profile's preferred language version (blob "playback.language");
//  4. the first source.

import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';
import type {StreamSource} from '../gen/media';

export type PreferredLanguage = 'it' | 'original';

export const LANGUAGE_LABELS: Record<PreferredLanguage, string> = {
  it: 'Italiano',
  original: 'Originale sottotitolato',
};

/**
 * The language version a source label stands for, or null when the label
 * says nothing about language (a live node, an unlabelled source). "Sub"
 * anywhere means the original audio with subtitles.
 */
export function languageOfLabel(label: string): PreferredLanguage | null {
  const l = label.toLowerCase();
  if (!l) {
    return null;
  }
  if (l.includes('sub')) {
    return 'original';
  }
  if (l.includes('ital') || /\bita\b/.test(l) || l.includes('doppiat')) {
    return 'it';
  }
  const originals = ['ingl', 'engl', 'eng', 'giappon', 'japan', 'jap', 'orig', 'spagn', 'franc', 'tedes', 'corean', 'korean'];
  return originals.some(o => l.includes(o)) ? 'original' : null;
}

/** The pure rule. `usedFallback`: the preferred language isn't offered. */
export function chooseSource(
  sources: StreamSource[],
  opts: {explicitLabel?: string; rememberedLabel?: string; language?: PreferredLanguage} = {},
): {source: StreamSource | null; usedFallback: boolean} {
  if (!sources.length) {
    return {source: null, usedFallback: false};
  }
  for (const label of [opts.explicitLabel ?? '', opts.rememberedLabel ?? '']) {
    if (!label) {
      continue;
    }
    const hit = sources.find(s => s.label.toLowerCase() === label.toLowerCase());
    if (hit) {
      return {source: hit, usedFallback: false};
    }
  }
  const langs = sources.map(s => languageOfLabel(s.label));
  if (langs.every(l => l === null)) {
    return {source: sources[0], usedFallback: false};
  }
  const i = langs.indexOf(opts.language ?? 'it');
  return i >= 0 ? {source: sources[i], usedFallback: false} : {source: sources[0], usedFallback: true};
}

/**
 * `sources` with the rule's pick moved to the front: the first button is the
 * auto-focused one, so OK plays what the rule chose.
 */
export function preferredFirst(
  sources: StreamSource[],
  opts: {pluginId?: string; seriesId?: string; language?: PreferredLanguage},
): StreamSource[] {
  const {source} = chooseSource(sources, {
    rememberedLabel: sourceMemory.labelFor(opts.pluginId ?? '', opts.seriesId ?? ''),
    language: opts.language,
  });
  if (!source || source === sources[0]) {
    return sources;
  }
  return [source, ...sources.filter(s => s !== source)];
}

/** "Disponibile solo in inglese" when the preferred language isn't offered. */
export function languageNotice(sources: StreamSource[], chosen: StreamSource | null, language: PreferredLanguage): string {
  if (!chosen) {
    return '';
  }
  const langs = sources.map(s => languageOfLabel(s.label));
  if (langs.includes(language) || languageOfLabel(chosen.label) === null) {
    return '';
  }
  return `Disponibile solo in ${chosen.label.trim().toLowerCase()}`;
}

/**
 * The ITA/JAP/ENG pill for a card or an episode, from the plugin's
 * `extra.lang` (and `extra.subs`) — language_badge.dart. Null when there's
 * nothing worth flagging ('' / 'both').
 */
export function languageBadge(lang: string | undefined, subs = ''): {label: string; color: string} | null {
  switch (lang) {
    case 'ita':
      return {label: 'ITA', color: 'rgba(56,189,248,0.9)'};
    case 'jap':
      return {label: 'JAP', color: 'rgba(249,115,22,0.9)'};
    case 'eng':
      return {label: subs === 'ita' ? 'ENG · SUB ITA' : 'ENG', color: 'rgba(167,139,250,0.9)'};
    default:
      return null;
  }
}

/** The profile blob's "playback.language" (ProfilePrefs.preferredLanguage). */
export function parsePreferredLanguage(json: string): PreferredLanguage {
  try {
    return JSON.parse(json || '{}')?.playback?.language === 'original' ? 'original' : 'it';
  } catch {
    return 'it';
  }
}

/** `json` with "playback.language" set, every other block kept as is. */
export function writePreferredLanguage(json: string, lang: PreferredLanguage): string {
  let root: Record<string, unknown> = {};
  try {
    const parsed = json ? JSON.parse(json) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      root = parsed;
    }
  } catch {
    root = {};
  }
  const old = root.playback && typeof root.playback === 'object' ? (root.playback as Record<string, unknown>) : {};
  return JSON.stringify({...root, v: 1, playback: {...old, language: lang}});
}

// ── Device-local memory, per profile ────────────────────────────────────
// One AsyncStorage entry, read once at startup (loadLanguageMemory) so the
// rule can stay synchronous like the Flutter one.

const KEY = 'pileus.lang.v1';
let store: Record<string, string> = {};
let profileId = '';
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export async function loadLanguageMemory(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    store = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    store = {};
  }
}

/** The active profile: with none, nothing is read or written. */
export function setLanguageProfile(id: string) {
  profileId = id;
}

function put(key: string, value: string) {
  store[key] = value;
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    AsyncStorage.setItem(KEY, JSON.stringify(store)).catch(() => {});
  }, 500);
}

/** The language version last played per series (step 2 of the rule). */
export const sourceMemory = {
  labelFor(pluginId: string, seriesId: string): string {
    if (!profileId || !pluginId || !seriesId) {
      return '';
    }
    return store[`source:${profileId}:${pluginId}:${seriesId}`] ?? '';
  },
  /** Only language labels are remembered — never a live node. */
  remember(pluginId: string, seriesId: string, label: string) {
    if (!profileId || !pluginId || !seriesId || languageOfLabel(label) === null) {
      return;
    }
    put(`source:${profileId}:${pluginId}:${seriesId}`, label);
  },
};

export interface AudioTrackLike {
  id: string;
  label: string;
  active: boolean;
}

/**
 * Exact label first; then the language token alone (before " · ") compared as
 * a whole word — never a loose substring.
 */
export function matchAudioTrack<T extends AudioTrackLike>(tracks: T[], want: string): T | null {
  const w = want.toLowerCase().trim();
  const exact = tracks.find(t => t.label.toLowerCase().trim() === w);
  if (exact) {
    return exact;
  }
  const lang = (l: string) => l.split('·')[0].trim().toLowerCase();
  const wl = lang(want);
  return wl ? tracks.find(t => lang(t.label) === wl) ?? null : null;
}

/**
 * Audio track remembered for streams carrying several audio renditions:
 * per series first, then the profile's last explicit pick. One per player;
 * `pick` acts once per opened stream (`reset` re-arms it).
 */
export class AudioLangPref {
  private applied = false;
  constructor(private readonly scope: () => {pluginId: string; seriesId: string}) {}

  private seriesKey(): string | null {
    const s = this.scope();
    return s.pluginId && s.seriesId ? `audio:${profileId}:${s.pluginId}:${s.seriesId}` : null;
  }

  reset() {
    this.applied = false;
  }

  /** The user picked `label`: remember it for this series and the profile. */
  remember(label: string) {
    this.applied = true;
    if (!profileId || !label) {
      return;
    }
    const series = this.seriesKey();
    if (series) {
      put(series, label);
    }
    put(`audio:${profileId}`, label);
  }

  /** Once tracks are known: the track to switch to, or null to leave it. */
  pick<T extends AudioTrackLike>(tracks: T[]): T | null {
    if (this.applied || tracks.length < 2) {
      return null;
    }
    this.applied = true;
    if (!profileId) {
      return null;
    }
    const active = tracks.find(t => t.active) ?? null;
    const series = this.seriesKey();
    const want = (series ? store[series] : undefined) ?? store[`audio:${profileId}`];
    const match = want ? matchAudioTrack(tracks, want) : null;
    const playing = match ?? active;
    if (series && store[series] === undefined && playing?.label) {
      put(series, playing.label);
    }
    return match && match.id !== active?.id ? match : null;
  }
}
