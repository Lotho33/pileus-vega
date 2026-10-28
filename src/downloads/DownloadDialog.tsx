// "Scarica" options (tv_download_options_screen.dart, condensed): source,
// quality, audio and subtitle tracks, when to run, then CreateDownload. The
// server prepares one MKV file; the TV later plays it from Impostazioni ›
// Download. For an episode the "Episodi" row can widen it to the whole
// season or the next few episodes (one CreateDownloads with the same
// choices, each episode on the source with the same label). Focus is
// trapped; Back closes.

import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, ScrollView, Text, View} from 'react-native';
import {TVFocusGuideView, useKeplerBackHandler} from '@amazon-devices/react-native-kepler';
import {FocusButton} from '../components/FocusButton';
import {mycelium} from '../core/api';
import {focusSoon} from '../core/focus';
import type {DownloadOptionsResponse, StreamSource} from '../gen/media';
import {Note, Row, SectionHeader, StepperRow} from '../settings/ui';
import {pickSourceByLabel} from '../player/episodes';
import type {BatchGroup, DownloadMeta} from './batch';
import {errorText} from '../state/auth';
import {colors, font, scaledStyles, space} from '../theme';
import {
  formatBytes,
  formatEta,
  formatVariantSize,
  qualityBelowUsualWarning,
  retentionLabel,
  totalEstimatedBytes,
} from './format';


export function DownloadDialog({
  pluginId,
  sources,
  meta,
  batch = [],
  onClose,
}: {
  pluginId: string;
  sources: StreamSource[];
  meta: DownloadMeta;
  /** Episodes only: wider choices offered in the "Episodi" row. */
  batch?: BatchGroup[];
  onClose: (message?: string) => void;
}) {
  const keplerBack = useKeplerBackHandler();
  const first = useRef<View>(null);
  const [srcIdx, setSrcIdx] = useState(0);
  const [opts, setOpts] = useState<DownloadOptionsResponse | null>(null);
  const [error, setError] = useState('');
  const [variantIdx, setVariantIdx] = useState(0);
  const [audio, setAudio] = useState<Set<string>>(new Set());
  const [subs, setSubs] = useState<Set<string>>(new Set());
  const [preferred, setPreferred] = useState(false);
  const [upgrade, setUpgrade] = useState(true);
  const [busy, setBusy] = useState(false);
  /** -1: only this item; otherwise an index into `batch`. */
  const [groupIdx, setGroupIdx] = useState(-1);
  const group = groupIdx >= 0 ? batch[groupIdx] : undefined;

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const sub = keplerBack.addEventListener('hardwareBackPress', () => {
      closeRef.current();
      return true;
    });
    return () => sub.remove();
  }, [keplerBack]);

  const cancelRef = useRef<View>(null);
  const source = sources[srcIdx];
  useEffect(() => {
    if (!source) {
      return;
    }
    let alive = true;
    setOpts(null);
    setError('');
    mycelium
      .getDownloadOptions(pluginId, source.id)
      .then(o => {
        if (!alive) {
          return;
        }
        setOpts(o);
        setVariantIdx(0);
        setAudio(new Set(o.audio.filter(a => a.isDefault).map(a => a.id)));
        setSubs(new Set());
        setPreferred(o.qualityBelowUsual && !!o.preferredHours);
      })
      .catch(e => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [pluginId, source]);

  const toggle = (set: Set<string>, id: string, put: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(id)) {
      n.delete(id);
    } else {
      n.add(id);
    }
    put(n);
  };

  // First row once there is one; Annulla when the item can't be downloaded.
  const ready = !!opts || !!error;
  const canStart = !!opts?.available;
  useEffect(() => {
    if (sources.length > 1 || (ready && canStart)) {
      return focusSoon(() => first.current);
    }
    if (ready) {
      return focusSoon(() => cancelRef.current);
    }
  }, [ready, canStart, sources.length]);

  const variant = opts?.variants[variantIdx];
  const chosenAudio = opts?.audio.filter(a => audio.has(a.id)) ?? [];
  const total = totalEstimatedBytes(variant, chosenAudio) * (group?.episodes.length ?? 1);
  const notes = opts
    ? [
        opts.pluginNote,
        opts.pluginNotice,
        qualityBelowUsualWarning(opts.qualityBelowUsual, opts.usualMaxHeight, opts.variants[0]?.height ?? 0),
        total > 0 ? `Circa ${formatBytes(total)}${formatEta(total, opts.bytesPerSec) ? `, ${formatEta(total, opts.bytesPerSec)} di preparazione` : ''}` : '',
        opts.serverFreeBytes > 0 ? `Spazio libero sul server: ${formatBytes(opts.serverFreeBytes)}` : '',
        retentionLabel(opts.retentionDays),
      ].filter(Boolean)
    : [];

  const start = async () => {
    if (!source || !opts?.available || busy) {
      return;
    }
    setBusy(true);
    try {
      if (group) {
        const n = await startBatch(group);
        onClose(
          n === 0
            ? 'Nessun episodio con una sorgente disponibile.'
            : `${n} download ${preferred ? `programmati (${opts.preferredHours})` : 'avviati'}: li trovi in Impostazioni › Download.`,
        );
        return;
      }
      await mycelium.createDownload({
        pluginId,
        streamId: source.id,
        variantId: variant?.id ?? '',
        audioIds: [...audio],
        subtitleIds: [...subs],
        usePreferredHours: preferred,
        upgradeIfBetter: opts.qualityBelowUsual && upgrade,
        ...meta,
      });
      onClose(preferred ? `Download programmato (${opts.preferredHours}).` : 'Download avviato: lo trovi in Impostazioni › Download.');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  // Each other episode on the source with this one's label; an episode
  // without sources (or whose lookup fails) is left out.
  const startBatch = async (g: BatchGroup): Promise<number> => {
    const items = [];
    for (const ep of g.episodes) {
      let streamId = '';
      if (ep.mediaId === meta.mediaId) {
        streamId = source.id;
      } else {
        try {
          streamId = pickSourceByLabel(await mycelium.getStreams(pluginId, ep.mediaId), source.label)?.id ?? '';
        } catch {
          streamId = '';
        }
      }
      if (streamId) {
        items.push({...ep, streamId});
      }
    }
    if (!items.length) {
      return 0;
    }
    const r = await mycelium.createDownloads({
      pluginId,
      items,
      variantId: variant?.id ?? '',
      audioIds: [...audio],
      subtitleIds: [...subs],
      usePreferredHours: preferred,
      upgradeIfBetter: !!opts?.qualityBelowUsual && upgrade,
    });
    return r.downloads.length || items.length;
  };

  return (
    <View style={styles.scrim}>
      <TVFocusGuideView style={styles.card} trapFocusLeft trapFocusRight trapFocusUp trapFocusDown>
        <Text style={styles.title} numberOfLines={1}>
          Scarica · {meta.seriesTitle ? `${meta.seriesTitle} · ${meta.title}` : meta.title}
        </Text>
        <ScrollView style={styles.body}>
          {sources.length > 1 ? (
            <StepperRow
              ref={first}
              label="Lingua"
              value={source?.label || `Sorgente ${srcIdx + 1}`}
              onStep={d => setSrcIdx(i => (i + d + sources.length) % sources.length)}
            />
          ) : null}
          {!opts && !error ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
          {error ? <Note text={error} /> : null}
          {opts && !opts.available ? <Note text={opts.unavailableReason || 'Questo contenuto non si può scaricare.'} /> : null}
          {opts?.available ? (
            <>
              {opts.variants.length ? (
                <StepperRow
                  ref={sources.length > 1 ? undefined : first}
                  label="Qualità"
                  value={variant ? `${variant.label || `${variant.height}p`} · ${formatVariantSize(variant)}` : '—'}
                  onStep={d => setVariantIdx(i => (i + d + opts.variants.length) % opts.variants.length)}
                />
              ) : null}
              {batch.length ? (
                <StepperRow
                  label="Episodi"
                  value={group ? group.label : 'Solo questo episodio'}
                  onStep={d => setGroupIdx(i => ((i + 1 + d + batch.length + 1) % (batch.length + 1)) - 1)}
                />
              ) : null}
              {opts.audio.length ? <SectionHeader title="Audio" /> : null}
              {opts.audio.map(a => (
                <Row
                  key={a.id}
                  label={a.name || a.language || 'Traccia'}
                  value={audio.has(a.id) ? 'Sì' : 'No'}
                  onPress={() => toggle(audio, a.id, setAudio)}
                />
              ))}
              {opts.subtitles.length ? <SectionHeader title="Sottotitoli" /> : null}
              {opts.subtitles.map(t => (
                <Row
                  key={t.id}
                  label={t.name || t.language || 'Sottotitoli'}
                  value={subs.has(t.id) ? 'Sì' : 'No'}
                  onPress={() => toggle(subs, t.id, setSubs)}
                />
              ))}
              {opts.preferredHours ? (
                <>
                  <SectionHeader title="Quando" />
                  <StepperRow
                    label="Avvio"
                    value={preferred ? `Nelle ore consigliate (${opts.preferredHours})` : 'Subito'}
                    onStep={() => setPreferred(p => !p)}
                  />
                </>
              ) : null}
              {opts.qualityBelowUsual ? (
                <Row
                  label="Riprova per una qualità migliore"
                  subtitle="Fino a 3 tentativi nelle ore consigliate"
                  value={upgrade ? 'Sì' : 'No'}
                  onPress={() => setUpgrade(u => !u)}
                />
              ) : null}
              {notes.map(n => (
                <Note key={n} text={n} />
              ))}
            </>
          ) : null}
        </ScrollView>
        <View style={styles.actions}>
          <FocusButton ref={cancelRef} label="Annulla" onPress={() => onClose()} />
          {opts?.available ? (
            <FocusButton label={group ? `Scarica ${group.episodes.length}` : 'Scarica'} primary busy={busy} onPress={start} />
          ) : null}
        </View>
      </TVFocusGuideView>
    </View>
  );
}

const styles = scaledStyles({
  scrim: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center'},
  card: {
    width: 1100,
    maxHeight: 980,
    padding: space.l,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {color: colors.textHigh, fontSize: font.title * 0.8, fontWeight: '700', marginBottom: space.s},
  body: {maxHeight: 760},
  spinner: {marginVertical: 30},
  actions: {flexDirection: 'row', justifyContent: 'flex-end', gap: space.m, marginTop: space.m},
});
