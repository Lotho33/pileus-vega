// Movie details (details_screen/movie_layout.dart): poster on the left,
// title/meta/genres/watch button/credits/plot on the right, related
// titles in a footer row. Anime films (anime_movie_layout.dart) use it too,
// reading the series details the anime plugins return and showing studio /
// episodes / runtime / status under the title.

import React, {useMemo, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Gradient} from '../components/Gradient';
import type {CatalogItem, ContinueWatchingItem, MovieDetails, SeriesDetails} from '../gen/media';
import type {HomeLayout} from '../home/layout';
import type {CardModel} from '../home/model';
import {focusSoon} from '../core/focus';
import {colors, scaledStyles} from '../theme';
import {
  BackButton,
  Backdrop,
  catalogHPadRatio,
  detailsGapRatio,
  detailsPosterWRatio,
  detailsVPadRatio,
  GenreChips,
  MetaRow,
  Poster,
} from './common';
import {fmtStatus, relatedLists} from './format';
import {emptyRequest, PlayRequest} from '../player/session';
import {RelatedRow} from './RelatedRow';
import {DownloadDialog} from '../downloads/DownloadDialog';
import {DownloadChip, SourceButtons, useSources} from './Sources';

export function MovieLayout({
  pluginId,
  item,
  movie,
  series,
  anime = false,
  L,
  cw,
  onPlay,
  refocus,
  covered,
  canDownload,
  onBack,
  onOpenRelated,
  relatedRefocus,
}: {
  pluginId: string;
  item: CatalogItem;
  movie: MovieDetails | undefined;
  /** Anime films: AniList metadata comes as series details. */
  series?: SeriesDetails;
  anime?: boolean;
  L: HomeLayout;
  cw: ContinueWatchingItem[];
  onPlay: (req: PlayRequest) => void;
  refocus: number;
  /** The player is open on top of this page. */
  covered: boolean;
  /** The plugin can prepare server-side downloads. */
  canDownload: boolean;
  onBack: () => void;
  onOpenRelated: (card: CardModel) => void;
  /** Bumped when the related-title popup closes. */
  relatedRefocus: number;
}) {
  const {W, H} = L;
  const s = H / 1080;
  const d = movie;
  const sd = series;
  const fanart = sd?.fanartUrl || d?.fanartUrl || item.extra?.fanart_url || '';
  const plot = sd?.plot || d?.plot || item.extra?.plot || '';
  const genres = sd?.genres?.length
    ? sd.genres
    : d?.genres?.length
    ? d.genres
    : (item.extra?.genres ?? '').split(',').map(g => g.trim()).filter(Boolean);
  // AnimeMetaRow: studio, episodes, runtime, status.
  const animeInfo = anime
    ? [
        sd?.creators?.[0] ?? '',
        item.extra?.episodes ? `${item.extra.episodes} ep.` : '',
        item.extra?.runtime || sd?.episodeRuntime || '',
        fmtStatus(item.extra?.status || sd?.status || ''),
      ]
        .filter(Boolean)
        .join('  ·  ')
    : '';
  const lists = useMemo(() => relatedLists(item.extra), [item.extra]);
  const hasRelated = lists.related.length + lists.similar.length > 0;

  const hPad = W * catalogHPadRatio;
  const topBarH = 24 * s + 48 * s;
  const h = H - topBarH;
  const footerH = hasRelated ? Math.min(h * 0.4, h * 0.5) : 0;
  const mainH = h - footerH;
  const cardH = hasRelated ? Math.max(151 * s, Math.min(383 * s, footerH - 132 * s)) : 0;
  const posterBase = W * detailsPosterWRatio;
  const posterW = hasRelated ? posterBase : Math.min(posterBase * 1.3, Math.max(posterBase, mainH / 1.5));

  const sources = useSources(pluginId, item.id);
  const [download, setDownload] = useState(false);
  const chipRef = useRef<View>(null);
  const [note, setNote] = useState('');
  // Continue Watching keys a movie by the stream id it was played from.
  const resume = cw.find(
    c =>
      c.pluginId === pluginId &&
      c.progressTime > 0 &&
      (c.mediaId === item.id || sources.sources.some(src => src.id === c.mediaId)),
  );
  const base = emptyRequest({
    pluginId,
    title: item.title,
    // posterForMovie in pileus-player: cover, then fanart, then poster.
    poster: item.extra?.cover_url || fanart || item.posterUrl,
    plot,
    genres,
    rating: item.rating,
    year: item.year || d?.year || 0,
    sources: sources.sources,
  });

  return (
    <View style={styles.root}>
      <Backdrop url={fanart || item.posterUrl} W={W} shade="movieShade" />
      <Gradient name="movieLeft" direction="toRight" />
      <View style={{paddingHorizontal: 40 * s, paddingTop: 24 * s, height: topBarH}}>
        <BackButton s={s} onPress={onBack} />
      </View>
      <View style={[styles.main, {height: mainH, paddingHorizontal: hPad, paddingTop: H * detailsVPadRatio}]}>
        <Poster url={item.posterUrl} title={item.title} width={posterW} />
        <View style={[styles.info, {marginLeft: W * detailsGapRatio}]}>
          <Text style={[styles.title, {fontSize: 38 * s, lineHeight: 42 * s}]} numberOfLines={2}>
            {item.title}
          </Text>
          {animeInfo ? (
            <Text style={[styles.credits, {fontSize: 16 * s, marginTop: 8 * s}]} numberOfLines={1}>
              {animeInfo}
            </Text>
          ) : null}
          {d?.tagline ? (
            <Text style={[styles.tagline, {fontSize: 16 * s, marginTop: 6 * s}]} numberOfLines={2}>
              {d.tagline}
            </Text>
          ) : null}
          <View style={{marginTop: 8 * s}}>
            <MetaRow rating={item.rating} year={item.year || d?.year || 0} runtime={d?.runtime} contentRating={d?.contentRating} s={s} />
          </View>
          <View style={{marginTop: 10 * s}}>
            <GenreChips genres={genres} s={s} />
          </View>
          <View style={{marginTop: 16 * s}}>
            <SourceButtons
              state={sources}
              s={s}
              focus={1 + refocus}
              resumeLabel={resume ? `Riprendi «${resume.title || item.title}»` : undefined}
              onResume={
                resume
                  ? () => {
                      const src = sources.sources.find(x => x.id === resume.mediaId);
                      onPlay({...base, streamId: resume.mediaId, sourceLabel: src?.label ?? '', startAt: resume.progressTime});
                    }
                  : undefined
              }
              resumeStreamId={resume?.mediaId}
              onPlay={src => onPlay({...base, streamId: src.id, sourceLabel: src.label})}
              trailing={canDownload ? <DownloadChip ref={chipRef} s={s} onPress={() => setDownload(true)} /> : undefined}
            />
            {note ? <Text style={[styles.cast, {fontSize: 15 * s, marginTop: 8 * s}]}>{note}</Text> : null}
          </View>
          {d?.directors?.length ? (
            <Text style={[styles.credits, {fontSize: 15 * s, marginTop: 16 * s}]} numberOfLines={1}>
              Regia: {d.directors.join(', ')}
            </Text>
          ) : null}
          {d?.cast?.length ? (
            <Text style={[styles.cast, {fontSize: 14 * s, marginTop: 6 * s}]} numberOfLines={2}>
              {d.cast.slice(0, 5).join('  ·  ')}
            </Text>
          ) : null}
          {plot ? (
            <Text style={[styles.plot, {fontSize: 16 * s, lineHeight: 16 * s * 1.55, marginTop: 12 * s}]} numberOfLines={hasRelated ? 4 : 9}>
              {plot}
            </Text>
          ) : null}
        </View>
      </View>
      {hasRelated ? (
        <View style={{height: footerH}}>
          <RelatedRow covered={covered || download} pluginId={pluginId} lists={lists} L={L} cardH={cardH} hPad={hPad} onOpen={onOpenRelated} refocus={relatedRefocus} />
        </View>
      ) : null}
      {download ? (
        <DownloadDialog
          pluginId={pluginId}
          sources={sources.sources}
          meta={{
            mediaId: item.id,
            parentId: '',
            title: item.title,
            seriesTitle: '',
            poster: base.poster,
            seasonNumber: 0,
            episodeNumber: 0,
          }}
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
  root: {...StyleSheet.absoluteFillObject, backgroundColor: '#000'},
  main: {flexDirection: 'row'},
  info: {flex: 1},
  title: {color: colors.textHigh, fontWeight: '800', letterSpacing: 0.3},
  tagline: {color: 'rgba(242,242,240,0.5)', fontStyle: 'italic'},
  credits: {color: 'rgba(255,255,255,0.54)'},
  cast: {color: colors.textLow, lineHeight: 20},
  plot: {color: 'rgba(255,255,255,0.63)'},
});
