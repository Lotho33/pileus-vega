// Series / anime details (series_page_layout/page.dart): season poster,
// info column, season pills and a 5-row episode window on the right,
// related titles in a footer. All episodes stay mounted; the window only
// translates, so the native focus engine can always reach the next one and
// the window follows focus (episodeWindow).

import {languageBadge} from '../core/language';
import React, {forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useKeplerBackHandler} from '@amazon-devices/react-native-kepler';
import {Icon} from '../components/Icon';
import {mycelium} from '../core/api';
import {focusSoon, useFocusGate} from '../core/focus';
import {batchGroups, DownloadMeta} from '../downloads/batch';
import {DownloadDialog} from '../downloads/DownloadDialog';
import type {
  CatalogItem,
  ContinueWatchingItem,
  EpisodeInfo,
  SeasonInfo,
  SeriesDetails,
  StreamSource,
} from '../gen/media';
import {emptyRequest, PlayRequest} from '../player/session';
import type {HomeLayout} from '../home/layout';
import type {CardModel} from '../home/model';
import {colors, scaledStyles} from '../theme';
import {
  BackButton,
  Backdrop,
  catalogHPadRatio,
  detailsGapRatio,
  detailsInfoWRatio,
  detailsPosterWRatio,
  detailsVPadRatio,
  GenreChips,
  MetaRow,
  Poster,
} from './common';
import {EpisodePopup} from './EpisodePopup';
import {episodeWindow, fmtAirDate, fmtStatus, relatedLists, seasonLabel} from './format';
import {RelatedRow} from './RelatedRow';

const PAGE = 5;
const SeasonPill = memo(
  forwardRef<View, {label: string; selected: boolean; s: number; onPress: () => void}>(function SeasonPill(
    {label, selected, s, onPress},
    ref,
  ) {
    const [focused, setFocused] = useState(false);
    return (
      <Pressable
        ref={ref}
        accessibilityLabel={label}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPress={onPress}
        style={[
          styles.pill,
          {paddingHorizontal: 18 * s, paddingVertical: 10 * s},
          selected && styles.pillSelected,
          focused && styles.pillFocused,
        ]}>
        <Text style={[styles.pillText, {fontSize: 18 * s}, (selected || focused) && styles.textOn]}>{label}</Text>
      </Pressable>
    );
  }),
);

const EpisodeRow = memo(
  forwardRef<
    View,
    {ep: EpisodeInfo; height: number; s: number; hidden: boolean; onFocus: () => void; onPress: () => void}
  >(
    // `hidden`: outside the 5-row window. Still mounted and focusable (the
    // window follows focus), just not drawn, so no row peeks past the clip.
    function EpisodeRow({ep, height, s, hidden, onFocus, onPress}, ref) {
      const [focused, setFocused] = useState(false);
      const n = ep.episodeNumber > 0 ? ep.episodeNumber : null;
      // This episode's own language versions, when the plugin says.
      const badge = languageBadge(ep.extra?.lang);
      const avail = Math.max(12, height - 18);
      const titleFs = Math.min(28 * s, avail * 0.52);
      const numFs = Math.min(38 * s, avail * 0.7);
      return (
        <Pressable
          ref={ref}
          accessibilityLabel={ep.title || `Episodio ${n ?? ''}`}
          onFocus={() => {
            setFocused(true);
            onFocus();
          }}
          onBlur={() => setFocused(false)}
          onPress={onPress}
          style={[styles.ep, {height: height - 6}, rowGap.ep, focused && styles.epFocused, hidden && styles.dimOut]}>
          <Text
            style={[
              styles.epNum,
              {width: 72 * s, fontSize: n !== null && n >= 100 ? numFs * 0.65 : numFs},
              focused && styles.textOn,
            ]}>
            {n ?? '—'}
          </Text>
          <View style={styles.epBody}>
            {ep.title ? (
              <Text style={[styles.epTitle, {fontSize: titleFs}, focused && styles.textOn]} numberOfLines={1}>
                {ep.title}
              </Text>
            ) : null}
            {/* Duration, then the start of the plot on the same line
                (episode_tile_row.dart): the row is wide and was empty past
                the title. */}
            {ep.duration > 0 || ep.plot ? (
              <Text style={[styles.epDur, {fontSize: Math.min(17 * s, avail * 0.32)}]} numberOfLines={1}>
                {[ep.duration > 0 ? `${ep.duration} min` : '', ep.plot.replace(/\n/g, ' ').trim()]
                  .filter(Boolean)
                  .join('  ·  ')}
              </Text>
            ) : null}
          </View>
          {badge ? (
            <Text
              style={[
                styles.epLang,
                {backgroundColor: badge.color, fontSize: Math.min(17 * s, avail * 0.32), marginLeft: 8 * s},
              ]}>
              {badge.label}
            </Text>
          ) : null}
          <Icon name="chevronRight" size={Math.min(30, titleFs * 1.3)} color={focused ? colors.textHigh : colors.textLow} />
        </Pressable>
      );
    },
  ),
);

function InfoChip({icon, text, s}: {icon: 'schedule' | 'tv'; text: string; s: number}) {
  return (
    <View style={[styles.infoChip, {paddingHorizontal: 10 * s, paddingVertical: 4 * s, gap: 6 * s}]}>
      <Icon name={icon} size={16 * s} color={colors.textLow} />
      <Text style={[styles.infoChipText, {fontSize: 14 * s}]}>{text}</Text>
    </View>
  );
}

export function SeriesLayout({
  pluginId,
  item,
  series,
  seasons,
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
  series: SeriesDetails | undefined;
  seasons: SeasonInfo[];
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
  const keplerBack = useKeplerBackHandler();
  const [seasonIdx, setSeasonIdx] = useState(0);
  const [episodes, setEpisodes] = useState<EpisodeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [start, setStart] = useState(0);
  const [popup, setPopup] = useState<EpisodeInfo | null>(null);
  const [download, setDownload] = useState<{ep: EpisodeInfo; sources: StreamSource[]} | null>(null);
  const [note, setNote] = useState('');
  const token = useRef(0);
  const epRefs = useRef(new Map<number, View>());
  const lastEp = useRef(0);
  // The popup or the player over the page: their focus leftovers must not
  // move the window or the remembered episode.
  const gate = useFocusGate(covered || !!popup || !!download);

  const loadSeason = useCallback(
    async (idx: number) => {
      const season = seasons[idx];
      if (!season) {
        return;
      }
      const id = ++token.current;
      setSeasonIdx(idx);
      setLoading(true);
      try {
        const r = await mycelium.browse(pluginId, season.directoryId);
        if (id !== token.current) {
          return;
        }
        const eps = r.episodes.length
          ? r.episodes
          : r.items.map(e => ({
              id: e.id,
              title: e.title,
              episodeNumber: e.episodeNumber,
              seasonNumber: e.seasonNumber,
              thumbnailUrl: '',
              airDate: '',
              duration: 0,
              vote: 0,
              plot: '',
              showId: '',
              parentId: '',
              extra: e.extra ?? {},
            }));
        setEpisodes(eps);
        setStart(0);
        focusSoon(() => epRefs.current.get(0));
      } catch {
        if (id === token.current) {
          setEpisodes([]);
        }
      } finally {
        if (id === token.current) {
          setLoading(false);
        }
      }
    },
    [pluginId, seasons],
  );

  useEffect(() => {
    loadSeason(0);
  }, [loadSeason]);

  // Back from the player: focus returns to the episode that was played.
  useEffect(() => {
    if (refocus) {
      return focusSoon(() => epRefs.current.get(lastEp.current));
    }
  }, [refocus]);

  // The popup's Back closes it (this listener is the newest one).
  useEffect(() => {
    if (!popup) {
      return;
    }
    const sub = keplerBack.addEventListener('hardwareBackPress', () => {
      setPopup(null);
      focusSoon(() => epRefs.current.get(lastEp.current));
      return true;
    });
    return () => sub.remove();
  }, [popup, keplerBack]);

  const lists = useMemo(() => relatedLists(item.extra), [item.extra]);
  const hasRelated = lists.related.length + lists.similar.length > 0;
  const sd = series;
  const season = seasons[seasonIdx];
  const poster = season?.posterUrl || item.posterUrl;
  const fanart = sd?.fanartUrl || item.extra?.fanart_url || item.posterUrl;
  const plot = season?.overview || sd?.plot || '';

  const hPad = W * catalogHPadRatio;
  const topBarH = 24 * s + 48 * s;
  const h = H - topBarH;
  const footerH = hasRelated ? Math.min(h * 0.4, h * 0.5) : 0;
  const mainH = h - footerH;
  const cardH = hasRelated ? Math.max(76 * s, Math.min(330 * s, footerH * 0.72)) : 0;
  const posterBase = W * detailsPosterWRatio;
  const posterW = hasRelated ? posterBase : Math.min(posterBase * 1.3, Math.max(posterBase, mainH / 1.5));
  const pillsH = seasons.length > 1 ? 20 * s * 2 + 18 * s * 1.5 + 10 : 0;
  const headerH = 20 * s * 1.3 + 8;
  const avail = Math.max(0, mainH - H * detailsVPadRatio - 16 - pillsH - headerH);
  // Whole pixels: the window slides by tileH per row, so each row must take
  // exactly that (fractional heights crept a little further every step).
  const tileH = Math.round(Math.max(40, Math.min(100 * s, avail / PAGE)));
  const winEnd = Math.min(start + PAGE, episodes.length);
  const downloadMeta = (ep: EpisodeInfo): DownloadMeta => ({
    mediaId: ep.id,
    parentId: item.id,
    title: ep.title || `Episodio ${ep.episodeNumber}`,
    seriesTitle: item.title,
    poster: ep.thumbnailUrl || item.extra?.cover_url || poster,
    seasonNumber: ep.seasonNumber || season?.number || 0,
    episodeNumber: ep.episodeNumber,
  });

  const seasonText = season ? seasonLabel(seasons, seasonIdx) : '';

  return (
    <View style={styles.root}>
      <Backdrop url={fanart} W={W} shade="seriesShade" />
      <View style={{paddingHorizontal: 40 * s, paddingTop: 24 * s, height: topBarH}}>
        <BackButton s={s} onPress={onBack} />
      </View>
      <View style={[styles.main, {height: mainH, paddingHorizontal: hPad, paddingTop: H * detailsVPadRatio}]}>
        <Poster url={poster} title={item.title} width={posterW} />
        <View style={{width: W * detailsInfoWRatio, marginLeft: W * detailsGapRatio}}>
          <Text style={[styles.title, {fontSize: 38 * s, lineHeight: 42 * s}]} numberOfLines={2}>
            {item.title}
          </Text>
          {season ? (
            <Text style={[styles.seasonLine, {fontSize: 18 * s, marginTop: 6 * s}]} numberOfLines={1}>
              {episodes.length ? `${seasonText}  ·  ${episodes.length} ep.` : seasonText}
            </Text>
          ) : null}
          <View style={{marginTop: 6 * s}}>
            <MetaRow
              rating={item.rating}
              year={season?.airDate ? 0 : item.year}
              extra={season?.airDate ? fmtAirDate(season.airDate) : ''}
              contentRating={sd?.contentRating}
              s={s}
            />
          </View>
          {sd?.genres?.length ? (
            <View style={{marginTop: 8 * s}}>
              <GenreChips genres={sd.genres} s={s} max={3} />
            </View>
          ) : null}
          {sd && (sd.episodeRuntime || sd.network || sd.status) ? (
            <View style={[styles.chips, {marginTop: 6 * s}]}>
              {sd.episodeRuntime ? <InfoChip icon="schedule" text={sd.episodeRuntime} s={s} /> : null}
              {sd.network ? <InfoChip icon="tv" text={sd.network} s={s} /> : null}
              {sd.status ? <InfoChip icon="schedule" text={fmtStatus(sd.status)} s={s} /> : null}
            </View>
          ) : null}
          {plot ? (
            <Text
              style={[styles.plot, {fontSize: 16 * s, lineHeight: 16 * s * 1.55, marginTop: 10 * s}]}
              numberOfLines={hasRelated ? 5 : 10}>
              {plot}
            </Text>
          ) : null}
        </View>
        <View style={[styles.right, {marginLeft: W * detailsGapRatio}]}>
          {seasons.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{height: pillsH, flexGrow: 0}}>
              <View style={styles.pills}>
                {seasons.map((_, i) => (
                  <SeasonPill
                    key={i}
                    label={seasonLabel(seasons, i)}
                    selected={i === seasonIdx}
                    s={s}
                    onPress={() => loadSeason(i)}
                  />
                ))}
              </View>
            </ScrollView>
          ) : null}
          <View style={[styles.epHeader, {height: headerH}]}>
            <View style={styles.tick} />
            <Text style={[styles.epHeaderText, {fontSize: 20 * s}]}>
              {seasons.length === 1 ? seasonLabel(seasons, 0) : 'Episodi'}
            </Text>
            {episodes.length > PAGE ? (
              <Text style={[styles.low, {fontSize: 15 * s}]}>
                {start + 1}–{winEnd} / {episodes.length}
              </Text>
            ) : null}
            {loading ? <ActivityIndicator size="small" color={colors.textLow} /> : null}
          </View>
          <View style={[styles.window, {height: tileH * PAGE}, loading && styles.dim]}>
            {episodes.length ? (
              <View style={{transform: [{translateY: -start * tileH}]}}>
                {episodes.map((ep, i) => (
                  <EpisodeRow
                    key={ep.id || i}
                    hidden={i < start || i >= winEnd}
                    ref={(v: View | null) => {
                      if (v) {
                        epRefs.current.set(i, v);
                      } else {
                        epRefs.current.delete(i);
                      }
                    }}
                    ep={ep}
                    height={tileH}
                    s={s}
                    onFocus={() => {
                      if (gate()) {
                        return;
                      }
                      lastEp.current = i;
                      setStart(st => episodeWindow(st, i, PAGE, episodes.length));
                    }}
                    onPress={() => setPopup(ep)}
                  />
                ))}
              </View>
            ) : !loading ? (
              <Text style={[styles.low, {fontSize: 16 * s}]}>Nessun episodio disponibile.</Text>
            ) : null}
          </View>
        </View>
      </View>
      {hasRelated ? (
        <View style={{height: footerH}}>
          <RelatedRow covered={covered || !!popup || !!download} pluginId={pluginId} lists={lists} L={L} cardH={cardH} hPad={hPad} onOpen={onOpenRelated} refocus={relatedRefocus} />
        </View>
      ) : null}
      {popup ? (
        <EpisodePopup
          ctx={{
            pluginId,
            seriesId: item.id,
            seriesTitle: item.title,
            seriesPoster: poster,
            seriesCover: item.extra?.cover_url ?? '',
            seriesRating: item.rating,
            seriesYear: item.year,
            seriesGenres: sd?.genres ?? [],
          }}
          episode={popup}
          W={W}
          H={H}
          cw={cw}
          onDownload={
            canDownload
              ? sources => {
                  setDownload({ep: popup, sources});
                  setPopup(null);
                }
              : undefined
          }
          onPlay={(streamId, sourceLabel, startAt, sources) => {
            const ep = popup;
            setPopup(null);
            onPlay(
              emptyRequest({
                pluginId,
                streamId,
                sourceLabel,
                parentId: item.id,
                title: ep.title || (ep.episodeNumber > 0 ? `Episodio ${ep.episodeNumber}` : item.title),
                showTitle: item.title,
                // posterForEpisode: the still, then the series cover/poster.
                poster: ep.thumbnailUrl || item.extra?.cover_url || poster,
                plot: sd?.plot ?? '',
                genres: sd?.genres ?? [],
                rating: item.rating,
                year: item.year,
                seasonNumber: ep.seasonNumber || season?.number || 0,
                episodeNumber: ep.episodeNumber,
                startAt,
                sources,
                nav: {
                  episodes: episodes.map(e => ({
                    id: e.id,
                    title: e.title,
                    thumb: e.thumbnailUrl,
                    episodeNumber: e.episodeNumber,
                    seasonNumber: e.seasonNumber || season?.number || 0,
                  })),
                  index: Math.max(0, episodes.indexOf(ep)),
                  seasonIds: seasons.map(x => x.directoryId),
                  seasonIndex: seasonIdx,
                  seriesPoster: item.extra?.cover_url || poster,
                },
              }),
            );
          }}
          onClose={() => {
            setPopup(null);
            focusSoon(() => epRefs.current.get(lastEp.current));
          }}
        />
      ) : null}
      {download ? (
        <DownloadDialog
          pluginId={pluginId}
          sources={download.sources}
          meta={downloadMeta(download.ep)}
          batch={batchGroups(episodes.map(downloadMeta), episodes.indexOf(download.ep))}
          onClose={msg => {
            setDownload(null);
            setNote(msg ?? '');
            focusSoon(() => epRefs.current.get(lastEp.current));
          }}
        />
      ) : null}
      {note ? (
        <View style={styles.noteBar} pointerEvents="none">
          <Text style={[styles.noteText, {fontSize: 16 * s}]}>{note}</Text>
        </View>
      ) : null}
    </View>
  );
}

// Unscaled on purpose: it adds up with `height - 6` to exactly tileH.
const rowGap = StyleSheet.create({ep: {marginVertical: 3}});

const styles = scaledStyles({
  root: {...StyleSheet.absoluteFillObject, backgroundColor: '#000'},
  main: {flexDirection: 'row'},
  right: {flex: 1},
  title: {color: colors.textHigh, fontWeight: '800', letterSpacing: -0.5},
  seasonLine: {color: colors.primary, fontWeight: '600'},
  low: {color: colors.textLow},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(242,242,240,0.06)',
  },
  infoChipText: {color: colors.textMid},
  plot: {color: 'rgba(255,255,255,0.63)'},
  epLang: {
    color: '#fff',
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  pills: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4},
  pill: {
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(242,242,240,0.08)',
  },
  pillSelected: {backgroundColor: 'rgba(124,106,247,0.35)'},
  pillFocused: {borderColor: colors.primary},
  pillText: {color: colors.textMid, fontWeight: '600'},
  textOn: {color: colors.textHigh},
  epHeader: {flexDirection: 'row', alignItems: 'center', gap: 10},
  tick: {width: 3, height: 22, borderRadius: 2, backgroundColor: colors.primary},
  epHeaderText: {color: colors.textHigh, fontWeight: '700'},
  window: {overflow: 'hidden'},
  dim: {opacity: 0.45},
  dimOut: {opacity: 0},
  ep: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  epFocused: {borderColor: colors.primary, backgroundColor: 'rgba(124,106,247,0.13)'},
  epNum: {color: colors.textLow, fontWeight: '700'},
  epBody: {flex: 1, marginLeft: 12, justifyContent: 'center'},
  epTitle: {color: 'rgba(242,242,240,0.85)', fontWeight: '600'},
  noteBar: {position: 'absolute', bottom: 40, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.surface2},
  noteText: {color: colors.textHigh},
  epDur: {color: 'rgba(255,255,255,0.54)', marginTop: 2},
});
