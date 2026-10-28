// One page of the details stack (details_screen.dart's _DetailsContent):
// loads GetDetails and picks the layout by media kind:
// - live: the live popup (a live folder browses);
// - anime film (AniList/MAL ids, not a folder): MovieLayout in anime mode;
// - folder with seasons: SeriesLayout; folder without: its contents
//   (BrowseScreen), like Flutter's pushReplacement to /browse;
// - anything else: MovieLayout.
// Targets marked view 'browse' / 'episode' skip GetDetails and show the
// folder or the episode page directly. Related titles open a quick-look
// popup first ("Vai ai dettagli" pushes the page). Playing goes through
// onPlay to the PlayerScreen.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {TVFocusGuideView, useKeplerBackHandler} from '@amazon-devices/react-native-kepler';
import {FocusButton} from '../components/FocusButton';
import {mycelium} from '../core/api';
import * as perf from '../core/perf';
import {focusSoon} from '../core/focus';
import type {ContinueWatchingItem, DetailsResponse} from '../gen/media';
import {useHomeLayout} from '../home/layout';
import type {CardModel, OpenTarget} from '../home/model';
import {emptyRequest, PlayRequest} from '../player/session';
import {errorText} from '../state/auth';
import {colors, scaledStyles} from '../theme';
import {BrowseScreen} from './BrowseScreen';
import {EpisodeScreen} from './EpisodeScreen';
import {isAnimeItem} from './format';
import {InfoPopup} from './InfoPopup';
import {LivePopup} from './LivePopup';
import {MovieLayout} from './MovieLayout';
import {SeriesLayout} from './SeriesLayout';

// Focus goes back to the related card once the popup's focus trap is gone.
const REFOCUS_AFTER_HIDE_MS = 50;

export function DetailsScreen({
  target,
  cw,
  onBack,
  onOpen,
  onPlay,
  refocus = 0,
  covered = false,
  canDownload = false,
}: {
  target: OpenTarget;
  /** Bumped when something on top (the player) closes: focus comes back. */
  refocus?: number;
  /** The player is open on top: focus that strays here is ignored. */
  covered?: boolean;
  /** The plugin supports server-side downloads ("download" capability). */
  canDownload?: boolean;
  cw: ContinueWatchingItem[];
  onBack: () => void;
  onPlay: (req: PlayRequest) => void;
  /** Open another item (related titles, folder children) on top of this page. */
  onOpen: (card: CardModel) => void;
}) {
  useEffect(() => perf.enterScreen('details'), []);
  const L = useHomeLayout();
  const keplerBack = useKeplerBackHandler();
  const direct = target.view === 'browse' || target.view === 'episode';
  const [res, setRes] = useState<DetailsResponse | null>(null);
  const [error, setError] = useState('');
  const [peek, setPeek] = useState<CardModel | null>(null);
  const [relatedRefocus, setRelatedRefocus] = useState(0);
  const retryRef = useRef<View>(null);

  const load = useCallback(async () => {
    setError('');
    setRes(null);
    try {
      setRes(await mycelium.getDetails(target.pluginId, target.mediaId));
    } catch (e) {
      setError(errorText(e));
      focusSoon(() => retryRef.current);
    }
  }, [target.pluginId, target.mediaId]);

  useEffect(() => {
    if (!direct) {
      load();
    }
  }, [load, direct]);

  // Registered once: popups inside the layouts add newer listeners that
  // take Back first while they're open.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  useEffect(() => {
    const sub = keplerBack.addEventListener('hardwareBackPress', () => {
      onBackRef.current();
      return true;
    });
    return () => sub.remove();
  }, [keplerBack]);

  const closePeek = useCallback(() => {
    setPeek(null);
    setTimeout(() => setRelatedRefocus(t => t + 1), REFOCUS_AFTER_HIDE_MS);
  }, []);

  const layoutCovered = covered || !!peek;
  const browse = (title: string) => (
    <BrowseScreen
      pluginId={target.pluginId}
      parentId={target.mediaId}
      title={title}
      L={L}
      onBack={onBack}
      onOpen={onOpen}
      onPlay={onPlay}
      refocus={refocus}
    />
  );

  let body: React.ReactNode;
  if (target.view === 'browse') {
    body = browse(target.title);
  } else if (target.view === 'episode') {
    body = (
      <EpisodeScreen
        pluginId={target.pluginId}
        mediaId={target.mediaId}
        showTitle={target.showTitle ?? ''}
        nav={target.nav}
        sourceLabel={target.sourceLabel}
        L={L}
        cw={cw}
        refocus={refocus}
        canDownload={canDownload}
        onBack={onBack}
        onPlay={onPlay}
      />
    );
  } else if (error) {
    body = (
      <View style={styles.center}>
        <Text style={styles.title}>Impossibile caricare il contenuto</Text>
        <Text style={styles.message}>{error}</Text>
        <View style={styles.actions}>
          <FocusButton ref={retryRef} label="Riprova" primary onPress={load} hasTVPreferredFocus />
          <FocusButton label="Indietro" onPress={onBack} />
        </View>
      </View>
    );
  } else if (!res?.item) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.textHigh} />
      </View>
    );
  } else {
    const item = res.item;
    const seasons = res.series?.seasons ?? [];
    const common = {pluginId: target.pluginId, item, L, refocus, onBack, onPlay};
    const layout = {
      ...common,
      cw,
      covered: layoutCovered,
      canDownload,
      onOpenRelated: setPeek,
      relatedRefocus,
    };
    if (item.mediaType === 'live') {
      body = item.isDir ? (
        browse(item.title)
      ) : (
        <LivePopup
          pluginId={target.pluginId}
          item={item}
          onClose={onBack}
          onPlay={(src, all) =>
            onPlay(
              emptyRequest({
                pluginId: target.pluginId,
                streamId: src.id,
                sourceLabel: src.label,
                title: item.title,
                poster: item.posterUrl,
                isLive: true,
                sources: all,
              }),
            )
          }
        />
      );
    } else if (isAnimeItem(item) && !item.isDir) {
      body = <MovieLayout {...layout} movie={res.movie} series={res.series} anime />;
    } else if (item.isDir && !seasons.length) {
      body = browse(item.title);
    } else if (item.isDir) {
      body = <SeriesLayout {...layout} series={res.series} seasons={seasons} />;
    } else {
      body = <MovieLayout {...layout} movie={res.movie} />;
    }
  }

  // Trapped: the home or search underneath stays mounted with its focusables.
  return (
    <TVFocusGuideView style={styles.root} trapFocusLeft trapFocusRight trapFocusUp trapFocusDown>
      {body}
      {peek ? (
        <InfoPopup
          pluginId={peek.open.pluginId}
          mediaId={peek.open.mediaId}
          title={peek.title}
          poster={peek.image}
          relLabel={peek.badge ? peek.badge.charAt(0) + peek.badge.slice(1).toLowerCase() : ''}
          W={L.W}
          H={L.H}
          onNavigate={() => {
            setPeek(null);
            onOpen(peek);
          }}
          onClose={closePeek}
        />
      ) : null}
    </TVFocusGuideView>
  );
}

const styles = scaledStyles({
  root: {...StyleSheet.absoluteFillObject, backgroundColor: colors.bg},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 64},
  title: {color: colors.textHigh, fontSize: 36, fontWeight: '700', textAlign: 'center'},
  message: {color: colors.textMid, fontSize: 24, marginTop: 16, textAlign: 'center'},
  actions: {flexDirection: 'row', gap: 24, marginTop: 40},
});
