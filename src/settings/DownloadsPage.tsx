// Impostazioni › Download (tv_downloads_screen.dart): the profile's
// server-side downloads. On a TV a finished one plays straight from the
// server (its signed file_url); nothing is copied to the device.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Text, View} from 'react-native';
import {TVFocusGuideView, useKeplerBackHandler} from '@amazon-devices/react-native-kepler';
import {FocusButton} from '../components/FocusButton';
import {mycelium} from '../core/api';
import {focusSoon} from '../core/focus';
import {downloadSubtitle, formatBytes, isCancellable} from '../downloads/format';
import type {DownloadInfo, ListDownloadsResponse} from '../gen/media';
import {emptyRequest, PlayRequest} from '../player/session';
import {errorText} from '../state/auth';
import {colors, font, scaledStyles, space} from '../theme';
import {Note, Page, Row, SectionHeader} from './ui';

const REFRESH_MS = 5000;

function ActionDialog({
  info,
  onWatch,
  onCancel,
  onDelete,
  onClose,
}: {
  info: DownloadInfo;
  onWatch?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const keplerBack = useKeplerBackHandler();
  const first = useRef<View>(null);
  useEffect(() => focusSoon(() => first.current), []);
  useEffect(() => {
    const sub = keplerBack.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [keplerBack, onClose]);
  return (
    <View style={styles.scrim}>
      <TVFocusGuideView style={styles.card} trapFocusLeft trapFocusRight trapFocusUp trapFocusDown>
        <Text style={styles.title} numberOfLines={2}>
          {info.seriesTitle ? `${info.seriesTitle} · ${info.title}` : info.title}
        </Text>
        <Text style={styles.message}>{downloadSubtitle(info)}</Text>
        <View style={styles.actions}>
          {onWatch ? <FocusButton ref={first} label="Guarda" primary onPress={onWatch} /> : null}
          {onCancel ? <FocusButton ref={onWatch ? undefined : first} label="Annulla download" onPress={onCancel} /> : null}
          {onDelete ? (
            <FocusButton ref={onWatch || onCancel ? undefined : first} label="Elimina" onPress={onDelete} />
          ) : null}
          <FocusButton label="Chiudi" onPress={onClose} />
        </View>
      </TVFocusGuideView>
    </View>
  );
}

export function DownloadsPage({onPlay, focusToken}: {onPlay: (req: PlayRequest) => void; focusToken: number}) {
  const first = useRef<View>(null);
  const [data, setData] = useState<ListDownloadsResponse | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<DownloadInfo | null>(null);
  const [refocus, setRefocus] = useState(0);

  const load = useCallback(async () => {
    try {
      setData(await mycelium.listDownloads());
      setError('');
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // While something is still being prepared, keep the list fresh.
  const active = data?.downloads.some(isCancellable) ?? false;
  useEffect(() => {
    if (!active) {
      return;
    }
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [active, load]);

  const close = () => {
    setOpen(null);
    setRefocus(t => t + 1);
  };
  const act = async (fn: () => Promise<unknown>) => {
    close();
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
    load();
  };

  const list = data?.downloads ?? [];
  const watch = (d: DownloadInfo) => {
    setOpen(null);
    onPlay(
      emptyRequest({
        pluginId: d.pluginId,
        streamId: d.mediaId || d.streamId,
        parentId: d.parentId,
        title: d.title,
        showTitle: d.seriesTitle,
        poster: d.poster,
        seasonNumber: d.seasonNumber,
        episodeNumber: d.episodeNumber,
        directUrl: d.fileUrl,
      }),
    );
  };

  return (
    <>
      <Page title="Download" first={first} focusToken={focusToken + refocus + (data ? 1 : 0)}>
        {!data && !error ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
        {error ? <Note text={`Impossibile caricare i download: ${error}`} /> : null}
        {data && !list.length ? (
          <Note text="Nessun download. I contenuti scaricati sul server compariranno qui." />
        ) : null}
        {list.length ? <SectionHeader title="Sul server" /> : null}
        {list.map((d, i) => (
          <Row
            key={d.downloadId}
            ref={i === 0 ? first : undefined}
            icon={d.status === 'completed' ? 'play' : 'arrowDown'}
            label={d.seriesTitle ? `${d.seriesTitle} · ${d.title}` : d.title}
            subtitle={downloadSubtitle(d)}
            onPress={() => setOpen(d)}
          />
        ))}
        {data && data.quotaBytes > 0 ? (
          <Note text={`Spazio usato ${formatBytes(data.usedBytes)} di ${formatBytes(data.quotaBytes)}`} />
        ) : data && data.serverFreeBytes > 0 ? (
          <Note text={`Spazio libero sul server: ${formatBytes(data.serverFreeBytes)}`} />
        ) : null}
      </Page>
      {open ? (
        <ActionDialog
          info={open}
          onClose={close}
          onWatch={open.status === 'completed' && open.fileUrl ? () => watch(open) : undefined}
          onCancel={isCancellable(open) ? () => act(() => mycelium.cancelDownload(open.downloadId)) : undefined}
          onDelete={!isCancellable(open) ? () => act(() => mycelium.deleteDownload(open.downloadId)) : undefined}
        />
      ) : null}
    </>
  );
}

const styles = scaledStyles({
  spinner: {marginTop: 40},
  scrim: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center'},
  card: {
    width: 900,
    padding: space.l,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {color: colors.textHigh, fontSize: font.title * 0.8, fontWeight: '700'},
  message: {color: colors.textMid, fontSize: font.body, marginTop: space.s},
  actions: {flexDirection: 'row', flexWrap: 'wrap', gap: space.m, marginTop: space.l},
});
