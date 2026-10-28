// Read-only view of the profile preferences blob (ProfileResponse.
// preferences_json) — same schema as pileus-player's ProfilePrefs
// (lib/features/settings/data/profile_prefs.dart), so plugin/catalog order
// and visibility set on any other device apply here too:
//
// { "v": 1, "subtitles": {...},
//   "plugins": { "order": [...], "hiddenPlugins": [...],
//                "catalogs": { "<pluginId>": {"order": [...], "hidden": [...]} } } }

import type {CatalogDef, PluginInfo} from '../gen/media';

export interface PluginPrefs {
  order: string[];
  hidden: Set<string>;
  catalogs: Record<string, {order: string[]; hidden: Set<string>}>;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export function parsePluginPrefs(json: string): PluginPrefs {
  const empty: PluginPrefs = {order: [], hidden: new Set(), catalogs: {}};
  if (!json) {
    return empty;
  }
  try {
    const p = JSON.parse(json)?.plugins;
    if (!p || typeof p !== 'object') {
      return empty;
    }
    const catalogs: PluginPrefs['catalogs'] = {};
    for (const [id, c] of Object.entries(p.catalogs ?? {})) {
      const cc = c as {order?: unknown; hidden?: unknown};
      catalogs[id] = {order: strings(cc.order), hidden: new Set(strings(cc.hidden))};
    }
    return {
      order: strings(p.order),
      hidden: new Set(strings(p.hiddenPlugins)),
      catalogs,
    };
  } catch {
    return empty;
  }
}

/** Stable sort by a saved id order; ids not in it keep their server order after. */
function sortByOrder<T>(items: T[], order: string[], id: (t: T) => string): T[] {
  if (!order.length) {
    return items;
  }
  const rank = new Map(order.map((o, i) => [o, i]));
  return items
    .map((t, i) => ({t, i, r: rank.get(id(t)) ?? order.length + i}))
    .sort((a, b) => a.r - b.r)
    .map(x => x.t);
}

export function applyPluginPrefs(plugins: PluginInfo[], prefs: PluginPrefs): PluginInfo[] {
  return sortByOrder(
    plugins.filter(p => !prefs.hidden.has(p.pluginId)),
    prefs.order,
    p => p.pluginId,
  );
}

export function applyCatalogPrefs(
  pluginId: string,
  catalogs: CatalogDef[],
  prefs: PluginPrefs,
): CatalogDef[] {
  const c = prefs.catalogs[pluginId];
  if (!c) {
    return catalogs;
  }
  return sortByOrder(
    catalogs.filter(x => !c.hidden.has(x.id)),
    c.order,
    x => x.id,
  );
}

/** Same gate as home_view.dart's _isPluginReady. */
export function isPluginReady(p: PluginInfo): boolean {
  return (
    !p.needsConfig &&
    p.statusLabel !== 'syncing' &&
    p.statusLabel !== 'error' &&
    p.catalogs.length > 0
  );
}

/**
 * `json` with its plugins block replaced by `prefs`, every other key (the
 * subtitles block, blocks newer apps added) kept as is — ProfilePrefs.toJson
 * in pileus-player does the same with its _unknownBlocks.
 */
export function writePluginPrefs(json: string, prefs: PluginPrefs): string {
  let root: Record<string, unknown> = {};
  try {
    const parsed = json ? JSON.parse(json) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      root = parsed;
    }
  } catch {
    root = {};
  }
  const old = root.plugins && typeof root.plugins === 'object' ? (root.plugins as Record<string, unknown>) : {};
  const plugins: Record<string, unknown> = {...old};
  delete plugins.order;
  delete plugins.hiddenPlugins;
  delete plugins.catalogs;
  if (prefs.order.length) {
    plugins.order = prefs.order;
  }
  if (prefs.hidden.size) {
    plugins.hiddenPlugins = [...prefs.hidden];
  }
  const catalogs: Record<string, {order?: string[]; hidden?: string[]}> = {};
  for (const [id, c] of Object.entries(prefs.catalogs)) {
    const entry: {order?: string[]; hidden?: string[]} = {};
    if (c.order.length) {
      entry.order = c.order;
    }
    if (c.hidden.size) {
      entry.hidden = [...c.hidden];
    }
    if (entry.order || entry.hidden) {
      catalogs[id] = entry;
    }
  }
  if (Object.keys(catalogs).length) {
    plugins.catalogs = catalogs;
  }
  const out: Record<string, unknown> = {...root, v: 1};
  if (Object.keys(plugins).length) {
    out.plugins = plugins;
  } else {
    delete out.plugins;
  }
  return JSON.stringify(out);
}

// ── Subtitles block ({"subtitles": {fontSize, colorArgb, bgEnabled,
// bottomPadding}}), same keys and defaults as pileus-player's ProfilePrefs /
// SettingsRepository. Sizes are Flutter logical pixels, i.e. Vega dp.

export interface SubtitleStyle {
  fontSize: number;
  /** 0xAARRGGBB, as Flutter's Color.toARGB32(). */
  colorArgb: number;
  bgEnabled: boolean;
  bottomPadding: number;
}

export const SUBTITLE_DEFAULTS: SubtitleStyle = {fontSize: 32, colorArgb: 0xffffffff, bgEnabled: true, bottomPadding: 80};
export const SUBTITLE_SIZE = {min: 16, max: 64, step: 2};
export const SUBTITLE_PADDING = {min: 0, max: 300, step: 10};
export const SUBTITLE_COLORS: {argb: number; label: string}[] = [
  {argb: 0xffffffff, label: 'Bianco'},
  {argb: 0xffffeb3b, label: 'Giallo'},
  {argb: 0xff80ff80, label: 'Verde'},
  {argb: 0xff80d8ff, label: 'Ciano'},
];

export function parseSubtitleStyle(json: string): SubtitleStyle {
  let s: Record<string, unknown> = {};
  try {
    const sub = json ? JSON.parse(json)?.subtitles : null;
    if (sub && typeof sub === 'object') {
      s = sub;
    }
  } catch {
    s = {};
  }
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    fontSize: num(s.fontSize, SUBTITLE_DEFAULTS.fontSize),
    colorArgb: num(s.colorArgb, SUBTITLE_DEFAULTS.colorArgb) >>> 0,
    bgEnabled: typeof s.bgEnabled === 'boolean' ? s.bgEnabled : SUBTITLE_DEFAULTS.bgEnabled,
    bottomPadding: num(s.bottomPadding, SUBTITLE_DEFAULTS.bottomPadding),
  };
}

/** `json` with its subtitles block set to `style`, other blocks untouched. */
export function writeSubtitleStyle(json: string, style: SubtitleStyle): string {
  let root: Record<string, unknown> = {};
  try {
    const parsed = json ? JSON.parse(json) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      root = parsed;
    }
  } catch {
    root = {};
  }
  return JSON.stringify({...root, v: 1, subtitles: {...style}});
}

/** 0xAARRGGBB → rgba() for React Native. */
export function argbToCss(argb: number): string {
  const a = ((argb >>> 24) & 255) / 255;
  return `rgba(${(argb >>> 16) & 255},${(argb >>> 8) & 255},${argb & 255},${a.toFixed(3)})`;
}
