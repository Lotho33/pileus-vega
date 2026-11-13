// Avatar picker (shared/widgets/avatar_picker_dialog.dart): the built-in
// avatars in 5 columns. With `offerInitial` (profile creation) the first
// tile is the name's initial — the "no avatar" choice, saved as an empty
// avatar_url. It is never offered when editing a profile: mycelium's
// UpdateProfile reads an empty avatar_url as "leave unchanged", so there's
// no going back to it (a photo is set from mycelium's dashboard).
// Focus starts on the current choice; Back cancels.

import React, {forwardRef, useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {TVFocusGuideView, useKeplerBackHandler} from '@amazon-devices/react-native-kepler';
import {focusSoon} from '../core/focus';
import {colors, font, px, scaledStyles, space} from '../theme';
import {Avatar, AVATAR_COUNT, avatarUrl} from './Avatar';

const COLUMNS = 5;

/** Tile values in order: '' (the initial) first when offered, then avatar://0..9. */
export function pickerValues(offerInitial: boolean): string[] {
  return [...(offerInitial ? [''] : []), ...Array.from({length: AVATAR_COUNT}, (_, i) => avatarUrl(i))];
}

const AvatarCell = forwardRef<View, {name: string; url: string; selected: boolean; onPress: () => void}>(
  function AvatarCell({name, url, selected, onPress}, ref) {
    const [focused, setFocused] = useState(false);
    return (
      <Pressable
        ref={ref}
        accessibilityLabel={url ? 'Avatar' : 'Iniziale'}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPress={onPress}
        style={[styles.cell, selected && styles.cellSelected, focused && styles.cellFocused]}>
        <Avatar name={name} url={url} size={px(112)} />
      </Pressable>
    );
  },
);

export function AvatarPicker({
  title = 'Scegli avatar',
  name,
  current,
  offerInitial = false,
  onPick,
  onCancel,
}: {
  title?: string;
  name: string;
  current: string;
  offerInitial?: boolean;
  onPick: (url: string) => void;
  onCancel: () => void;
}) {
  const keplerBack = useKeplerBackHandler();
  const refs = useRef(new Map<number, View>());
  const values = pickerValues(offerInitial);
  const cur = Math.max(0, values.indexOf(current));
  useEffect(() => focusSoon(() => refs.current.get(cur)), [cur]);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => {
    const sub = keplerBack.addEventListener('hardwareBackPress', () => {
      cancelRef.current();
      return true;
    });
    return () => sub.remove();
  }, [keplerBack]);
  return (
    <View style={styles.scrim}>
      <TVFocusGuideView style={styles.card} trapFocusLeft trapFocusRight trapFocusUp trapFocusDown>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.grid}>
          {values.map((url, i) => (
            <AvatarCell
              key={url || 'initial'}
              ref={(v: View | null) => {
                if (v) {
                  refs.current.set(i, v);
                } else {
                  refs.current.delete(i);
                }
              }}
              name={name}
              url={url}
              selected={url === current}
              onPress={() => onPick(url)}
            />
          ))}
        </View>
      </TVFocusGuideView>
    </View>
  );
}

const styles = scaledStyles({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    padding: space.l,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.textHigh,
    fontSize: font.title * 0.8,
    fontWeight: '700',
    marginBottom: space.m,
    maxWidth: COLUMNS * 140,
  },
  grid: {flexDirection: 'row', flexWrap: 'wrap', width: COLUMNS * 140, gap: 0},
  cell: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 70,
    borderWidth: 4,
    borderColor: 'transparent',
  },
  cellSelected: {borderColor: 'rgba(124,106,247,0.6)'},
  cellFocused: {borderColor: colors.textHigh},
});
