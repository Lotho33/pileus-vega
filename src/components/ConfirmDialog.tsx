// Modal confirm over the current screen: focus is trapped in it and starts
// on "Annulla"; Back cancels (its listener is the newest while it's open).

import React, {useEffect, useRef} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {TVFocusGuideView, useKeplerBackHandler} from '@amazon-devices/react-native-kepler';
import {focusSoon} from '../core/focus';
import {colors, font, scaledStyles, space} from '../theme';
import {FocusButton} from './FocusButton';

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  destructive,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancel = useRef<View>(null);
  useEffect(() => focusSoon(() => cancel.current), []);
  const keplerBack = useKeplerBackHandler();
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  useEffect(() => {
    const sub = keplerBack.addEventListener('hardwareBackPress', () => {
      onCancelRef.current();
      return true;
    });
    return () => sub.remove();
  }, [keplerBack]);
  return (
    <View style={styles.scrim}>
      <TVFocusGuideView style={styles.card} trapFocusLeft trapFocusRight trapFocusUp trapFocusDown>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.actions}>
          <FocusButton ref={cancel} label="Annulla" onPress={onCancel} hasTVPreferredFocus />
          <FocusButton
            label={confirmLabel}
            primary
            onPress={onConfirm}
            style={destructive ? styles.destructive : undefined}
          />
        </View>
      </TVFocusGuideView>
    </View>
  );
}

const styles = scaledStyles({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.54)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 760,
    padding: space.l,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {color: colors.textHigh, fontSize: font.title * 0.8, fontWeight: '700'},
  message: {color: colors.textMid, fontSize: font.body, marginTop: space.s, lineHeight: font.body * 1.4},
  actions: {flexDirection: 'row', justifyContent: 'flex-end', gap: space.m, marginTop: space.l},
  destructive: {backgroundColor: '#D32F2F'},
});
