// "Riordina plugin" (plugin_reorder_dialog.dart): pick up and move. ↑/↓ move
// the focus, OK grabs the row, ↑/↓ then move it live, OK drops it and saves
// the new order once. Back while holding a row puts it back; otherwise Back
// closes the dialog.

import React, {useEffect, useRef, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {TVFocusGuideView, useKeplerBackHandler, useTVEventHandler} from '@amazon-devices/react-native-kepler';
import {FocusButton} from '../components/FocusButton';
import {Icon} from '../components/Icon';
import {focusSoon} from '../core/focus';
import type {PluginInfo} from '../gen/media';
import {colors, font, px, scaledStyles, space} from '../theme';
import {moveItem} from './reorder';

// Not the plain focus colour: "being moved" must read differently from
// "highlighted".
const GRAB = colors.secondary;

const ReorderRow = React.forwardRef<
  View,
  {label: string; index: number; grabbed: boolean; focusable: boolean; onFocus: () => void; onPress: () => void}
>(function ReorderRow({label, index, grabbed, focusable, onFocus, onPress}, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      ref={ref}
      focusable={focusable}
      onFocus={() => {
        setFocused(true);
        onFocus();
      }}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[styles.row, focused && styles.rowFocused, grabbed && styles.rowGrabbed]}>
      <Text style={styles.index}>{index + 1}</Text>
      <Text style={[styles.label, (focused || grabbed) && styles.labelOn]} numberOfLines={1}>
        {label}
      </Text>
      {grabbed ? <Icon name="arrowUp" size={px(28)} color={GRAB} /> : null}
      {grabbed ? <Icon name="arrowDown" size={px(28)} color={GRAB} /> : null}
    </Pressable>
  );
});

export function ReorderDialog({
  plugins,
  onSave,
  onClose,
}: {
  plugins: PluginInfo[];
  onSave: (orderedIds: string[]) => void;
  onClose: () => void;
}) {
  const keplerBack = useKeplerBackHandler();
  const [list, setList] = useState(plugins);
  const [grabbed, setGrabbed] = useState(false);
  const focusIdx = useRef(0);
  const beforeGrab = useRef<PluginInfo[]>(plugins);
  const refs = useRef(new Map<string, View>());

  // On open only: the page below re-renders (new array) after every save.
  const firstId = useRef(plugins[0]?.pluginId ?? '').current;
  useEffect(() => focusSoon(() => refs.current.get(firstId)), [firstId]);

  const state = useRef({grabbed, list});
  state.current = {grabbed, list};
  useEffect(() => {
    const sub = keplerBack.addEventListener('hardwareBackPress', () => {
      if (state.current.grabbed) {
        setList(beforeGrab.current);
        setGrabbed(false);
      } else {
        onClose();
      }
      return true;
    });
    return () => sub.remove();
  }, [keplerBack, onClose]);

  // While holding a row the other rows aren't focusable, so ↑/↓ don't move
  // native focus: they move the row (it keeps its key, so it keeps focus).
  useTVEventHandler(evt => {
    if (!state.current.grabbed || evt.eventKeyAction === 1) {
      return;
    }
    const delta = evt.eventType === 'up' ? -1 : evt.eventType === 'down' ? 1 : 0;
    if (!delta) {
      return;
    }
    const cur = state.current.list;
    const next = moveItem(cur, focusIdx.current, delta);
    if (next !== cur) {
      focusIdx.current = Math.max(0, Math.min(cur.length - 1, focusIdx.current + delta));
      setList(next);
    }
  });

  const press = (i: number) => {
    if (grabbed) {
      setGrabbed(false);
      if (list.map(p => p.pluginId).join() !== beforeGrab.current.map(p => p.pluginId).join()) {
        onSave(list.map(p => p.pluginId));
      }
    } else {
      focusIdx.current = i;
      beforeGrab.current = list;
      setGrabbed(true);
    }
  };

  return (
    <View style={styles.scrim}>
      <TVFocusGuideView style={styles.card} trapFocusLeft trapFocusRight trapFocusUp trapFocusDown>
        <Text style={styles.title}>Riordina plugin</Text>
        <Text style={[styles.hint, grabbed && styles.hintGrabbed]}>
          {grabbed ? 'Su/Giù per spostare · OK per rilasciare' : 'Su/Giù per navigare, poi OK per afferrare e spostare'}
        </Text>
        <View style={styles.list}>
          {list.map((p, i) => (
            <ReorderRow
              key={p.pluginId}
              ref={(v: View | null) => {
                if (v) {
                  refs.current.set(p.pluginId, v);
                }
              }}
              label={p.name || p.pluginId}
              index={i}
              grabbed={grabbed && i === focusIdx.current}
              focusable={!grabbed || i === focusIdx.current}
              onFocus={() => {
                if (!grabbed) {
                  focusIdx.current = i;
                }
              }}
              onPress={() => press(i)}
            />
          ))}
        </View>
        {!grabbed ? (
          <View style={styles.actions}>
            <FocusButton label="Chiudi" onPress={onClose} />
          </View>
        ) : null}
      </TVFocusGuideView>
    </View>
  );
}

const styles = scaledStyles({
  scrim: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center'},
  card: {
    width: 900,
    maxHeight: 1000,
    padding: space.l,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {color: colors.textHigh, fontSize: font.title * 0.8, fontWeight: '700'},
  hint: {color: colors.textLow, fontSize: 21, marginTop: 8, marginBottom: 16},
  hintGrabbed: {color: GRAB, fontWeight: '600'},
  list: {gap: 8},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surface2,
  },
  rowFocused: {borderColor: colors.primary},
  rowGrabbed: {borderColor: GRAB, backgroundColor: 'rgba(79,195,247,0.15)', transform: [{scale: 1.03}]},
  index: {color: colors.textLow, fontSize: 24, width: 40},
  label: {flex: 1, color: colors.textMid, fontSize: 28},
  labelOn: {color: colors.textHigh, fontWeight: '600'},
  actions: {flexDirection: 'row', justifyContent: 'flex-end', marginTop: space.m},
});
