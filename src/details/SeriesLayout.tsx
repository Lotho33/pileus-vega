// Series / anime details (series_page_layout/page.dart): season poster,
// info column, season pills and a 5-row episode window on the right,
// related titles in a footer. All episodes stay mounted; the window only
// translates, so the native focus engine can always reach the next one and
// the window follows focus (episodeWindow).

import {languageBadges} from '../core/language';
import {episodeKindLabel} from '../core/episodeKind';
import {MetaWithKind} from '../components/MetaWithKind';
import React, {forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {Text} from '../components/Text';
import {TVFocusGuideView, useKeplerBackHandler, useTVEventHandler} from '@amazon-devices/react-native-kepler';
import {Icon} from '../components/Icon';
import {mycelium} from '../core/api';
import {useMyList} from '../core/myList';
import {focusSoon, useFocusGate} from '../core/focus';
import {batchGroups, DownloadMeta} from '../downloads/batch';
import {DownloadDialog} from '../downloads/DownloadDialog';
import type {
  CatalogItem,
  ContinueWatchingItem,
  DetailsResponse,
  EpisodeInfo,
  SeasonInfo,
  SeriesDetails,
  StreamSource,
} from '../gen/media';
import {emptyRequest, PlayRequest} from '../player/session';
import type {HomeLayout} from '../home/layout';
import type {CardModel} from '../home/model';
import {colors, px, scaledStyles} from '../theme';
import {
  BackButton,
  Backdrop,
  catalogHPadRatio,
  contentScale,
  detailsEpisodeTileHRatio,
  detailsGapRatio,
  detailsInfoWRatio,
  detailsPosterWRatio,
  detailsVPadRatio,
  GenreChips,
  Poster,
} from './common';
import {MyListChip, TrailerChip} from './DetailActions';
import {EpisodePopup} from './EpisodePopup';
import {episodeWindow, fmtAirDate, fmtStatus, relatedLists, seasonLabel} from './format';
import {RelatedRow} from './RelatedRow';
import {Spinner} from '../components/Spinner';

const PAGE = 5;
/** A ↓/→ this soon after an episode got focus is the press that moved it. */
const ENTRY_KEY_MS = 150;
// season_pill.dart: sizes in units of pileus-player's 540-tall canvas (`k`):
// text 12 (13.2 selected), padding 12/6, radius 28, outline 1.5. Selected:
// filled primary; focused: primary 30% with a primary outline.
const SeasonPill = memo(
  forwardRef<View, {label: string; selected: boolean; k: number; onPress: () => void}>(function SeasonPill(
    {label, selected, k, onPress},
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
          {paddingHorizontal: 12 * k, paddingVertical: 6 * k, borderRadius: 28 * k, borderWidth: 1.5 * k},
          selected ? styles.pillSelected : focused ? styles.pillFocused : null,
        ]}>
        <Text
          style={[
            styles.pillText,
            {fontSize: 12 * k * (selected ? 1.1 : 1)},
            (selected || focused) && styles.textOn,
            selected && styles.pillTextSelected,
          ]}
          numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  }),
);

const EpisodeRow = memo(
  forwardRef<
    View,
    {
      ep: EpisodeInfo;
      height: number;
      s: number;
      hidden: boolean;
      onFocus: () => void;
      onBlur: () => void;
      onPress: () => void;
    }
  >(
    // `hidden`: outside the 5-row window. Still mounted and focusable (the
    // window follows focus), just not drawn, so no row peeks past the clip.
    function EpisodeRow({ep, height, s, hidden, onFocus, onBlur, onPress}, ref) {
      const [focused, setFocused] = useState(false);
      const n = ep.episodeNumber > 0 ? ep.episodeNumber : null;
      // This episode's own language versions, when the plugin says.
      const badges = languageBadges(ep.extra?.lang);
      const kind = episodeKindLabel(ep.extra?.filler);
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
          onBlur={() => {
            setFocused(false);
            onBlur();
          }}
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
            {ep.duration > 0 || ep.plot || kind ? (
              <Text style={[styles.epDur, {fontSize: Math.min(17 * s, avail * 0.32)}]} numberOfLines={1}>
                <MetaWithKind
                  parts={[ep.duration > 0 ? `${ep.duration} min` : '', ep.plot.replace(/\n/g, ' ').trim()]}
                  kind={kind}
                  at={ep.duration > 0 ? 1 : 0}
                />
              </Text>
            ) : null}
          </View>
          {badges.map((badge, i) => (
            <Text
              key={badge.label}
              style={[
                styles.epLang,
                {backgroundColor: badge.color, fontSize: Math.min(17 * s, avail * 0.32), marginLeft: (i ? 4 : 8) * s},
              ]}>
              {badge.label}
            </Text>
          ))}
          <Icon name="chevronRight" size={Math.min(30, titleFs * 1.3)} color={focused ? colors.textHigh : colors.textLow} />
        </Pressable>
      );
    },
  ),
);

// related_popup.dart _InfoChip: plain icon + text, white 54%, 1080p sizes.
function InfoChip({icon, text}: {icon: 'schedule' | 'tv'; text: string; s?: number}) {
  return (
    <View style={styles.infoChip}>
      <Icon name={icon} size={px(18)} color="rgba(255,255,255,0.54)" />
      <Text style={styles.infoChipText}>{text}</Text>
    </View>
  );
}

// _SeasonRatingRow: ★ rating, the season's air date, the content rating —
// no year: with no air date the row just has less in it.
function SeasonRatingRow({rating, airDate, contentRating}: {rating: number; airDate: string; contentRating: string}) {
  const date = airDate ? fmtAirDate(airDate) : '';
  if (!(rating > 0) && !date && !contentRating) {
    return null;
  }
  return (
    <View style={styles.ratingRow}>
      {rating > 0 ? (
        <View style={styles.ratingItem}>
          <Icon name="star" size={px(15)} color="#FFD700" />
          <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
        </View>
      ) : null}
      {date ? <Text style={styles.airDate}>{date}</Text> : null}
      {contentRating ? (
        <View style={styles.crBadge}>
          <Text style={styles.crText}>{contentRating}</Text>
        </View>
      ) : null}
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
  details,
  onToast,
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
  /** The GetDetails answer (what a La mia lista entry keeps). */
  details: DetailsResponse | null;
  onToast: (text: string) => void;
}) {
  const {W, H} = L;
  // u: 1080p pixels; k: one unit of pileus-player's 540-tall TV canvas;
  // s: contentScale (floor 0.7 on this page), once hasRelated is known.
  const u = H / 1080;
  const k = H / 540;
  const keplerBack = useKeplerBackHandler();
  const myListSupported = useMyList().supported;
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

  // Into related/similar from the episodes (series_page_layout _moveEpisode):
  // ↓ off the last episode, or → from any. The native engine never got
  // there: the episodes past the 5-row window are still laid out below it,
  // over the footer, so ↓ always found one of them first.
  const [enterRelated, setEnterRelated] = useState(0);
  const inChips = useRef(false);
  const onChipFocus = (f: boolean) => {
    inChips.current = f;
  };
  const inEpisodes = useRef(false);
  const epFocusAt = useRef(0);
  useTVEventHandler(evt => {
    // ↓ from "La mia lista" / "Trailer" goes to the related row below (as on
    // Android TV), not back into the episodes beside them.
    if (hasRelated && inChips.current && evt.eventType === 'down' && evt.eventKeyAction !== 1 && !gate()) {
      setEnterRelated(t => t + 1);
      return;
    }
    if (!hasRelated || !inEpisodes.current || gate() || evt.eventKeyAction === 1) {
      return;
    }
    // The press that just moved focus onto this episode isn't another one.
    if (Date.now() - epFocusAt.current < ENTRY_KEY_MS) {
      return;
    }
    if (evt.eventType === 'right' || (evt.eventType === 'down' && lastEp.current === episodes.length - 1)) {
      setEnterRelated(t => t + 1);
    }
  });
  const sd = series;
  const season = seasons[seasonIdx];
  const poster = season?.posterUrl || item.posterUrl;
  const fanart = sd?.fanartUrl || item.extra?.fanart_url || item.posterUrl;
  const plot = season?.overview || sd?.plot || '';

  const s = contentScale(H, hasRelated, 0.7);
  const hPad = W * catalogHPadRatio;
  // EdgeInsets.fromLTRB(40, 24, 40, 0) around the back button.
  const topBarH = 24 * k + 48 * u;
  const h = H - topBarH;
  const footerH = hasRelated ? Math.min(h * 0.4, h * 0.5) : 0;
  const mainH = h - footerH;
  const cardH = hasRelated ? Math.max(76 * k, Math.min(330 * k, footerH * 0.86)) : 0;
  const posterBase = W * detailsPosterWRatio;
  const posterW = hasRelated ? posterBase : Math.min(posterBase * 1.3, Math.max(posterBase, mainH / 1.5));
  // page.dart: the pills row (season_pill.dart's own sizes, with headroom
  // for the selected pill's bigger type) and the episode header row.
  const pillsH = (12 + 12 * 1.1 * 1.35) * k;
  const pillsBlockH = seasons.length > 1 ? pillsH + 10 * k : 0;
  const headerH = (22 + 8) * k;
  const avail = Math.max(0, mainH - (h * detailsVPadRatio + 16 * k) - pillsBlockH - headerH);
  // tileHFit: avail over five rows, at most h·100/1080, at least 40 units.
  // Whole pixels: the window slides by tileH per row, so each row must take
  // exactly that (fractional heights crept a little further every step).
  const tileMax = h * detailsEpisodeTileHRatio;
  const tileH = Math.round(Math.max(Math.min(tileMax, 40 * k), Math.min(tileMax, avail / PAGE)));
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
      <View style={{paddingHorizontal: 40 * k, paddingTop: 24 * k, height: topBarH}}>
        <BackButton s={u} onPress={onBack} />
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
            <SeasonRatingRow
              rating={item.rating}
              airDate={season?.airDate ?? ''}
              contentRating={item.extra?.content_rating || sd?.contentRating || ''}
            />
          </View>
          {sd?.genres?.length ? (
            <View style={{marginTop: 8 * s}}>
              <GenreChips genres={sd.genres} s={s} max={3} />
            </View>
          ) : null}
          {sd && (sd.episodeRuntime || sd.network || sd.status) ? (
            // SizedBox(8 * s) after the genres, then (6 * s) before the chips.
            <View style={[styles.chips, {marginTop: (sd.genres?.length ? 14 : 6) * s}]}>
              {sd.episodeRuntime ? <InfoChip icon="schedule" text={sd.episodeRuntime} s={s} /> : null}
              {sd.network ? <InfoChip icon="tv" text={sd.network} s={s} /> : null}
              {sd.status ? <InfoChip icon="schedule" text={fmtStatus(sd.status)} s={s} /> : null}
            </View>
          ) : null}
          {/* series_page_layout: "La mia lista" / "Trailer" above the plot,
              reached with ← from the episodes. */}
          {myListSupported || sd?.trailerUrl ? (
            <TVFocusGuideView style={[styles.chips, {marginTop: 10 * s, gap: 10 * s}]} trapFocusDown>
              <MyListChip
                s={s}
                pluginId={pluginId}
                item={item}
                details={details}
                mediaType="series"
                onToast={onToast}
                onFocusChange={onChipFocus}
              />
              <TrailerChip s={s} url={sd?.trailerUrl ?? ''} onToast={onToast} onFocusChange={onChipFocus} />
            </TVFocusGuideView>
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
                    k={k}
                    onPress={() => loadSeason(i)}
                  />
                ))}
              </View>
            </ScrollView>
          ) : null}
          <View style={[styles.epHeader, {height: headerH}]}>
            <View style={styles.tick} />
            <Text style={styles.epHeaderText}>
              {seasons.length === 1 ? seasonLabel(seasons, 0) : 'Episodi'}
            </Text>
            {episodes.length > PAGE ? (
              <Text style={styles.epCount}>
                {start + 1}–{winEnd} / {episodes.length}
              </Text>
            ) : null}
            {loading ? <Spinner size="small" /> : null}
          </View>
          {/* ↓/→ out of the episodes are handled above (enterRelated). */}
          <TVFocusGuideView
            style={[styles.window, {height: tileH * PAGE}, loading && styles.dim]}
            trapFocusDown={hasRelated}
            trapFocusRight={hasRelated}>
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
                    onBlur={() => {
                      inEpisodes.current = false;
                    }}
                    onFocus={() => {
                      inEpisodes.current = true;
                      epFocusAt.current = Date.now();
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
          </TVFocusGuideView>
        </View>
      </View>
      {hasRelated ? (
        <View style={{height: footerH}}>
          <RelatedRow
            covered={covered || !!popup || !!download}
            pluginId={pluginId}
            lists={lists}
            L={L}
            cardH={cardH}
            hPad={hPad}
            onOpen={onOpenRelated}
            refocus={relatedRefocus + enterRelated}
            onExitUp={episodes.length ? () => focusSoon(() => epRefs.current.get(lastEp.current)) : undefined}
          />
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
                    kind: episodeKindLabel(e.extra?.filler),
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
  chips: {flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 10},
  infoChip: {flexDirection: 'row', alignItems: 'center', gap: 5},
  infoChipText: {color: 'rgba(255,255,255,0.54)', fontSize: 16},
  ratingRow: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 24, rowGap: 12},
  ratingItem: {flexDirection: 'row', alignItems: 'center', gap: 4},
  ratingText: {color: colors.textMid, fontSize: 13, fontWeight: '600'},
  airDate: {color: 'rgba(255,255,255,0.54)', fontSize: 13},
  crBadge: {paddingHorizontal: 14, paddingVertical: 4, borderWidth: 2, borderColor: colors.textLow, borderRadius: 8},
  crText: {color: 'rgba(255,255,255,0.54)', fontSize: 11, fontWeight: '600', letterSpacing: 1},
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
  pill: {borderColor: 'rgba(242,242,240,0.30)', backgroundColor: 'rgba(26,26,46,0.85)'},
  // Same border width as the others (the fill hides it): at 0 the selected
  // pill stood shorter than the rest.
  pillSelected: {backgroundColor: colors.primary, borderColor: colors.primary},
  pillFocused: {borderColor: colors.primary, backgroundColor: 'rgba(124,106,247,0.30)'},
  pillText: {color: colors.textMid, fontWeight: '500'},
  pillTextSelected: {fontWeight: '700'},
  textOn: {color: colors.textHigh},
  epHeader: {flexDirection: 'row', alignItems: 'center', gap: 10},
  // page.dart: a 3×22-unit tick, 10 units before the label (×2 here).
  tick: {width: 6, height: 44, borderRadius: 4, backgroundColor: colors.primary, marginRight: 10},
  epHeaderText: {color: colors.textHigh, fontWeight: '700', fontSize: 20},
  epCount: {color: colors.textLow, fontSize: 15, marginLeft: 2},
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
