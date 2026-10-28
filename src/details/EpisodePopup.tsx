// Episode card opened from a series' episode list, laid out like
// episode_popup.dart: still on top with the title over it, meta line, plot,
// director/guests, then the source buttons. Streams and GetDetails load
// together. Focus is trapped in it; Back closes it (SeriesLayout).
// Sizes as in Flutter: sh-relative values scale with k = H/1080, plain dp
// with u = H/540 (two pixels each on a 1080p Fire TV).

import React, {useEffect, useRef, useState} from 'react';
import {Image, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {Gradient} from '../components/Gradient';
import {Icon} from '../components/Icon';
import {mycelium} from '../core/api';
import {focusSoon} from '../core/focus';
import {backdropSrc} from '../core/images';
import type {ContinueWatchingItem, EpisodeDetails, EpisodeInfo} from '../gen/media';
import {colors, scaledStyles} from '../theme';
import {DownloadChip, SourceButtons, useSources} from './Sources';

function fmtDate(d: string): string {
  const p = d.split('-');
  return p.length < 3 ? d : `${p[2]}/${p[1]}/${p[0]}`;
}

export interface EpisodeContext {
  pluginId: string;
  /** Series id: the CW parent_id. */
  seriesId: string;
  seriesTitle: string;
  seriesPoster: string;
  seriesCover: string;
  seriesRating: number;
  seriesYear: number;
  seriesGenres: string[];
}

export function EpisodePopup({
  ctx,
  episode,
  W,
  H,
  cw,
  onPlay,
  onClose,
  onDownload,
}: {
  ctx: EpisodeContext;
  episode: EpisodeInfo;
  W: number;
  H: number;
  cw: ContinueWatchingItem[];
  onPlay: (streamId: string, sourceLabel: string, startAt: number, sources: ReturnType<typeof useSources>['sources']) => void;
  onClose: () => void;
  /** Set when the plugin supports downloads: opens the options for these sources. */
  onDownload?: (sources: ReturnType<typeof useSources>['sources']) => void;
}) {
  const s = H / 1080;
  const u = H / 540;
  const sources = useSources(ctx.pluginId, episode.id, ctx.seriesId);
  const [details, setDetails] = useState<EpisodeDetails | null>(null);
  const closeRef = useRef<View>(null);
  const [closeFocused, setCloseFocused] = useState(false);

  useEffect(() => {
    let alive = true;
    mycelium
      .getDetails(ctx.pluginId, episode.id)
      .then(r => alive && r.episode && setDetails(r.episode))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ctx.pluginId, episode.id]);

  // No source to focus: land on the close button.
  useEffect(() => {
    if (!sources.loading && !sources.sources.length && !sources.error) {
      return focusSoon(() => closeRef.current);
    }
  }, [sources.loading, sources.sources.length, sources.error]);

  const plot = details?.plot || episode.plot;
  const airDate = details?.airDate || episode.airDate;
  const duration = details?.duration || episode.duration;
  const vote = details?.vote || episode.vote;
  const directors = details?.directors ?? [];
  const guests = details?.guestStars ?? [];
  const meta = [
    episode.episodeNumber > 0 ? `Ep. ${episode.episodeNumber}` : '',
    airDate ? fmtDate(airDate) : '',
    duration > 0 ? `${duration} min` : '',
  ].filter(Boolean);

  const maxW = Math.min(1000 * u, Math.max(520 * u, W * 0.469));
  const maxH = H - 60 * u;
  const closeD = Math.min(52 * u, Math.max(22 * u, 40 * s));
  const thumb = episode.thumbnailUrl || ctx.seriesPoster;
  const resume = cw.find(
    c => c.pluginId === ctx.pluginId && c.progressTime > 0 && sources.sources.some(src => src.id === c.mediaId),
  );

  return (
    <View style={styles.scrim}>
      <TVFocusGuideView
        style={[styles.card, {width: maxW, maxHeight: maxH, borderRadius: 16 * u}]}
        trapFocusLeft
        trapFocusRight
        trapFocusUp
        trapFocusDown>
        <ScrollView>
          <View style={{height: maxH * 0.42}}>
            {thumb ? (
              <Image
                source={{uri: backdropSrc(thumb, Math.round(maxW))}}
                style={StyleSheet.absoluteFill}
                resizeMode={episode.thumbnailUrl ? 'cover' : 'contain'}
              />
            ) : null}
            <Gradient name="stillFade" direction="toBottom" />
            {episode.title ? (
              <Text
                style={[styles.stillTitle, {fontSize: 28 * s, lineHeight: 28 * s * 1.2, left: 24 * u, right: 60 * u, bottom: 18 * u}]}
                numberOfLines={2}>
                {episode.title}
              </Text>
            ) : null}
          </View>
          <View style={{paddingHorizontal: 24 * u, paddingTop: 16 * u, paddingBottom: 28 * u}}>
            {meta.length ? (
              <View style={styles.metaRow}>
                {vote > 0 ? (
                  <Text style={[styles.vote, {fontSize: 16 * s}]}>
                    <Text style={styles.star}>★ </Text>
                    {vote.toFixed(1)}
                    {'   '}
                  </Text>
                ) : null}
                <Text style={[styles.meta, {fontSize: 16 * s}]}>{meta.join('  ·  ')}</Text>
              </View>
            ) : null}
            {plot ? (
              <Text style={[styles.plot, {fontSize: 16 * s, lineHeight: 16 * s * 1.6, marginTop: 14 * s}]}>{plot}</Text>
            ) : null}
            {directors.length ? (
              <Text style={[styles.credit, {fontSize: 14 * s, marginTop: 14 * s}]}>
                <Text style={styles.creditKey}>Regia  </Text>
                {directors.join(', ')}
              </Text>
            ) : null}
            {guests.length ? (
              <Text style={[styles.credit, {fontSize: 14 * s, marginTop: 6 * s}]}>
                <Text style={styles.creditKey}>Guest  </Text>
                {guests.slice(0, 6).join(', ')}
              </Text>
            ) : null}
            <View style={{marginTop: 22 * s}}>
              <SourceButtons
                state={sources}
                s={s}
                focus={1}
                align="center"
                compact
                onPlay={src =>
                  onPlay(src.id, src.label, resume?.mediaId === src.id ? resume.progressTime : 0, sources.sources)
                }
                trailing={onDownload ? <DownloadChip s={s} onPress={() => onDownload(sources.sources)} /> : undefined}
              />
            </View>
          </View>
        </ScrollView>
        <Pressable
          ref={closeRef}
          accessibilityLabel="Chiudi"
          onFocus={() => setCloseFocused(true)}
          onBlur={() => setCloseFocused(false)}
          onPress={onClose}
          style={[
            styles.close,
            {top: 12 * u, right: 12 * u, width: closeD, height: closeD, borderRadius: closeD / 2},
            closeFocused && styles.closeFocused,
          ]}>
          <Icon name="close" size={closeD * 0.55} color={closeFocused ? colors.textHigh : colors.textMid} />
        </Pressable>
      </TVFocusGuideView>
    </View>
  );
}

const styles = scaledStyles({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {overflow: 'hidden', backgroundColor: '#14141F'},
  stillTitle: {
    position: 'absolute',
    color: colors.textHigh,
    fontWeight: '700',
    textShadowColor: '#000',
    textShadowRadius: 10,
  },
  metaRow: {flexDirection: 'row', alignItems: 'center'},
  vote: {color: colors.textMid},
  star: {color: '#FFD700'},
  meta: {color: 'rgba(255,255,255,0.54)'},
  plot: {color: 'rgba(242,242,240,0.8)'},
  credit: {color: colors.textMid},
  creditKey: {color: colors.textLow},
  close: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  closeFocused: {borderColor: colors.primary, backgroundColor: 'rgba(124,106,247,0.35)'},
});
