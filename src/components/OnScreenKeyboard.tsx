// D-pad on-screen keyboard, port of pileus-player's on_screen_keyboard.dart.
// Vega's system keyboard covers the whole screen (live search results can't
// show under it), so every field in the app types through this instead.
// Spatial focus between keys is left to the native focus engine.

import React, {forwardRef, memo, useEffect, useRef, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {focusSoon} from '../core/focus';
import {colors, px, scaledStyles} from '../theme';

export type KeyboardLayout =
  /** Letters with shift + a 123 symbols layer, for free text. */
  | 'text'
  /** Letters locked to caps, no shift (search is case-insensitive). */
  | 'search'
  /** Digits first, lowercase, . - : / — host/IP/URL. */
  | 'host'
  /** 0-9 + A-Z only — the Mycelium pairing code. */
  | 'code'
  /** Phone keypad — profile PIN. */
  | 'digits';

const BACKSPACE = '⌫';
const SPACE = 'Spazio';
const ENTER = 'Invio';
const SHIFT = '⇧';
const SYMBOLS = '123';
const LETTERS = 'ABC';
const SPECIAL = new Set([BACKSPACE, SPACE, ENTER, SHIFT, SYMBOLS, LETTERS]);
const FOCUS_SCALE = 1.06;

interface KeyDef {
  label: string;
  flex: number;
}

const chars = (s: string, upper = false): KeyDef[] =>
  s.split('').map(c => ({label: upper ? c.toUpperCase() : c, flex: 1}));
const special = (label: string, flex: number): KeyDef => ({label, flex});

export function keyboardRows(
  layout: KeyboardLayout,
  opts: {shift: boolean; symbols: boolean; showEnter: boolean},
): KeyDef[][] {
  const enter = (flex: number) => (opts.showEnter ? [special(ENTER, flex)] : []);
  switch (layout) {
    case 'digits':
      return [chars('123'), chars('456'), chars('789'), [special(BACKSPACE, 1), ...chars('0'), ...enter(1)]];
    case 'code':
      return [
        chars('1234567890'),
        chars('ABCDEFG'),
        chars('HIJKLMN'),
        chars('OPQRSTU'),
        chars('VWXYZ'),
        [special(BACKSPACE, 3), ...enter(3)],
      ];
    case 'host':
      return [
        chars('1234567890'),
        chars('abcdefghij'),
        chars('klmnopqrst'),
        chars('uvwxyz'),
        [...chars('.-:/'), special(BACKSPACE, 2), ...enter(2)],
      ];
    default:
      if (opts.symbols) {
        return [
          chars('1234567890'),
          chars('-_.,:;!?'),
          chars('@#$%&*+='),
          chars('()[]{}/\\'),
          [special(LETTERS, 3), special(BACKSPACE, 3), ...enter(3)],
          [special(SPACE, 7)],
        ];
      }
      {
        const upper = layout === 'search' || opts.shift;
        return [
          chars('abcdefg', upper),
          chars('hijklmn', upper),
          chars('opqrstu', upper),
          chars('vwxyz', upper),
          [
            ...(layout === 'search' ? [] : [special(SHIFT, 2)]),
            special(SYMBOLS, 2),
            special(BACKSPACE, 2),
            ...enter(2),
          ],
          [special(SPACE, 7)],
        ];
      }
  }
}

interface KeyProps {
  def: KeyDef;
  active: boolean;
  focusable: boolean;
  preferred: boolean;
  height: number;
  /** Space between keys: the focused key may grow into half of it. */
  gap: number;
  onFocus: () => void;
  onPress: () => void;
}

const Key = memo(
  forwardRef<View, KeyProps>(function Key({def, active, focusable, preferred, height, gap, onFocus, onPress}, ref) {
  const [focused, setFocused] = useState(false);
  const [width, setWidth] = useState(0);
  const isSpecial = SPECIAL.has(def.label);
  // AppScale.focusScaleIcon (1.06), but growing into less than a third of
  // the gap on each side: keys stretch with the keyboard (≈250 px each on
  // the full search page), and a fixed scale made the focused key overlap
  // its neighbours — under the right/lower ones, which draw later.
  const scale = width > 0 ? Math.min(FOCUS_SCALE, 1 + (0.6 * gap) / width, 1 + (0.6 * gap) / height) : 1;
  return (
    <Pressable
      ref={ref}
      focusable={focusable}
      hasTVPreferredFocus={preferred}
      accessibilityLabel={def.label}
      onFocus={() => {
        setFocused(true);
        onFocus();
      }}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      style={[
        styles.key,
        {flex: def.flex, height},
        active && styles.keyActive,
        focused && styles.keyFocused,
        // Wide keys show focus with the border only, as in Flutter.
        focused && def.flex === 1 && {transform: [{scale}]},
      ]}>
      <Text style={[styles.label, {fontSize: height * (isSpecial ? 0.36 : 0.46)}, isSpecial && styles.special]}>
        {def.label}
      </Text>
    </Pressable>
  );
  }),
);

export function OnScreenKeyboard({
  value,
  onChange,
  layout,
  onSubmit,
  showEnter = true,
  maxLength,
  focusable = true,
  takeFocus = false,
  focusToken = 0,
  onKeyFocus,
  keyHeight = px(60),
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  layout: KeyboardLayout;
  onSubmit?: () => void;
  showEnter?: boolean;
  maxLength?: number;
  focusable?: boolean;
  /** First key grabs focus on mount. */
  takeFocus?: boolean;
  /** A new value moves focus to the first key. */
  focusToken?: number;
  /** A key got focus (row index), e.g. to know focus is in the keyboard. */
  onKeyFocus?: (row: number) => void;
  keyHeight?: number;
  width: number;
}) {
  const [shift, setShift] = useState(false);
  const [symbols, setSymbols] = useState(false);
  // After a layer switch the keys remount; land on the control row near
  // the toggle just pressed instead of the first key.
  const [land, setLand] = useState<{row: number; col: number} | null>(
    takeFocus ? {row: 0, col: 0} : null,
  );
  const rows = keyboardRows(layout, {shift, symbols, showEnter});
  const refs = useRef(new Map<string, View>());

  useEffect(() => {
    if (!land) {
      return;
    }
    return focusSoon(() => refs.current.get(`${land.row}:${land.col}`) ?? refs.current.get('0:0'));
  }, [land]);
  useEffect(() => {
    if (focusToken) {
      return focusSoon(() => refs.current.get('0:0'));
    }
  }, [focusToken]);

  const put = (next: string) => onChange(maxLength ? next.slice(0, maxLength) : next);

  const press = (label: string) => {
    switch (label) {
      case BACKSPACE:
        onChange(Array.from(value).slice(0, -1).join(''));
        return;
      case SPACE:
        put(value + ' ');
        return;
      case ENTER:
        onSubmit?.();
        return;
      case SHIFT:
        setShift(s => !s);
        return;
      case SYMBOLS:
      case LETTERS: {
        const toSymbols = label === SYMBOLS;
        setSymbols(toSymbols);
        const next = keyboardRows(layout, {shift, symbols: toSymbols, showEnter});
        setLand({row: next.length - 2, col: toSymbols ? 0 : 1});
        return;
      }
      default:
        put(value + label);
    }
  };

  const gap = keyHeight * 0.2;
  return (
    <View style={{width, gap}}>
      {rows.map((row, r) => (
        // The layer is part of the key so a switch remounts (and re-runs
        // hasTVPreferredFocus); shift keeps the same keys mounted.
        <View key={`${symbols ? 's' : 'l'}${r}`} style={[styles.row, {gap}]}>
          {row.map((def, c) => (
            <Key
              key={c}
              ref={(v: View | null) => {
                if (v) {
                  refs.current.set(`${r}:${c}`, v);
                } else {
                  refs.current.delete(`${r}:${c}`);
                }
              }}
              def={def}
              active={def.label === SHIFT && shift}
              focusable={focusable}
              preferred={focusable && land?.row === r && land.col === c}
              height={keyHeight}
              gap={gap}
              onFocus={() => onKeyFocus?.(r)}
              onPress={() => press(def.label)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = scaledStyles({
  row: {flexDirection: 'row', justifyContent: 'center'},
  key: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surface2,
  },
  keyActive: {backgroundColor: 'rgba(124,106,247,0.35)'},
  keyFocused: {borderColor: colors.primary, backgroundColor: '#2A2A48'},
  label: {color: '#fff'},
  special: {fontWeight: '600'},
});
