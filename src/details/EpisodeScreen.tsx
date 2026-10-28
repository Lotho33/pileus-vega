// One episode on its own page (episode_detail_screen.dart): reached from a
// folder of anime episodes, and from the player when the next episode has no
// source to switch to in place. Still on the left, show / title / meta /
// plot on the right, then the source buttons (with resume from Continue
// Watching) and, when the plugin supports it, "Scarica" with the season and
// next-episodes batches. GetDetails of the show fills genres, plot and the
// cover the player shows.

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Image, StyleSheet, Text, View} from 'react-native';
import {mycelium} from '../core/api';
import {backdropSrc} from '../core/images';
import {batchGroups, DownloadMeta} from '../downloads/batch';
import {DownloadDialog} from '../downloads/DownloadDialog';
import type {CatalogItem, ContinueWatchingItem, EpisodeDetails} from '../gen/media';
import type {HomeLayout} from '../home/layout';
import type {EpisodeNav} from '../player/episodes';
import {emptyRequest, PlayRequest} from '../player/session';
import {focusSoon} from '../core/focus';
import {colors, scaledStyles} from '../theme';
import {BackButton, Backdrop, catalogHPadRatio, GenreChips, MetaRow} from './common';
import {fmtAirDate} from './format';
import {DownloadChip, SourceButtons, useSources} from './Sources';

interface ShowMeta {
  genres: string[];
  plot: string;
  poster: string;
  cover: string;
  fanart: string;
}

export function EpisodeScreen({
  pluginId,
  mediaId,
  showTitle,
  nav,
  sourceLabel = '',
  L,
  cw,
  refocus,
  canDownload,
  onBack,
  onPlay,
}: {
  pluginId: string;
  mediaId: string;
  showTitle: string;
  nav?: EpisodeNav;
  /** Put this source first (same language as the episode before). */
  sourceLabel?: string;
  L: HomeLayout;
  cw: ContinueWatchingItem[];
  refocus: number;
  canDownload: boolean;
  onBack: () => void;
  onPlay: (req: PlayRequest) => void;
}) {
  const {W, H} = L;
  const s = H / 1080;
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [ep, setEp] = useState<EpisodeDetails | null>(null);
  const [show, setShow] = useState<ShowMeta | null>(null);
  const [failed, setFailed] = useState(false);
  const [download, setDownload] = useState(false);
  const chipRef = useRef<View>(null);
  const [note, setNote] = useState('');
  const raw = useSources(pluginId, mediaId);

  // The label played before goes first, so its button has focus.
  const sources = useMemo(() => {
    const l = sourceLabel.toLowerCase();
    const i = l ? raw.sources.findIndex(x => x.label.toLowerCase() === l) : -1;
    if (i <= 0) {
      return raw;
    }
    const list = [raw.sources[i], ...raw.sources.slice(0, i), ...raw.sources.slice(i + 1)];
    return {...raw, sources: list};
  }, [raw, sourceLabel]);

  useEffect(() => {
    let alive = true;
    mycelium
      .getDetails(pluginId, mediaId)
      .then(r => {
        if (!alive || !r.item) {
          return;
        }
        setItem(r.item);
        setEp(r.episode ?? null);
        const showId = r.item.showId || r.episode?.showId || '';
        if (showId) {
          mycelium
            .getDetails(pluginId, showId)
            .then(
              sr =>
                alive &&
                setShow({
                  genres: sr.series?.genres ?? [],
                  plot: sr.series?.plot ?? '',
                  poster: sr.item?.posterUrl ?? '',
                  cover: sr.item?.extra?.cover_url ?? '',
                  fanart: sr.series?.fanartUrl || sr.item?.extra?.fanart_url || '',
                }),
            )
            .catch(() => {});
        }
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [pluginId, mediaId]);

  const entry = nav?.episodes[nav.index];
  const title = item?.title || entry?.title || '';
  const seasonNumber = item?.seasonNumber || ep?.seasonNumber || entry?.seasonNumber || 0;
  const episodeNumber = item?.episodeNumber || ep?.episodeNumber || entry?.episodeNumber || 0;
  const still = ep?.thumbnailUrl || item?.posterUrl || entry?.thumb || '';
  const fallbackPoster = show?.cover || show?.poster || nav?.seriesPoster || '';
  const plot = ep?.plot || item?.extra?.plot || '';
  const rating = ep?.vote || item?.rating || 0;
  const parentId = item?.showId || ep?.showId || '';

  const resume = cw.find(
    c => c.pluginId === pluginId && c.progressTime > 0 && raw.sources.some(src => src.id === c.mediaId),
  );
  const base = emptyRequest({
    pluginId,
    parentId,
    title,
    showTitle,
    poster: still || fallbackPoster,
    plot: show?.plot || plot,
    genres: show?.genres ?? [],
    rating,
    year: item?.year || ep?.year || 0,
    seasonNumber,
    episodeNumber,
    sources: raw.sources,
    nav,
  });

  const metaOf = (e: {id: string; title: string; thumb: string; seasonNumber: number; episodeNumber: number}): DownloadMeta => ({
    mediaId: e.id,
    parentId,
    title: e.title || `Episodio ${e.episodeNumber}`,
    seriesTitle: showTitle,
    poster: e.thumb || fallbackPoster,
    seasonNumber: e.seasonNumber,
    episodeNumber: e.episodeNumber,
  });
  const meta = metaOf({id: mediaId, title, thumb: still, seasonNumber, episodeNumber});
  const batch = nav ? batchGroups(nav.episodes.map(metaOf), nav.index) : [];

  const hPad = W * catalogHPadRatio;
  const stillW = W * 0.36;
  const metaExtra = [
    seasonNumber > 0 && episodeNumber > 0 ? `S${seasonNumber} · E${episodeNumber}` : episodeNumber > 0 ? `Ep. ${episodeNumber}` : '',
    ep?.airDate ? fmtAirDate(ep.airDate) : '',
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <View style={styles.root}>
      <Backdrop url={show?.fanart || still || fallbackPoster} W={W} shade="movieShade" />
      <View style={{paddingHorizontal: 40 * s, paddingTop: 24 * s, height: 72 * s}}>
        <BackButton s={s} onPress={onBack} />
      </View>
      {!item && !failed ? (
        <ActivityIndicator size="large" color={colors.textHigh} style={styles.spinner} />
      ) : (
        <View style={[styles.main, {paddingHorizontal: hPad, paddingTop: 40 * s, gap: 40 * s}]}>
          <View style={[styles.still, {width: stillW, height: (stillW * 9) / 16}]}>
            {still || fallbackPoster ? (
              <Image
                source={{uri: backdropSrc(still || fallbackPoster, Math.round(stillW))}}
                style={StyleSheet.absoluteFill}
                resizeMode={still ? 'cover' : 'contain'}
              />
            ) : null}
          </View>
          <View style={styles.info}>
            {showTitle ? (
              <Text style={[styles.show, {fontSize: 18 * s}]} numberOfLines={1}>
                {showTitle.toUpperCase()}
              </Text>
            ) : null}
            <Text style={[styles.title, {fontSize: 36 * s, lineHeight: 42 * s, marginTop: 6 * s}]} numberOfLines={2}>
              {title || (failed ? 'Episodio' : '')}
            </Text>
            <View style={{marginTop: 10 * s}}>
              <MetaRow
                rating={rating}
                year={0}
                runtime={ep?.duration ? `${ep.duration} min` : ''}
                extra={metaExtra}
                s={s}
              />
            </View>
            {show?.genres.length ? (
              <View style={{marginTop: 10 * s}}>
                <GenreChips genres={show.genres} s={s} />
              </View>
            ) : null}
            <View style={{marginTop: 20 * s}}>
              <SourceButtons
                state={sources}
                s={s}
                focus={1 + refocus}
                resumeLabel={resume ? 'Riprendi' : undefined}
                onResume={
                  resume
                    ? () => {
                        const src = raw.sources.find(x => x.id === resume.mediaId);
                        onPlay({...base, streamId: resume.mediaId, sourceLabel: src?.label ?? '', startAt: resume.progressTime});
                      }
                    : undefined
                }
                resumeStreamId={resume?.mediaId}
              onPlay={src => onPlay({...base, streamId: src.id, sourceLabel: src.label})}
                trailing={canDownload ? <DownloadChip ref={chipRef} s={s} onPress={() => setDownload(true)} /> : undefined}
              />
              {note ? <Text style={[styles.note, {fontSize: 15 * s, marginTop: 8 * s}]}>{note}</Text> : null}
            </View>
            {plot ? (
              <Text style={[styles.plot, {fontSize: 17 * s, lineHeight: 17 * s * 1.6, marginTop: 20 * s}]} numberOfLines={8}>
                {plot}
              </Text>
            ) : null}
            {ep?.directors.length ? (
              <Text style={[styles.credit, {fontSize: 15 * s, marginTop: 12 * s}]} numberOfLines={1}>
                Regia: {ep.directors.join(', ')}
              </Text>
            ) : null}
          </View>
        </View>
      )}
      {download ? (
        <DownloadDialog
          pluginId={pluginId}
          sources={raw.sources}
          meta={meta}
          batch={batch}
          onClose={msg => {
            setDownload(false);
            // The dialog's focus trap is gone: back to the chip that opened it.
            focusSoon(() => chipRef.current);
            setNote(msg ?? '');
          }}
        />
      ) : null}
    </View>
  );
}

const styles = scaledStyles({
  root: {...StyleSheet.absoluteFillObject, backgroundColor: '#0D0D1A'},
  spinner: {marginTop: 200},
  main: {flexDirection: 'row', alignItems: 'flex-start'},
  still: {borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface2},
  info: {flex: 1},
  show: {color: colors.textLow, fontWeight: '700', letterSpacing: 1.5},
  title: {color: colors.textHigh, fontWeight: '800'},
  plot: {color: 'rgba(255,255,255,0.63)'},
  credit: {color: 'rgba(255,255,255,0.54)'},
  note: {color: colors.textLow},
});
