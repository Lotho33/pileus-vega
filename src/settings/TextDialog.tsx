// Text entry dialog for settings (settings_text_dialog.dart), typed with the
// on-screen keyboard. Focus is trapped in it; Back cancels.

import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {TVFocusGuideView, useKeplerBackHandler} from '@amazon-devices/react-native-kepler';
import {FocusButton} from '../components/FocusButton';
import {KeyboardLayout, OnScreenKeyboard} from '../components/OnScreenKeyboard';
import {TextField} from '../components/TextField';
import {colors, font, px, scaledStyles, space} from '../theme';

export function TextDialog({
  title,
  message,
  initial = '',
  placeholder = '',
  layout = 'text',
  secure,
  maxLength = 64,
  confirmLabel = 'Salva',
  busy,
  error,
  allowEmpty,
  onSubmit,
  onCancel,
}: {
  title: string;
  message?: string;
  initial?: string;
  placeholder?: string;
  layout?: KeyboardLayout;
  secure?: boolean;
  maxLength?: number;
  confirmLabel?: string;
  busy?: boolean;
  error?: string;
  /** Lets an empty value through (clearing a plugin setting). */
  allowEmpty?: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const keplerBack = useKeplerBackHandler();
  const [value, setValue] = useState(initial);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => {
    const sub = keplerBack.addEventListener('hardwareBackPress', () => {
      cancelRef.current();
      return true;
    });
    return () => sub.remove();
  }, [keplerBack]);

  const submit = () => {
    if (busy || (!allowEmpty && !value.trim())) {
      return;
    }
    onSubmit(layout === 'digits' ? value : value.trim());
  };
  const narrow = layout === 'digits';
  const width = px(narrow ? 420 : 900);
  return (
    <View style={styles.scrim}>
      <TVFocusGuideView
        style={[styles.card, {width: width + px(space.l * 2)}]}
        trapFocusLeft
        trapFocusRight
        trapFocusUp
        trapFocusDown>
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <TextField value={value} placeholder={placeholder} secure={secure} center={narrow} style={[styles.field, {width}]} />
        <OnScreenKeyboard
          value={value}
          onChange={setValue}
          layout={layout}
          onSubmit={submit}
          maxLength={maxLength}
          width={width}
          keyHeight={px(narrow ? 64 : 56)}
          takeFocus
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <FocusButton label="Annulla" onPress={onCancel} />
          <FocusButton label={confirmLabel} primary busy={busy} onPress={submit} />
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
    gap: space.m,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  title: {color: colors.textHigh, fontSize: font.title * 0.8, fontWeight: '700', alignSelf: 'flex-start'},
  message: {color: colors.textMid, fontSize: font.body, alignSelf: 'flex-start'},
  field: {},
  error: {color: colors.error, fontSize: font.body},
  actions: {flexDirection: 'row', gap: space.m, alignSelf: 'flex-end'},
});
