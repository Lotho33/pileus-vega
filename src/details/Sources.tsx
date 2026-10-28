// Stream sources of one item (GetStreams) and the buttons that start them:
// one "Guarda" for a single source, "SELEZIONA LINGUA" + one button per
// source otherwise (watch_button.dart / episode_popup.dart).

import React, {forwardRef, useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import {Icon, IconName} from '../components/Icon';
import {mycelium} from '../core/api';
import {focusSoon} from '../core/focus';
import {useWarm} from '../core/warm';
import type {StreamSource} from '../gen/media';
import {preferredFirst, parsePreferredLanguage} from '../core/language';
import {errorText, useAuth} from '../state/auth';
import {colors, scaledStyles} from '../theme';

export interface SourcesState {
  pluginId: string;
  sources: StreamSource[];
  loading: boolean;
  error: string;
  reload: () => void;
}

/**
 * GetStreams for one item, with the source the language rule picks first
 * (preferredFirst): it becomes the filled, auto-focused button. `seriesId`
 * (the CW parent_id) brings in the language last played for the series.
 */
export function useSources(pluginId: string, mediaId: string, seriesId = ''): SourcesState {
  const prefsJson = useAuth().profile?.preferencesJson ?? '';
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const s = await mycelium.getStreams(pluginId, mediaId);
      if (id === seq.current) {
        setSources(preferredFirst(s, {pluginId, seriesId, language: parsePreferredLanguage(prefsJson)}));
      }
    } catch (e) {
      if (id === seq.current) {
        setError(errorText(e));
      }
    } finally {
      if (id === seq.current) {
        setLoading(false);
      }
    }
  }, [pluginId, mediaId, seriesId, prefsJson]);
  useEffect(() => {
    reload();
  }, [reload]);
  return {pluginId, sources, loading, error, reload};
}

// Two sizes, as in pileus-player: the details page's watch button and the
// smaller PopupPlayButton of the popups.
export const PlayButton = forwardRef<
  View,
  {label: string; s: number; primary?: boolean; compact?: boolean; icon?: IconName; onPress: () => void}
>(function PlayButton({label, s, primary, compact, icon = 'play', onPress}, ref) {
    const [focused, setFocused] = useState(false);
    return (
      <Pressable
        ref={ref}
        accessibilityLabel={label}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPress={onPress}
        style={[
          styles.btn,
          compact
            ? {paddingHorizontal: 24 * s, paddingVertical: 12 * s, gap: 8 * s}
            : {paddingHorizontal: 40 * s, paddingVertical: 18 * s, gap: 8 * s},
          primary && styles.btnPrimary,
          focused && styles.btnFocused,
        ]}>
        <Icon name={icon} size={(compact ? 20 : 24) * s} color={colors.textHigh} />
        <Text style={[styles.btnText, {fontSize: (compact ? 15 : 20) * s}]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
});

/**
 * "Scarica": a secondary action beside the watch buttons, not a second one
 * of equal weight — ghost outline, smaller text (watch_button.dart's
 * _DownloadChip).
 */
/** "Scarica" next to the play buttons; the ref lets a closing dialog put focus back. */
export const DownloadChip = forwardRef<View, {s: number; onPress: () => void}>(function DownloadChip({s, onPress}, ref) {
  const [focused, setFocused] = useState(false);
  const color = focused ? colors.textHigh : colors.textMid;
  return (
    <Pressable
      ref={ref}
      accessibilityLabel="Scarica"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[
        styles.chip,
        {paddingHorizontal: 20 * s, paddingVertical: 10 * s, gap: 6 * s},
        focused && styles.chipFocused,
      ]}>
      <Icon name="arrowDown" size={16 * s} color={color} />
      <Text style={[styles.chipText, {fontSize: 15 * s, color}]}>Scarica</Text>
    </Pressable>
  );
});

/**
 * The buttons for `state`. `focus` moves focus to the first one once they
 * exist (pass a new number to ask again). `resumeLabel` puts a single
 * "Riprendi" button first, as the Flutter details page does.
 */
export function SourceButtons({
  state,
  s,
  focus,
  resumeLabel,
  onResume,
  resumeStreamId,
  onPlay,
  align = 'flex-start',
  compact,
  trailing,
}: {
  state: SourcesState;
  s: number;
  focus: number;
  resumeLabel?: string;
  onResume?: () => void;
  /** The stream "Riprendi" plays: it's the one prepared ahead of Play. */
  resumeStreamId?: string;
  onPlay: (src: StreamSource) => void;
  align?: 'flex-start' | 'center';
  compact?: boolean;
  /** Shown at the end of the button row once there are sources (DownloadChip). */
  trailing?: React.ReactNode;
}) {
  const first = useRef<View>(null);
  const ready = !state.loading;
  // What OK on the focused button plays: the resume stream, else the rule's
  // pick (the first source).
  useWarm(
    state.pluginId,
    !ready || state.error ? '' : resumeLabel && onResume ? resumeStreamId ?? '' : state.sources[0]?.id ?? '',
  );
  useEffect(() => {
    if (focus && ready) {
      return focusSoon(() => first.current);
    }
  }, [focus, ready, state.error]);

  if (state.loading) {
    return <ActivityIndicator color={colors.textLow} style={{alignSelf: align, marginVertical: 12 * s}} />;
  }
  if (resumeLabel && onResume) {
    return (
      <View style={[styles.wrap, {justifyContent: align, gap: 12 * s}]}>
        <PlayButton compact={compact} ref={first} label={resumeLabel} s={s} primary onPress={onResume} />
        {state.sources.length ? trailing : null}
      </View>
    );
  }
  if (state.error) {
    return (
      <View style={{alignItems: align}}>
        <Text style={[styles.note, {fontSize: 15 * s}]}>{state.error}</Text>
        <PlayButton compact={compact} ref={first} label="Riprova" s={s} onPress={state.reload} />
      </View>
    );
  }
  if (!state.sources.length) {
    return (
      <View style={{alignItems: align}}>
        <Text style={[styles.note, {fontSize: 15 * s}]}>Nessuna fonte disponibile.</Text>
        <PlayButton compact={compact} ref={first} label="Riprova" s={s} onPress={state.reload} />
      </View>
    );
  }
  if (state.sources.length === 1) {
    return (
      <View style={[styles.wrap, {justifyContent: align, gap: 12 * s}]}>
        <PlayButton compact={compact} ref={first} label="Guarda" s={s} primary onPress={() => onPlay(state.sources[0])} />
        {trailing}
      </View>
    );
  }
  return (
    <View style={{alignItems: align}}>
      <Text style={[styles.header, {fontSize: 13 * s, marginBottom: 12 * s}]}>SELEZIONA LINGUA</Text>
      <View style={[styles.wrap, {justifyContent: align, gap: 12 * s}]}>
        {state.sources.map((src, i) => (
          <PlayButton
            compact={compact}
            key={src.id}
            ref={i === 0 ? first : undefined}
            label={src.label || 'Guarda'}
            s={s}
            primary={i === 0}
            onPress={() => onPlay(src)}
          />
        ))}
        {trailing}
      </View>
    </View>
  );
}

const styles = scaledStyles({
  wrap: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center'},
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textLow,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  btnPrimary: {borderColor: 'transparent'},
  btnFocused: {backgroundColor: colors.primary, borderColor: colors.primary, transform: [{scale: 1.05}]},
  btnText: {color: colors.textHigh, fontWeight: '700'},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.textLow,
  },
  chipFocused: {backgroundColor: colors.primary, borderColor: colors.primary},
  chipText: {fontWeight: '600'},
  header: {color: colors.textLow, fontWeight: '700', letterSpacing: 1.5},
  note: {color: colors.textLow, marginBottom: 10},
});
