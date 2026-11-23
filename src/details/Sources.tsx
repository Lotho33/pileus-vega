// Stream sources of one item (GetStreams) and the buttons that start them:
// one "Guarda" for a single source, "SELEZIONA LINGUA" + one button per
// source otherwise (watch_button.dart / episode_popup.dart).

import React, {forwardRef, useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, View} from 'react-native';
import {Text} from '../components/Text';
import {Icon, IconName} from '../components/Icon';
import {mycelium} from '../core/api';
import {focusSoon} from '../core/focus';
import {useWarm} from '../core/warm';
import {useDownloaded} from '../downloads/downloadedIndex';
import type {StreamSource} from '../gen/media';
import {preferredFirst, parsePreferredLanguage} from '../core/language';
import {errorText, useAuth} from '../state/auth';
import {colors, px, scaledStyles} from '../theme';

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

// Two sizes, as in pileus-player: the details page's single watch button
// (watch_button.dart _buildSingleButton: "Guarda", "Riprendi «…»") and the
// PopupPlayButton used for one-per-language buttons and in the popups. Both
// are sized in 1080p pixels (sh × n/1080 there, px() here), not with the
// page's content scale; radius 8 and borders 1–2 are units of its 540-tall
// canvas, doubled. `s` is kept for the callers but no longer sizes them.
export const PlayButton = forwardRef<
  View,
  {label: string; s: number; primary?: boolean; compact?: boolean; icon?: IconName; onPress: () => void}
>(function PlayButton({label, primary, compact, icon = 'play', onPress}, ref) {
  const [focused, setFocused] = useState(false);
  const lit = focused || !!primary;
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
          ? [styles.popupBtn, primary && styles.popupPrimary, focused && styles.popupFocused]
          : [styles.bigBtn, focused && styles.bigFocused],
      ]}>
      <Icon name={icon} size={px(compact ? 20 : 24)} color={compact && !lit ? colors.textMid : colors.textHigh} />
      <Text
        style={[
          compact ? styles.popupText : styles.bigText,
          {color: compact && !lit ? colors.textMid : colors.textHigh},
        ]}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
});

/**
 * A secondary action beside the watch buttons ("Scarica", "La mia lista",
 * "Trailer"), not a second one of equal weight: ghost outline, smaller text
 * (details_actions.dart detailsSecondaryChip). The ref lets a closing dialog
 * put focus back.
 */
export const ActionChip = forwardRef<
  View,
  {s: number; icon: IconName; label: string; onPress: () => void; onFocusChange?: (focused: boolean) => void}
>(function ActionChip({icon, label, onPress, onFocusChange}, ref) {
  const [focused, setFocused] = useState(false);
  const color = focused ? colors.textHigh : colors.textMid;
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
      onPress={onPress}
      style={[styles.chip, focused && styles.chipFocused]}>
      <Icon name={icon} size={px(14)} color={color} />
      <Text style={[styles.chipText, {color}]}>{label}</Text>
    </Pressable>
  );
});

/**
 * "Scarica", or "Scaricato" for a title already downloaded or on its way
 * (still focusable, not offered again — watch_button.dart's _DownloadChip).
 */
export const DownloadChip = forwardRef<View, {s: number; pluginId: string; mediaId: string; onPress: () => void}>(
  function DownloadChip({s, pluginId, mediaId, onPress}, ref) {
    const done = useDownloaded(pluginId, mediaId);
    return done ? (
      <ActionChip ref={ref} s={s} icon="check" label="Scaricato" onPress={() => {}} />
    ) : (
      <ActionChip ref={ref} s={s} icon="arrowDown" label="Scarica" onPress={onPress} />
    );
  },
);

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
  actions,
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
  /**
   * After `trailing`, whatever the sources did (La mia lista, Trailer): the
   * chain Play → Scarica → La mia lista → Trailer, any of them missing.
   */
  actions?: React.ReactNode;
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
      <View style={[styles.wrap, {justifyContent: align, gap: px(24)}]}>
        <PlayButton compact={compact} ref={first} label={resumeLabel} s={s} primary onPress={onResume} />
        {state.sources.length ? trailing : null}
        {actions}
      </View>
    );
  }
  if (state.error) {
    return (
      <View style={{alignItems: align}}>
        <Text style={[styles.note, {fontSize: 15 * s}]}>{state.error}</Text>
        <View style={[styles.wrap, {justifyContent: align, gap: px(24)}]}>
          <PlayButton compact={compact} ref={first} label="Riprova" s={s} onPress={state.reload} />
          {actions}
        </View>
      </View>
    );
  }
  if (!state.sources.length) {
    return (
      <View style={{alignItems: align}}>
        <Text style={[styles.note, {fontSize: 15 * s}]}>Nessuna fonte disponibile.</Text>
        <View style={[styles.wrap, {justifyContent: align, gap: px(24)}]}>
          <PlayButton compact={compact} ref={first} label="Riprova" s={s} onPress={state.reload} />
          {actions}
        </View>
      </View>
    );
  }
  if (state.sources.length === 1) {
    return (
      <View style={[styles.wrap, {justifyContent: align, gap: px(24)}]}>
        {/* The details page says "Guarda" (_buildSingleButton); a popup's
            PopupPlayButton names the source, as for several. */}
        <PlayButton
          compact={compact}
          ref={first}
          label={(compact && state.sources[0].label) || 'Guarda'}
          s={s}
          primary
          onPress={() => onPlay(state.sources[0])}
        />
        {trailing}
        {actions}
      </View>
    );
  }
  return (
    <View style={{alignItems: align}}>
      <Text style={styles.header}>SELEZIONA LINGUA</Text>
      <View style={[styles.wrap, {justifyContent: align, gap: px(24)}]}>
        {state.sources.map((src, i) => (
          // One per language: PopupPlayButton on the details page too.
          <PlayButton
            compact
            key={src.id}
            ref={i === 0 ? first : undefined}
            label={src.label || 'Guarda'}
            s={s}
            primary={i === 0}
            onPress={() => onPlay(src)}
          />
        ))}
        {trailing}
        {actions}
      </View>
    </View>
  );
}

const styles = scaledStyles({
  wrap: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center'},
  btn: {flexDirection: 'row', alignItems: 'center'},
  // _buildSingleButton: padding 40/18, white 24% with a textLow border;
  // focused: the primary color, no border.
  bigBtn: {
    paddingHorizontal: 40,
    paddingVertical: 18,
    gap: 8,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.textLow,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  bigFocused: {backgroundColor: colors.primary, borderColor: colors.primary},
  bigText: {fontSize: 20, fontWeight: '700'},
  // PopupPlayButton: padding 24/12; the preferred language tinted primary,
  // the others white 12%; focused: primary with a white border.
  popupBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 8,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(242,242,240,0.12)',
  },
  popupPrimary: {borderColor: colors.primary, backgroundColor: 'rgba(124,106,247,0.55)'},
  popupFocused: {borderWidth: 4, borderColor: '#fff', backgroundColor: colors.primary},
  popupText: {fontSize: 15, fontWeight: '600'},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.textLow,
  },
  chipFocused: {backgroundColor: colors.primary, borderColor: colors.primary},
  chipText: {fontSize: 14, fontWeight: '600'},
  // 11 type, w700, letterSpacing 1.5 units, 12 units above the buttons.
  header: {color: colors.textLow, fontSize: 11, fontWeight: '700', letterSpacing: 3, marginBottom: 24},
  note: {color: colors.textLow, marginBottom: 10},
});
