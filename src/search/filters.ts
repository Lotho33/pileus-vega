// Search filter values, as pileus-player's filter_panel.dart encodes them on
// the wire (SearchRequest.filters is map<string,string>, see media.proto):
//   select       "<optId>"
//   multiselect  "a,b,c"
//   range        "<lo>..<hi>" (either side may be empty)
//   bool         "true"
//   number       "<n>"
// An empty string means "no constraint" and drops the key.

import type {SearchFilter} from '../gen/media';

export type ActiveFilters = Record<string, string>;

export function setFilter(active: ActiveFilters, id: string, value: string): ActiveFilters {
  const next = {...active};
  if (value) {
    next[id] = value;
  } else {
    delete next[id];
  }
  return next;
}

export function multiValues(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export function toggleMulti(value: string | undefined, id: string): string {
  const set = multiValues(value);
  const i = set.indexOf(id);
  if (i >= 0) {
    set.splice(i, 1);
  } else {
    set.push(id);
  }
  return set.join(',');
}

const fmt = (v: number) => (Number.isInteger(v) ? v.toFixed(0) : String(v));

export interface RangeState {
  min: number;
  max: number;
  step: number;
  lo: number;
  hi: number;
}

/** Bounds come from the filter's {id:"min"|"max"|"step"} options. */
export function rangeState(f: SearchFilter, value: string | undefined): RangeState {
  const opt = (id: string, fallback: number) => {
    const o = f.options.find(x => x.id === id);
    const n = o ? parseFloat(o.label) : NaN;
    return Number.isFinite(n) ? n : fallback;
  };
  const min = opt('min', 0);
  const max = Math.max(min, opt('max', 100));
  const rawStep = opt('step', 1);
  const step = rawStep > 0 ? rawStep : 1;
  const parts = (value ?? '').split('..');
  const num = (s: string | undefined) => {
    const n = s === undefined || s.trim() === '' ? NaN : parseFloat(s);
    return Number.isFinite(n) ? n : null;
  };
  let lo = num(parts[0]);
  let hi = parts.length > 1 ? num(parts[1]) : null;
  if (parts.length === 1 && lo !== null) {
    hi = lo; // bare "2010" means both ends
  }
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return {min, max, step, lo: clamp(lo ?? min), hi: clamp(hi ?? max)};
}

/** Encodes a range; the full span is no constraint at all. */
export function rangeValue(r: RangeState, lo: number, hi: number): string {
  const l = Math.min(r.max, Math.max(r.min, lo));
  const h = Math.min(r.max, Math.max(r.min, hi));
  if (l <= r.min && h >= r.max) {
    return '';
  }
  return `${fmt(l)}..${fmt(h)}`;
}

/** Human label of an active filter value, for the chips under the bar. */
export function optionLabel(f: SearchFilter, value: string): string {
  if (f.type === 'bool') {
    return value === 'true' ? 'Sì' : 'No';
  }
  if (f.type === 'range') {
    const p = value.split('..');
    if (p.length === 2) {
      return p[0] === p[1] ? p[0] : `${p[0]}–${p[1]}`;
    }
    return value;
  }
  if (f.type === 'multiselect') {
    return multiValues(value)
      .map(id => f.options.find(o => o.id === id)?.label ?? id)
      .join(', ');
  }
  return f.options.find(o => o.id === value)?.label ?? value;
}
