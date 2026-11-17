// Small modal menu (long-press on a card), like _CardContextMenu and
// _CwContextMenu in pileus-player: a title, then one row per action. Focus is
// trapped in it and starts on the first row; Back closes it.
// It opens while OK is still held: the release would "press" the first row,
// so rows stay inert until that key-up has gone by.

import React, {useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Text} from './Text';
import {TVFocusGuideView, useKeplerBackHandler, useTVEventHandler} from '@amazon-devices/react-native-kepler';
import {focusSoon} from '../core/focus';
import {colors, px, scaledStyles} from '../theme';
import {Icon, IconName} from './Icon';

export interface MenuAction {
  icon: IconName;
  label: string;
  /** Red label and icon (removals). */
  destructive?: boolean;
  onPress: () => void;
}

const DESTRUCTIVE = '#EF4444';
// After the opening key's release (the press it triggers lands around it),
// or this long at most if that key-up never shows up.
const ARM_AFTER_KEYUP_MS = 150;
const ARM_FALLBACK_MS = 3000;

function MenuRow({action, first, armed}: {action: MenuAction; first: boolean; armed: () => boolean}) {
  const ref = useRef<View>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => (first ? focusSoon(() => ref.current) : undefined), [first]);
  // CwMenuButton: the row's own colour, also for its focus tint and border.
  const color = action.destructive ? DESTRUCTIVE : colors.textMid;
  const tint = action.destructive ? '239,68,68' : '255,255,255';
  return (
    <Pressable
      ref={ref}
      accessibilityLabel={action.label}
      hasTVPreferredFocus={first}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={() => armed() && action.onPress()}
      style={[
        styles.row,
        focused && {backgroundColor: `rgba(${tint},0.14)`, borderColor: `rgba(${tint},0.55)`},
      ]}>
      <Icon name={action.icon} size={px(44)} color={color} />
      <Text style={[styles.label, {color}]} numberOfLines={1}>
        {action.label}
      </Text>
    </Pressable>
  );
}

export function ContextMenu({
  title,
  actions,
  onClose,
  wide,
}: {
  /** _CwContextMenu (480 wide) rather than _CardContextMenu (400). */
  wide?: boolean;
  title: string;
  actions: MenuAction[];
  onClose: () => void;
}) {
  const keplerBack = useKeplerBackHandler();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const sub = keplerBack.addEventListener('hardwareBackPress', () => {
      onCloseRef.current();
      return true;
    });
    return () => sub.remove();
  }, [keplerBack]);

  const armedRef = useRef(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arm = (ms: number) => {
    if (armTimer.current) {
      clearTimeout(armTimer.current);
    }
    armTimer.current = setTimeout(() => (armedRef.current = true), ms);
  };
  useEffect(() => {
    arm(ARM_FALLBACK_MS);
    return () => {
      if (armTimer.current) {
        clearTimeout(armTimer.current);
      }
    };
  }, []);
  useTVEventHandler(evt => {
    if (!armedRef.current && evt.eventType === 'select' && evt.eventKeyAction === 1) {
      arm(ARM_AFTER_KEYUP_MS);
    }
  });
  const armed = () => armedRef.current;
  return (
    <View style={styles.scrim}>
      <TVFocusGuideView style={[styles.card, wide ? styles.cardWide : styles.cardNarrow]} trapFocusLeft trapFocusRight trapFocusUp trapFocusDown>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.list}>
          {actions.map((a, i) => (
            <MenuRow key={a.label} action={a} first={i === 0} armed={armed} />
          ))}
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
  // Flutter's dp on the 540 canvas, ×2.
  card: {borderRadius: 32, backgroundColor: '#14141F'},
  cardWide: {width: 960, paddingHorizontal: 64, paddingVertical: 56},
  cardNarrow: {width: 800, paddingHorizontal: 56, paddingVertical: 48},
  title: {color: colors.textHigh, fontSize: 36, fontWeight: '700'},
  list: {marginTop: 44, gap: 16},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
    paddingHorizontal: 32,
    paddingVertical: 28,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  label: {flex: 1, fontSize: 32},
});
