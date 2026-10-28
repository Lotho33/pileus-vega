// Right-side filter drawer of the full search, port of filter_panel.dart.
// Focus is trapped inside while it's open; Back closes it (SearchScreen).

import React, {forwardRef, useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {Icon} from '../components/Icon';
import {focusSoon} from '../core/focus';
import type {SearchFilter} from '../gen/media';
import {colors, px, scaledStyles} from '../theme';
import {ActiveFilters, multiValues, rangeState, rangeValue, toggleMulti} from './filters';

const Chip = forwardRef<View, {label: string; selected: boolean; onPress: () => void}>(function Chip(
  {label, selected, onPress},
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      ref={ref}
      accessibilityLabel={label}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected, focused && styles.chipFocused]}>
      <Text style={[styles.chipText, (selected || focused) && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
});

function Stepper({
  label,
  value,
  onStep,
}: {
  label?: string;
  value: string;
  onStep: (dir: -1 | 1) => void;
}) {
  return (
    <View style={styles.stepper}>
      {label ? <Text style={styles.stepLabel}>{label}</Text> : null}
      <Chip label="−" selected={false} onPress={() => onStep(-1)} />
      <Text style={styles.stepValue}>{value}</Text>
      <Chip label="+" selected={false} onPress={() => onStep(1)} />
    </View>
  );
}

function FilterBody({
  f,
  value,
  onApply,
}: {
  f: SearchFilter;
  value: string | undefined;
  onApply: (v: string) => void;
}) {
  switch (f.type) {
    case 'select':
      return (
        <View style={styles.wrap}>
          {f.options.map(o => (
            <Chip
              key={o.id}
              label={o.label}
              selected={value === o.id}
              onPress={() => onApply(value === o.id ? '' : o.id)}
            />
          ))}
        </View>
      );
    case 'multiselect': {
      const sel = multiValues(value);
      return (
        <View style={styles.wrap}>
          {f.options.map(o => (
            <Chip
              key={o.id}
              label={o.label}
              selected={sel.includes(o.id)}
              onPress={() => onApply(toggleMulti(value, o.id))}
            />
          ))}
        </View>
      );
    }
    case 'bool': {
      const on = value === 'true';
      return <Chip label={on ? 'Attivo' : 'Non attivo'} selected={on} onPress={() => onApply(on ? '' : 'true')} />;
    }
    case 'number': {
      const maxYear = new Date().getFullYear();
      const cur = value ? parseInt(value, 10) : NaN;
      const has = Number.isFinite(cur);
      return (
        <Stepper
          value={has ? String(cur) : `es. ${maxYear}`}
          onStep={d => onApply(String(Math.min(maxYear, Math.max(1900, (has ? cur : maxYear) + d))))}
        />
      );
    }
    case 'range': {
      const r = rangeState(f, value);
      const show = (v: number) => (Number.isInteger(v) ? v.toFixed(0) : String(v));
      return (
        <View style={styles.rangeCol}>
          <Stepper
            label="Da"
            value={show(r.lo)}
            onStep={d => onApply(rangeValue(r, Math.min(r.hi, r.lo + d * r.step), r.hi))}
          />
          <Stepper
            label="A"
            value={show(r.hi)}
            onStep={d => onApply(rangeValue(r, r.lo, Math.max(r.lo, r.hi + d * r.step)))}
          />
        </View>
      );
    }
    default:
      return null;
  }
}

export function FilterPanel({
  filters,
  active,
  width,
  onApply,
  onReset,
  onClose,
}: {
  filters: SearchFilter[];
  active: ActiveFilters;
  width: number;
  onApply: (id: string, value: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<View>(null);
  useEffect(() => focusSoon(() => closeRef.current), []);
  const any = Object.keys(active).length > 0;
  return (
    <View style={styles.scrim}>
      <TVFocusGuideView style={[styles.panel, {width}]} trapFocusLeft trapFocusRight trapFocusUp trapFocusDown>
        <View style={styles.header}>
          <Icon name="tune" size={px(30)} color={colors.primary} />
          <Text style={styles.title}>Filtri</Text>
          <CloseButton ref={closeRef} onPress={onClose} />
        </View>
        <View style={styles.divider} />
        <ScrollView contentContainerStyle={styles.list}>
          {filters.map((f, i) => (
            <View key={f.id} style={[styles.filter, i > 0 && styles.filterSep]}>
              <Text style={styles.filterLabel}>{f.label.toUpperCase()}</Text>
              <FilterBody f={f} value={active[f.id]} onApply={v => onApply(f.id, v)} />
            </View>
          ))}
        </ScrollView>
        {any ? (
          <View style={styles.footer}>
            <ResetButton
              onPress={() => {
                onReset();
                focusSoon(() => closeRef.current);
              }}
            />
          </View>
        ) : null}
      </TVFocusGuideView>
    </View>
  );
}

const CloseButton = forwardRef<View, {onPress: () => void}>(function CloseButton({onPress}, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      ref={ref}
      hasTVPreferredFocus
      accessibilityLabel="Chiudi filtri"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[styles.close, focused && styles.closeFocused]}>
      <Icon name="close" size={px(30)} color={focused ? colors.textHigh : colors.textMid} />
    </Pressable>
  );
});

function ResetButton({onPress}: {onPress: () => void}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityLabel="Rimuovi filtri"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[styles.reset, focused && styles.resetFocused]}>
      <Text style={[styles.resetText, focused && styles.chipTextOn]}>Rimuovi filtri</Text>
    </Pressable>
  );
}

const styles = scaledStyles({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'flex-end',
  },
  panel: {
    height: '100%',
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  header: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 24, paddingRight: 12, paddingVertical: 20},
  title: {flex: 1, color: colors.textHigh, fontSize: 28, fontWeight: '700'},
  close: {padding: 10, borderRadius: 10, borderWidth: 2, borderColor: 'transparent'},
  closeFocused: {borderColor: colors.primary, backgroundColor: 'rgba(124,106,247,0.16)'},
  divider: {height: 1, backgroundColor: colors.border},
  list: {paddingVertical: 8, paddingRight: 14},
  filter: {paddingHorizontal: 20, paddingVertical: 14},
  filterSep: {borderTopWidth: 1, borderTopColor: 'rgba(42,42,74,0.5)'},
  filterLabel: {color: colors.textLow, fontSize: 18, fontWeight: '700', letterSpacing: 1.2, marginBottom: 12},
  wrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  chipSelected: {backgroundColor: 'rgba(124,106,247,0.35)', borderColor: 'rgba(124,106,247,0.6)'},
  chipFocused: {borderColor: colors.primary},
  chipText: {color: colors.textMid, fontSize: 20},
  chipTextOn: {color: colors.textHigh},
  stepper: {flexDirection: 'row', alignItems: 'center'},
  stepLabel: {width: 44, color: colors.textLow, fontSize: 18, fontWeight: '600'},
  stepValue: {color: colors.textHigh, fontSize: 24, fontWeight: '700', marginHorizontal: 16, minWidth: 70, textAlign: 'center'},
  rangeCol: {gap: 10},
  footer: {padding: 16},
  reset: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resetFocused: {borderColor: colors.primary, borderWidth: 2, backgroundColor: 'rgba(124,106,247,0.16)'},
  resetText: {color: colors.textMid, fontSize: 20, fontWeight: '600'},
});
