// Rows and page frame shared by the settings pages (pileus-player
// shared/widgets/settings: SettingsNavRow, SettingsToggleRow, the ‹ value ›
// stepper rows of preferences_screen.dart).

import React, {forwardRef, useEffect, useRef, useState} from 'react';
import {Dimensions, Image, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {Text} from '../components/Text';
import {useTVEventHandler} from '@amazon-devices/react-native-kepler';
import {Icon, IconName} from '../components/Icon';
import {focusSoon} from '../core/focus';
import {colors, px, scaledStyles} from '../theme';

// SettingsSectionHeader: a small violet tick before the caption.
export function SectionHeader({title}: {title: string}) {
  return (
    <View style={styles.sectionRow}>
      <View style={styles.tick} />
      <Text style={styles.section}>{title.toUpperCase()}</Text>
    </View>
  );
}

interface RowProps {
  icon?: IconName;
  label: string;
  subtitle?: string;
  /** Right-hand value (current choice). */
  value?: string;
  /** Show the chevron (opens a page). */
  nav?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  onFocusChange?: (focused: boolean) => void;
}

export const Row = forwardRef<View, RowProps>(function Row(
  {icon, label, subtitle, value, nav, danger, disabled, onPress, onFocusChange},
  ref,
) {
  const [focused, setFocused] = useState(false);
  const fg = focused ? '#fff' : danger ? colors.error : colors.textMid;
  return (
    <Pressable
      ref={ref}
      accessibilityLabel={label}
      onFocus={() => {
        setFocused(true);
        onFocusChange?.(true);
      }}
      onBlur={() => {
        setFocused(false);
        onFocusChange?.(false);
      }}
      onPress={disabled ? undefined : onPress}
      style={[styles.row, focused && styles.rowFocused, disabled && styles.disabled]}>
      {icon ? (
        <View style={[styles.iconBox, focused && styles.iconBoxFocused]}>
          <Icon name={icon} size={px(42.5)} color={focused ? '#fff' : danger ? colors.error : colors.textMid} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <Text style={[styles.label, {color: fg}]}>{label}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {value !== undefined ? (
        <Text style={[styles.value, focused && styles.valueFocused]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {nav ? <Icon name="chevronRight" size={px(28)} color={fg} /> : null}
    </Pressable>
  );
});

/** ‹ value ›: ←/→ step through the choices while the row has focus. */
export const StepperRow = forwardRef<
  View,
  {icon?: IconName; label: string; subtitle?: string; value: string; onStep: (dir: -1 | 1) => void}
>(function StepperRow({icon, label, subtitle, value, onStep}, ref) {
  const focused = useRef(false);
  useTVEventHandler(evt => {
    if (!focused.current || evt.eventKeyAction === 1) {
      return;
    }
    if (evt.eventType === 'left') {
      onStep(-1);
    } else if (evt.eventType === 'right') {
      onStep(1);
    }
  });
  return (
    <Row
      ref={ref}
      icon={icon}
      label={label}
      subtitle={subtitle}
      value={`‹  ${value}  ›`}
      onPress={() => onStep(1)}
      onFocusChange={f => {
        focused.current = f;
      }}
    />
  );
});

/**
 * Title + scrolling list. `first` is focused when the page mounts (and
 * again whenever `focusToken` changes, e.g. after a dialog closes).
 */
export function Page({
  title,
  first,
  focusToken = 0,
  children,
}: {
  title: string;
  first: React.RefObject<View | null>;
  focusToken?: number;
  children: React.ReactNode;
}) {
  useEffect(() => focusSoon(() => first.current), [first, focusToken]);
  const {width, height} = Dimensions.get('window');
  return (
    <View style={styles.page}>
      {/* AmbientGlowBackground: a violet glow above the middle. */}
      <Image source={GLOW} style={[StyleSheet.absoluteFill, {width, height}]} resizeMode="stretch" />
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.list}>{children}</ScrollView>
    </View>
  );
}

export function Note({text}: {text: string}) {
  return <Text style={styles.note}>{text}</Text>;
}

const GLOW = require('../../assets/image/settings_glow.png');

const styles = scaledStyles({
  page: {flex: 1},
  // Numbers from pileus-player's SettingsHeader / SettingsSectionHeader /
  // SettingsNavRow (AppScale.title 0.030·h, label 0.0265·h, caption 21).
  header: {paddingHorizontal: 32, paddingTop: 20, paddingBottom: 12},
  title: {color: colors.textHigh, fontSize: 32.4, fontWeight: '700'},
  list: {paddingHorizontal: 32, paddingBottom: 32},
  sectionRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 8, marginLeft: 24},
  tick: {width: 3, height: 12, borderRadius: 2, backgroundColor: 'rgba(124,106,247,0.7)'},
  section: {color: colors.textLow, fontSize: 21, fontWeight: '700', letterSpacing: 1.2},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 20,
    marginHorizontal: 16,
    marginVertical: 4,
    // SettingsNavRow: radius 14 and a 2-unit border on the 540 canvas (×2).
    borderRadius: 28,
    borderWidth: 4,
    borderColor: 'transparent',
    backgroundColor: colors.surface2,
  },
  rowFocused: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(124,106,247,0.18)',
    transform: [{scale: 1.02}],
  },
  disabled: {opacity: 0.5},
  iconBox: {padding: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.07)'},
  iconBoxFocused: {backgroundColor: 'rgba(124,106,247,0.35)'},
  rowText: {flex: 1},
  label: {fontSize: 28.6, fontWeight: '600'},
  subtitle: {color: colors.textLow, fontSize: 21, marginTop: 3},
  value: {color: colors.textLow, fontSize: 24, maxWidth: 520},
  valueFocused: {color: colors.textHigh},
  note: {color: colors.textLow, fontSize: 21, marginTop: 16, marginLeft: 24},
});
