// A filter chip of a page header (Calendario, La mia lista; pileus-player's
// FilterChipButton): tinted when selected, accent border when focused.

import React, {forwardRef, useState} from 'react';
import {Pressable, View} from 'react-native';
import {Text} from './Text';
import {Icon} from './Icon';
import {colors, scaledStyles} from '../theme';

export const FilterChip = forwardRef<
  View,
  {s: number; label: string; icon?: 'check'; selected: boolean; onPress: () => void}
>(function FilterChip({s, label, icon, selected, onPress}, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      ref={ref}
      accessibilityLabel={label}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[
        styles.chip,
        {paddingHorizontal: 22 * s, paddingVertical: 10 * s, borderRadius: 40 * s, marginRight: 10 * s},
        selected && styles.chipSelected,
        focused && styles.chipFocused,
      ]}>
      {icon ? <Icon name={icon} size={24 * s} color={colors.textHigh} /> : null}
      <Text style={[styles.chipText, {fontSize: 22 * s}]}>{label}</Text>
    </Pressable>
  );
});

/** "Tutti" and one chip per plugin; `selectedRef` on the chosen one. */
export function PluginChips({
  s,
  plugin,
  choices,
  name,
  onPlugin,
  selectedRef,
}: {
  s: number;
  plugin: string;
  choices: string[];
  name: (id: string) => string;
  onPlugin: (id: string) => void;
  selectedRef?: React.Ref<View>;
}) {
  return (
    <>
      <FilterChip
        ref={!plugin ? selectedRef : undefined}
        s={s}
        label="Tutti"
        selected={!plugin}
        onPress={() => onPlugin('')}
      />
      {choices.map(p => (
        <FilterChip
          key={p}
          ref={plugin === p ? selectedRef : undefined}
          s={s}
          label={name(p)}
          selected={plugin === p}
          onPress={() => onPlugin(p)}
        />
      ))}
    </>
  );
}

const styles = scaledStyles({
  chip: {
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipSelected: {backgroundColor: 'rgba(124,106,247,0.25)', borderColor: colors.primary},
  chipFocused: {borderColor: colors.primary, backgroundColor: 'rgba(255,255,255,0.14)'},
  chipText: {color: colors.textHigh, fontWeight: '600'},
});
