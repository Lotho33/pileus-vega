// Full-screen player (pileus-player playback_screen for TV, reduced to the
// essentials): resolve → open → overlay with seek bar and controls, the
// settings panel (player_settings_panel.dart: Audio — which also lists the
// item's languages, i.e. its sources —, Video quality, Formato, Sottotitoli,
// and Sorgente for live), Continue Watching heartbeat, live mode, and the
// "playing on another device" take-over. Episodes: previous/next in the
// overlay, the "Prossimo episodio" countdown (20 s into the ending, or the last 30 s)
// with auto-advance, intro/outro/recap skip buttons from `skip_times`, and the
// Continue Watching roll-forward to the next episode near the end. Past
// 80% the next episode is resolved in the background (EpisodePrefetcher);
// when it has no source at all its page opens instead (onOpenEpisode).
// A stall watchdog nudges, then reopens, a stream whose position stopped
// moving (playback_screen/view.dart's _armStallWatchdog); live streams also
// get a "Riavvia" button that rebuilds the player from scratch. A playback
// error waits 6 s before showing (most are one failed segment the player
// gets past); an HTTP 409 from the proxy means another device took the
// profile's playback and goes straight to the take-over prompt.
//
// Remote, overlay hidden: ←/→ seek (a held key previews and seeks once on
// release), OK pauses/resumes, ↑/↓ show the overlay. While a skip button or
// the countdown is up it holds focus instead (←/→ move between its buttons).
// Back: closes the panel, then hides the overlay, then leaves (saving the
// position).

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  TVFocusGuideView,
  useKeplerBackHandler,
  useTVEventHandler,
} from '@amazon-devices/react-native-kepler';
import {
  KeplerCaptionsView,
  KeplerVideoSurfaceView,
} from '@amazon-devices/react-native-w3cmedia';
import {FocusButton} from '../components/FocusButton';
import {Gradient} from '../components/Gradient';
import {Icon, IconName} from '../components/Icon';
import {mycelium} from '../core/api';
import {focusSoon} from '../core/focus';
import {
  AudioLangPref,
  languageNotice,
  parsePreferredLanguage,
  sourceMemory,
} from '../core/language';
import {backdropSrc} from '../core/images';
import {argbToCss, parseSubtitleStyle} from '../core/prefs';
import {useAuth} from '../state/auth';
import {colors, px, scaledStyles} from '../theme';
import {PlayerEngine, Track} from './engine';
import type {OpenTarget} from '../home/model';
import type {ResolveResponse} from '../gen/media';
import {
  activeSkip,
  CW_DROP,
  EpisodePrefetcher,
  NoSourceError,
  CW_ROLL_FORWARD,
  episodeTitle,
  hasNextEpisode,
  hasPrevEpisode,
  loadEpisodeNav,
  MIN_DURATION_FOR_END_LOGIC_SEC,
  nextEpisodeTick,
  parseSkipTimes,
  requestForEpisode,
  ROLL_FORWARD_START_SEC,
  sameSeasonNext,
  SkipInterval,
  SKIP_LABELS,
  stepEpisode,
  streamIdForNext,
} from './episodes';
import {
  classifyResolveError,
  fmtClock,
  PlayRequest,
  resolveWithRetry,
  saveProgress,
} from './session';
import {
  getViewMode,
  setViewMode,
  surfaceBox,
  ViewMode,
  VIEW_MODES,
} from './viewMode';
import {LiveFailover} from './liveFailover';

const HIDE_AFTER_MS = 5000;
const HEARTBEAT_MS = 10000;
const SEEK_STEP = 10;
const SEEK_STEP_HELD = 30;
const HELD_AFTER = 6;
// Stall watchdog (view.dart): check every 4 s; act after this long without
// the position moving (buffering gets the longer leash).
const STALL_CHECK_MS = 4000;
const STALL_LIVE_MS = {buffering: 18000, frozen: 9000};
const STALL_VOD_MS = {buffering: 25000, frozen: 15000};
const ERROR_GRACE_MS = 6000;
const SKIP_COLORS = {
  op: 'rgba(245,166,35,0.75)',
  ed: 'rgba(123,97,255,0.75)',
  recap: 'rgba(67,160,71,0.75)',
};

type Phase =
  | {kind: 'resolving'; message: string}
  | {kind: 'opening'}
  | {kind: 'playing'}
  | {kind: 'error'; message: string}
  | {kind: 'elsewhere'; message: string};

type Panel = null | 'master' | 'audio' | 'video' | 'format' | 'text' | 'source';

interface PanelItem {
  key: string;
  label: string;
  active?: boolean;
  /** A section label, not selectable. */
  heading?: boolean;
  onPress?: () => void;
}

const ControlButton = forwardRef<
  View,
  {icon?: IconName; label?: string; onPress: () => void; onFocus?: () => void}
>(function ControlButton({icon, label, onPress, onFocus}, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      ref={ref}
      accessibilityLabel={label ?? icon}
      onFocus={() => {
        setFocused(true);
        onFocus?.();
      }}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[
        styles.ctrl,
        label ? styles.ctrlWide : null,
        focused && styles.ctrlFocused,
      ]}>
      {icon ? (
        <Icon
          name={icon}
          size={px(36)}
          color={focused ? colors.bg : colors.textHigh}
        />
      ) : null}
      {label ? (
        <Text style={[styles.ctrlText, focused && styles.ctrlTextFocused]}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
});

/** The skip and countdown buttons (skip_intro_button.dart). */
const PromptButton = forwardRef<
  View,
  {icon: IconName; label?: string; primary?: boolean; onPress: () => void}
>(function PromptButton({icon, label, primary, onPress}, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      ref={ref}
      accessibilityLabel={label ?? 'Chiudi'}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[
        label ? styles.prompt : styles.promptClose,
        primary && styles.promptPrimary,
        focused && styles.promptFocused,
      ]}>
      <Icon
        name={icon}
        size={px(label ? (primary ? 36 : 44) : 32)}
        color={
          primary && !focused
            ? colors.bg
            : label || focused
            ? colors.textHigh
            : colors.textMid
        }
      />
      {label ? (
        <Text
          style={[
            styles.promptText,
            primary && styles.promptTextPrimary,
            primary && !focused && styles.promptTextDark,
          ]}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
});

function PanelRow({
  label,
  value,
  active,
  first,
  onPress,
}: {
  label: string;
  /** Master rows: the current choice, with a chevron. */
  value?: string;
  active?: boolean;
  first: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<View>(null);
  useEffect(() => (first ? focusSoon(() => ref.current) : undefined), [first]);
  return (
    <Pressable
      ref={ref}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[styles.row, focused && styles.rowFocused]}>
      <Text
        style={[styles.rowText, (focused || active) && styles.rowTextOn]}
        numberOfLines={1}>
        {label}
      </Text>
      {value !== undefined ? (
        <>
          <Text style={styles.rowValue} numberOfLines={1}>
            {value}
          </Text>
          <Icon
            name="chevronRight"
            size={px(28)}
            color={focused ? colors.textHigh : colors.textLow}
          />
        </>
      ) : active ? (
        <Text style={styles.check}>✓</Text>
      ) : null}
    </Pressable>
  );
}

export function PlayerScreen({
  request,
  onExit,
  onOpenEpisode,
}: {
  request: PlayRequest;
  onExit: () => void;
  /** The next/previous episode has no source: show its page instead. */
  onOpenEpisode?: (target: OpenTarget) => void;
}) {
  const keplerBack = useKeplerBackHandler();
  const [req, setReq] = useState(request);
  const [phase, setPhase] = useState<Phase>({kind: 'resolving', message: ''});
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [overlay, setOverlay] = useState(true);
  const [panel, setPanel] = useState<Panel>(null);
  const [audio, setAudio] = useState<Track[]>([]);
  const [text, setText] = useState<Track[]>([]);
  const [video, setVideo] = useState<Track[]>([]);
  const [viewMode, setMode] = useState<ViewMode>(getViewMode());
  const [videoSize, setVideoSize] = useState({w: 0, h: 0});
  const {width: W, height: H} = useWindowDimensions();
  const {profile} = useAuth();
  const subStyle = parseSubtitleStyle(profile?.preferencesJson ?? '');
  const [subText, setSubText] = useState('');
  const [preview, setPreview] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [skips, setSkips] = useState<SkipInterval[]>([]);
  const [skipDismissed, setSkipDismissed] = useState<SkipInterval | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [switching, setSwitching] = useState(false);

  const engine = useRef<PlayerEngine | null>(null);
  const alive = useRef(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playBtn = useRef<View>(null);
  const skipBtn = useRef<View>(null);
  const bannerBtn = useRef<View>(null);
  const reqRef = useRef(req);
  reqRef.current = req;
  // Per episode: the end-of-episode CW update ran (no more saves), the
  // auto-advance fired, and an episode switch is under way (the position
  // still belongs to the outgoing episode: no saves, no end logic).
  const progressCleared = useRef(false);
  const autoAdvanced = useRef(false);
  const transitioning = useRef(false);
  // A Continue Watching resume's episode list is still loading: until it
  // lands, "is there a next episode?" has no answer.
  const navLoading = useRef(false);
  const prefetcher = useRef(new EpisodePrefetcher()).current;
  // Watchdog: when the position last moved, and how many nudges so far.
  const lastPos = useRef(-1);
  const lastProgressAt = useRef(0);
  const stallStrikes = useRef(0);
  // Kept to hand them to a rebuilt engine ("Riavvia").
  const surfaceHandle = useRef<string | null>(null);
  const captionsHandle = useRef<string | null>(null);
  const errorGrace = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Audio track remembered per series (audio_lang_pref.dart), and the live
  // node failover (live_failover.dart), rebuilt for each live request.
  const audioPref = useRef(
    new AudioLangPref(() => ({
      pluginId: reqRef.current.pluginId,
      seriesId: reqRef.current.parentId,
    })),
  ).current;
  const failover = useRef<LiveFailover | null>(null);
  // The language label was remembered for the stream playing now.
  const rememberedFor = useRef('');
  // Set below, once start() exists: moves a failing live to its next node.
  const failoverRef = useRef<() => boolean>(() => false);

  const flushProgress = useCallback(async () => {
    const e = engine.current;
    if (!e || progressCleared.current || transitioning.current) {
      return;
    }
    try {
      const other = await saveProgress(reqRef.current, e.position, e.duration);
      if (other && alive.current) {
        e.pause();
        setPhase({
          kind: 'elsewhere',
          message: `In riproduzione su «${other}».`,
        });
      }
    } catch {
      // A missed beat is retried by the next one.
    }
  }, []);

  const start = useCallback(
    async (r: PlayRequest, takeOver: boolean, pre?: ResolveResponse) => {
      setPhase({kind: 'resolving', message: ''});
      setPanel(null);
      audioPref.reset();
      if (r.isLive) {
        const ids = r.sources.map((x) => x.id);
        if (
          !failover.current ||
          failover.current.sources.join('\n') !== ids.join('\n')
        ) {
          failover.current = new LiveFailover(ids, r.streamId);
        } else {
          failover.current.switchedTo(r.streamId);
        }
      } else {
        failover.current = null;
      }
      lastProgressAt.current = Date.now();
      stallStrikes.current = 0;
      if (errorGrace.current) {
        clearTimeout(errorGrace.current);
      }
      try {
        const resolved = r.directUrl
          ? {
              resolvedUrl: r.directUrl,
              httpHeaders: {} as Record<string, string>,
              isLive: false,
              extra: {} as Record<string, string>,
            }
          : pre
          ? pre
          : await resolveWithRetry(r, {
              takeOver,
              isCancelled: () => !alive.current,
              onRetry: (n, of) =>
                alive.current &&
                setPhase({
                  kind: 'resolving',
                  message: `Nuovo tentativo ${n} di ${of}…`,
                }),
            });
        if (!alive.current) {
          return;
        }
        setSkips(r.isLive ? [] : parseSkipTimes(resolved.extra?.skip_times));
        setSkipDismissed(null);
        setPhase({kind: 'opening'});
        if (!engine.current) {
          const e = new PlayerEngine();
          await e.init();
          engine.current = e;
          if (surfaceHandle.current) {
            e.setSurface(surfaceHandle.current);
          }
          if (captionsHandle.current) {
            e.setCaptions(captionsHandle.current);
          }
          e.on('timeupdate', () => {
            if (e.position !== lastPos.current) {
              lastPos.current = e.position;
              lastProgressAt.current = Date.now();
              failover.current?.playing();
            }
            setPosition(e.position);
            setDuration(e.duration);
          });
          e.on('loadedmetadata', () => {
            setDuration(e.duration);
            setVideoSize(e.videoSize);
          });
          e.on('resize', () => setVideoSize(e.videoSize));
          e.on('playing', () => {
            const cur = reqRef.current;
            if (rememberedFor.current !== cur.streamId) {
              rememberedFor.current = cur.streamId;
              sourceMemory.remember(
                cur.pluginId,
                cur.parentId,
                cur.sourceLabel,
              );
            }
            transitioning.current = false;
            setBuffering(false);
            setPaused(false);
            setPhase((p) => (p.kind === 'opening' ? {kind: 'playing'} : p));
          });
          e.on('pause', () => setPaused(true));
          e.on('waiting', () => setBuffering(true));
          e.on('tracks', () => {
            const want = audioPref.pick(e.audioTracks());
            if (want) {
              e.selectAudio(want.id);
            }
            setAudio(e.audioTracks());
            setText(e.textTracks());
            setVideo(e.videoTracks());
            setVideoSize(e.videoSize);
          });
          e.on('error', () => {
            const message = e.lastError || 'Errore di riproduzione.';
            // profile_lease_conflict.dart: the proxy's 409 never recovers.
            if (/HTTP 409\b/.test(message)) {
              flushProgress();
              e.pause();
              setPhase({
                kind: 'elsewhere',
                message: 'Riproduzione spostata su un altro dispositivo.',
              });
              return;
            }
            const firedAt = Date.now();
            if (errorGrace.current) {
              clearTimeout(errorGrace.current);
            }
            errorGrace.current = setTimeout(() => {
              if (
                alive.current &&
                engine.current === e &&
                lastProgressAt.current <= firedAt
              ) {
                if (!failoverRef.current()) {
                  setPhase({kind: 'error', message});
                }
              }
            }, ERROR_GRACE_MS);
          });
          e.on('ended', () => {
            if (hasNextEpisode(reqRef.current.nav)) {
              if (!autoAdvanced.current) {
                autoAdvanced.current = true;
                goToEpisodeRef.current(1);
              }
              return;
            }
            flushProgress();
            onExit();
          });
        }
        await engine.current.open(resolved.resolvedUrl, {
          startAt: r.isLive ? 0 : r.startAt,
          headers: resolved.httpHeaders,
          isLive: r.isLive || resolved.isLive,
        });
        engine.current.play();
      } catch (err) {
        if (!alive.current) {
          return;
        }
        const f = classifyResolveError(err);
        if (f.kind === 'elsewhere') {
          setPhase({kind: 'elsewhere', message: f.message});
        } else if (failoverRef.current()) {
          // Moved on to the event's next node.
        } else {
          setPhase({
            kind: 'error',
            message:
              engine.current?.lastError ||
              f.message ||
              'Stream non disponibile.',
          });
        }
      }
    },
    [flushProgress, onExit, audioPref],
  );

  failoverRef.current = () => {
    const cur = reqRef.current;
    const nextId = cur.isLive ? failover.current?.next() : null;
    const src = nextId ? cur.sources.find((x) => x.id === nextId) : undefined;
    if (!src || !alive.current) {
      return false;
    }
    const next = {...cur, streamId: src.id, sourceLabel: src.label, startAt: 0};
    setReq(next);
    start(next, false);
    return true;
  };

  // Previous (-1) / next (+1) episode, across season boundaries, on the
  // source with the label playing now.
  const goToEpisode = useCallback(
    async (delta: number) => {
      const cur = reqRef.current;
      if (switching || !cur.nav) {
        return;
      }
      setSwitching(true);
      try {
        const nav = await stepEpisode(
          cur.pluginId,
          cur.nav,
          cur.nav.index + delta,
        );
        if (!nav || !alive.current) {
          return;
        }
        const pre = prefetcher.take(nav.episodes[nav.index].id);
        let next: PlayRequest;
        try {
          next = await requestForEpisode(cur, nav, pre?.sources);
        } catch (err) {
          if (err instanceof NoSourceError && onOpenEpisode) {
            // Its page says why and still offers what there is (download).
            await flushProgress();
            const ep = nav.episodes[nav.index];
            onOpenEpisode({
              pluginId: cur.pluginId,
              mediaId: ep.id,
              mediaType: 'episode',
              isDir: false,
              title: ep.title,
              view: 'episode',
              showTitle: cur.showTitle,
              nav,
              sourceLabel: cur.sourceLabel,
            });
            return;
          }
          throw err;
        }
        if (!alive.current) {
          return;
        }
        // Final save for the outgoing episode while its position is still
        // the engine's, then no more saves until the new one plays.
        await flushProgress();
        transitioning.current = true;
        progressCleared.current = false;
        autoAdvanced.current = false;
        engine.current?.pause();
        setPosition(0);
        setDuration(0);
        setBannerDismissed(false);
        setSkips([]);
        setReq(next);
        start(
          next,
          false,
          pre && pre.streamId === next.streamId ? pre.resolved : undefined,
        );
      } catch (err) {
        if (alive.current) {
          const msg = err instanceof Error ? err.message : String(err);
          setPhase({
            kind: 'error',
            message: `Impossibile cambiare episodio: ${msg}`,
          });
        }
      } finally {
        if (alive.current) {
          setSwitching(false);
        }
      }
    },
    [switching, flushProgress, start, prefetcher, onOpenEpisode],
  );
  const goToEpisodeRef = useRef(goToEpisode);
  goToEpisodeRef.current = goToEpisode;

  useEffect(() => {
    alive.current = true;
    start(request, false);
    // A Continue Watching resume carries no episode list: place it in its
    // season so previous/next and the countdown work too.
    // Not for a downloaded file: the next one would stream from the server.
    if (!request.nav && !request.directUrl) {
      navLoading.current = true;
      loadEpisodeNav(request)
        .then((r) => {
          if (r && alive.current) {
            setReq((cur) =>
              cur.streamId === request.streamId
                ? {
                    ...cur,
                    nav: r.nav,
                    sourceLabel: cur.sourceLabel || r.sourceLabel,
                  }
                : cur,
            );
          }
        })
        .catch(() => {})
        .finally(() => {
          navLoading.current = false;
        });
    }
    return () => {
      alive.current = false;
      if (errorGrace.current) {
        clearTimeout(errorGrace.current);
      }
      const e = engine.current;
      engine.current = null;
      if (e) {
        if (!progressCleared.current && !transitioning.current) {
          saveProgress(reqRef.current, e.position, e.duration).catch(() => {});
        }
        e.destroy();
      }
      mycelium.releasePlayback().catch(() => {});
    };
    // The request only changes through start() itself (source switch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subtitle text follows the position (cues are timed to the stream).
  useEffect(() => {
    if (phase.kind !== 'playing') {
      return;
    }
    const t = setInterval(() => {
      const e = engine.current;
      const next = e ? e.cues.textAt(e.position) : '';
      setSubText((cur) => (cur === next ? cur : next));
    }, 200);
    return () => clearInterval(t);
  }, [phase.kind]);

  // Heartbeat while playing, plus one on every pause.
  useEffect(() => {
    if (phase.kind !== 'playing' || paused) {
      if (paused) {
        flushProgress();
      }
      return;
    }
    const t = setInterval(flushProgress, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [phase.kind, paused, flushProgress]);

  // End of an episode: Continue Watching rolls forward to the next episode
  // of this season at 90% (so the series stays in the row, "up next"), or
  // the entry goes at 95% when nothing follows (a movie, the last episode).
  // At a season boundary the entry stays as is.
  useEffect(() => {
    if (
      req.isLive ||
      phase.kind !== 'playing' ||
      transitioning.current ||
      progressCleared.current ||
      navLoading.current ||
      duration <= 0
    ) {
      return;
    }
    const frac = position / duration;
    const next = sameSeasonNext(req.nav);
    if (next && frac >= CW_ROLL_FORWARD) {
      progressCleared.current = true;
      const r = req;
      const nav = r.nav!;
      streamIdForNext(r.pluginId, next, r.sourceLabel)
        .then((mediaId) =>
          mycelium.updateProgress({
            pluginId: r.pluginId,
            mediaId,
            parentId: r.parentId,
            // totalDuration 0 on purpose: the card's bar reads empty.
            currentPosition: ROLL_FORWARD_START_SEC,
            totalDuration: 0,
            navigationContext: r.showTitle,
            title: episodeTitle(next, r.showTitle),
            poster: next.thumb || nav.seriesPoster || r.poster,
            rating: r.rating,
            genres: r.genres,
            plot: r.plot,
            year: r.year,
            seasonNumber: next.seasonNumber || r.seasonNumber,
            episodeNumber: next.episodeNumber,
          }),
        )
        .catch(() => {})
        .finally(() =>
          mycelium.deleteProgress(r.pluginId, r.streamId).catch(() => {}),
        );
    } else if (!hasNextEpisode(req.nav) && frac >= CW_DROP) {
      progressCleared.current = true;
      mycelium.deleteProgress(req.pluginId, req.streamId).catch(() => {});
    }
  }, [position, duration, phase.kind, req]);

  // Resolve the next episode of the season in the background past 80%.
  useEffect(() => {
    if (
      !req.isLive &&
      phase.kind === 'playing' &&
      !transitioning.current &&
      !req.directUrl
    ) {
      prefetcher.maybeStart(
        req.pluginId,
        position,
        duration,
        sameSeasonNext(req.nav),
        req.sourceLabel,
      );
    }
  }, [position, duration, phase.kind, req, prefetcher]);
  useEffect(() => () => prefetcher.clear(), [prefetcher]);

  // Rebuilds the player from scratch at the current point: the "Riavvia"
  // button, for a picture that froze while everything else looks fine
  // (_restartPlayerInPlace).
  const restartPlayer = useCallback(async () => {
    const old = engine.current;
    const r = reqRef.current;
    const at = !r.isLive && old ? old.position : r.startAt;
    engine.current = null;
    if (old) {
      if (surfaceHandle.current) {
        old.clearSurface(surfaceHandle.current);
      }
      await old.destroy();
    }
    if (alive.current) {
      start({...r, startAt: at}, false);
    }
  }, [start]);

  // Stall watchdog: a stream whose position stopped moving while it should
  // play. Frozen but not buffering: first a pause/play nudge, then reopen;
  // stuck buffering: reopen straight away (at the same point for VOD).
  useEffect(() => {
    if (phase.kind !== 'playing') {
      return;
    }
    const t = setInterval(() => {
      const e = engine.current;
      if (!e || e.paused || transitioning.current || !alive.current) {
        return;
      }
      const limits = reqRef.current.isLive ? STALL_LIVE_MS : STALL_VOD_MS;
      const stalledFor = Date.now() - lastProgressAt.current;
      if (stalledFor < (buffering ? limits.buffering : limits.frozen)) {
        return;
      }
      const reopen = () => {
        const r = reqRef.current;
        start(
          {...r, startAt: r.isLive ? 0 : Math.max(0, lastPos.current)},
          false,
        );
      };
      if (buffering) {
        stallStrikes.current = 0;
        reopen();
      } else if (++stallStrikes.current <= 1) {
        e.pause();
        e.play();
      } else {
        stallStrikes.current = 0;
        reopen();
      }
      // A full interval for the recovery to show progress.
      lastProgressAt.current = Date.now();
    }, STALL_CHECK_MS);
    return () => clearInterval(t);
  }, [phase.kind, buffering, start]);

  const bumpOverlay = useCallback(() => {
    setOverlay(true);
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }
    hideTimer.current = setTimeout(() => {
      if (engine.current && !engine.current.paused) {
        setOverlay(false);
      }
    }, HIDE_AFTER_MS);
  }, []);

  useEffect(() => {
    bumpOverlay();
    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, [bumpOverlay]);

  // Showing the overlay puts focus on play/pause.
  useEffect(() => {
    if (overlay && !panel && phase.kind === 'playing') {
      return focusSoon(() => playBtn.current);
    }
  }, [overlay, panel, phase.kind]);

  const togglePlay = useCallback(() => {
    const e = engine.current;
    if (!e) {
      return;
    }
    if (e.paused) {
      e.play();
    } else if (!reqRef.current.isLive) {
      // A live can't be paused: it would only fall behind the event (and
      // out of the server's window). OK / play-pause just show the controls.
      e.pause();
    }
    bumpOverlay();
  }, [bumpOverlay]);

  const seekBy = useCallback(
    (delta: number) => {
      const e = engine.current;
      if (!e || req.isLive) {
        return;
      }
      e.seek(e.position + delta);
      bumpOverlay();
    },
    [req.isLive, bumpOverlay],
  );

  // Skip button: the interval under the playhead, unless dismissed. On the
  // ending, with an episode after this one, it jumps there instead.
  const skip =
    phase.kind === 'playing' && !req.isLive && !switching
      ? activeSkip(skips, position)
      : null;
  const showSkipButton = !!skip && skip !== skipDismissed;
  const hasNext = hasNextEpisode(req.nav);
  const hasPrev = hasPrevEpisode(req.nav);
  const outroToNext = showSkipButton && skip.type === 'ed' && hasNext;
  const endLogic =
    phase.kind === 'playing' &&
    !req.isLive &&
    hasNext &&
    !switching &&
    duration > MIN_DURATION_FOR_END_LOGIC_SEC;
  const tick = endLogic
    ? nextEpisodeTick(position, duration, skips, bannerDismissed)
    : null;
  const bannerSecs = tick?.bannerSecs ?? null;
  const showBanner = bannerSecs !== null;
  // The countdown already offers "Vai subito": no second button on the ending.
  const showSkip = showSkipButton && !(outroToNext && showBanner);
  const nextEp =
    req.nav && hasNext ? req.nav.episodes[req.nav.index + 1] : undefined;

  // The prompt holding focus while the overlay is hidden.
  const promptKey = showBanner
    ? 'banner'
    : showSkip
    ? `skip:${skip.type}:${skip.start}`
    : '';

  useEffect(() => {
    if (promptKey && !panel) {
      return focusSoon(() =>
        promptKey === 'banner' ? bannerBtn.current : skipBtn.current,
      );
    }
    // Only a new prompt (or the overlay going away) moves focus here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptKey]);
  useEffect(() => {
    if (promptKey && !overlay && !panel) {
      return focusSoon(() =>
        promptKey === 'banner' ? bannerBtn.current : skipBtn.current,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay, panel]);

  // The ending's countdown ran out, or the end of a stream whose 'ended'
  // never comes: advance.
  const advance = !!tick?.advance;
  useEffect(() => {
    if (advance && !transitioning.current && !autoAdvanced.current) {
      autoAdvanced.current = true;
      goToEpisode(1);
    }
  }, [advance, goToEpisode]);

  // Held ←/→ with the overlay hidden: preview the target, seek on release.
  const held = useRef({dir: 0, count: 0, target: 0});
  useTVEventHandler((evt) => {
    if (phase.kind !== 'playing' || panel) {
      return;
    }
    const isSeek = evt.eventType === 'left' || evt.eventType === 'right';
    if (overlay) {
      bumpOverlay();
      return;
    }
    // A skip button or the countdown has focus: ←/→ move between its
    // buttons, the other keys still bring up the overlay below.
    if (isSeek && promptKey) {
      return;
    }
    if (isSeek && !req.isLive) {
      const e = engine.current;
      if (!e) {
        return;
      }
      const dir = evt.eventType === 'right' ? 1 : -1;
      if (evt.eventKeyAction === 1) {
        if (held.current.dir) {
          e.seek(held.current.target);
          held.current = {dir: 0, count: 0, target: 0};
          setPreview(null);
        }
        return;
      }
      const h = held.current;
      const base = h.dir === dir ? h.target : e.position;
      const count = h.dir === dir ? h.count + 1 : 1;
      const step = count > HELD_AFTER ? SEEK_STEP_HELD : SEEK_STEP;
      const max = e.duration > 0 ? e.duration - 1 : base + step;
      const target = Math.max(0, Math.min(max, base + dir * step));
      held.current = {dir, count, target};
      setPreview(target);
      return;
    }
    if (evt.eventKeyAction === 1) {
      return;
    }
    // OK reaches the focus catcher's onPress; only the media keys come here.
    const t = evt.eventType.toLowerCase();
    if (t === 'playpause' || t === 'play' || t === 'pause') {
      togglePlay();
    } else if (t !== 'select') {
      bumpOverlay();
    }
  });

  useEffect(() => {
    const sub = keplerBack.addEventListener('hardwareBackPress', () => {
      if (panel && panel !== 'master') {
        setPanel('master');
      } else if (panel) {
        setPanel(null);
        bumpOverlay();
      } else if (overlay && phase.kind === 'playing' && !paused) {
        setOverlay(false);
      } else {
        onExit();
      }
      return true;
    });
    return () => sub.remove();
  }, [panel, overlay, phase.kind, paused, onExit, keplerBack, bumpOverlay]);

  const switchSource = (id: string) => {
    const src = req.sources.find((s) => s.id === id);
    if (!src || src.id === req.streamId) {
      setPanel(null);
      return;
    }
    flushProgress();
    failover.current?.switchedTo(src.id);
    sourceMemory.remember(req.pluginId, req.parentId, src.label);
    const at = engine.current && !req.isLive ? engine.current.position : 0;
    const next = {
      ...req,
      streamId: src.id,
      sourceLabel: src.label,
      startAt: at,
    };
    setReq(next);
    start(next, false);
  };

  const shownPos = preview ?? position;
  const progress = duration > 0 ? Math.min(1, shownPos / duration) : 0;
  const heading = req.showTitle || req.title;
  const sub = req.showTitle
    ? [
        req.seasonNumber > 0 && req.episodeNumber > 0
          ? `S${req.seasonNumber} · E${req.episodeNumber}`
          : '',
        req.title,
      ]
        .filter(Boolean)
        .join('  ·  ')
    : req.sourceLabel;

  // "Disponibile solo in inglese" while it loads (languageNotice): a version
  // other than the profile's preferred one is never a surprise.
  const languageNote = req.isLive
    ? ''
    : languageNotice(
        req.sources,
        req.sources.find((x) => x.id === req.streamId) ?? null,
        parsePreferredLanguage(profile?.preferencesJson ?? ''),
      );

  // For VOD the item's sources are its languages: they live under Audio,
  // together with the stream's own audio tracks when it has several.
  const languages = !req.isLive && req.sources.length > 1 ? req.sources : [];
  const activeAudio = audio.find((t) => t.active);
  const activeText = text.find((t) => t.active);
  const activeVideo = video.find((t) => t.active);
  const done = () => {
    setPanel(null);
    bumpOverlay();
  };
  const audioValue =
    [
      languages.length ? req.sourceLabel : '',
      audio.length > 1 ? activeAudio?.label ?? '' : '',
    ]
      .filter(Boolean)
      .join(' · ') || '—';

  let panelTitle = 'Impostazioni';
  let panelItems: PanelItem[] = [];
  if (panel === 'master') {
    panelItems = [
      ...(languages.length || audio.length > 1
        ? [
            {
              key: 'audio',
              label: 'Audio',
              value: audioValue,
              onPress: () => setPanel('audio'),
            },
          ]
        : []),
      ...(video.length
        ? [
            {
              key: 'video',
              label: 'Video',
              value: activeVideo?.label ?? '—',
              onPress: () => setPanel('video'),
            },
          ]
        : []),
      {
        key: 'format',
        label: 'Formato',
        value: VIEW_MODES.find((m) => m.id === viewMode)?.label ?? '',
        onPress: () => setPanel('format'),
      },
      ...(text.length
        ? [
            {
              key: 'text',
              label: 'Sottotitoli',
              value: activeText?.label ?? 'Disattivati',
              onPress: () => setPanel('text'),
            },
          ]
        : []),
      ...(req.isLive && req.sources.length > 1
        ? [
            {
              key: 'source',
              label: 'Sorgente',
              value: req.sourceLabel,
              onPress: () => setPanel('source'),
            },
          ]
        : []),
    ] as (PanelItem & {value?: string})[];
  } else if (panel === 'audio') {
    panelTitle = 'Audio';
    panelItems = [
      ...(languages.length && audio.length > 1
        ? [{key: 'h-lang', label: 'LINGUA', heading: true}]
        : []),
      ...languages.map((src) => ({
        key: `s${src.id}`,
        label: src.label || 'Sorgente',
        active: src.id === req.streamId,
        onPress: () => {
          switchSource(src.id);
          done();
        },
      })),
      ...(languages.length && audio.length > 1
        ? [{key: 'h-track', label: 'TRACCIA AUDIO', heading: true}]
        : []),
      ...(audio.length > 1
        ? audio.map((t) => ({
            key: t.id,
            label: t.label,
            active: t.active,
            onPress: () => {
              engine.current?.selectAudio(t.id);
              audioPref.remember(t.label);
              done();
            },
          }))
        : []),
    ];
  } else if (panel === 'video') {
    panelTitle = 'Video';
    panelItems = video.map((t) => ({
      key: t.id,
      label: t.label,
      active: t.active,
      onPress: () => {
        engine.current?.selectVideo(t.id);
        done();
      },
    }));
  } else if (panel === 'format') {
    panelTitle = 'Formato';
    panelItems = VIEW_MODES.map((m) => ({
      key: m.id,
      label: m.label,
      active: m.id === viewMode,
      onPress: () => {
        setViewMode(m.id);
        setMode(m.id);
        done();
      },
    }));
  } else if (panel === 'text') {
    panelTitle = 'Sottotitoli';
    panelItems = [
      {
        key: 'off',
        label: 'Disattivati',
        active: !activeText,
        onPress: () => (engine.current?.selectText(null), done()),
      },
      ...text.map((t) => ({
        key: t.id,
        label: t.label,
        active: t.active,
        onPress: () => {
          engine.current?.selectText(t.id);
          done();
        },
      })),
    ];
  } else if (panel === 'source') {
    panelTitle = 'Sorgente';
    panelItems = req.sources.map((src) => ({
      key: src.id,
      label: src.label || 'Sorgente',
      active: src.id === req.streamId,
      onPress: () => {
        switchSource(src.id);
        done();
      },
    }));
  }
  const selectable = panelItems.filter((i) => !i.heading);
  const firstKey = (selectable.find((i) => i.active) ?? selectable[0])?.key;
  const box = surfaceBox(viewMode, W, H, videoSize.w, videoSize.h);

  const catcherOn =
    !panel &&
    !(phase.kind === 'playing' && (overlay || promptKey)) &&
    phase.kind !== 'error' &&
    phase.kind !== 'elsewhere';
  const promptBottom = px(overlay ? 300 : 119);

  // Trapped as a whole: the details page below keeps its focusables, and
  // with the overlay hidden the catcher is the only thing to focus here.
  return (
    <TVFocusGuideView
      style={styles.root}
      trapFocusUp
      trapFocusDown
      trapFocusLeft
      trapFocusRight>
      <KeplerVideoSurfaceView
        style={[styles.surface, box]}
        onSurfaceViewCreated={(h: string) => {
          surfaceHandle.current = h;
          if (engine.current) {
            engine.current.setSurface(h);
          } else {
            pendingSurface(engine, h);
          }
        }}
        onSurfaceViewDestroyed={(h: string) => {
          if (surfaceHandle.current === h) {
            surfaceHandle.current = null;
          }
          engine.current?.clearSurface(h);
        }}
      />
      <KeplerCaptionsView
        show
        style={styles.captions}
        onCaptionViewCreated={(h: string) => {
          captionsHandle.current = h;
          engine.current?.setCaptions(h);
        }}
      />
      {subText ? (
        <View
          style={[styles.subsWrap, {bottom: subStyle.bottomPadding}]}
          pointerEvents="none">
          <Text
            style={[
              styles.subs,
              {
                fontSize: subStyle.fontSize,
                lineHeight: subStyle.fontSize * 1.4,
                color: argbToCss(subStyle.colorArgb),
              },
              subStyle.bgEnabled ? styles.subsBg : styles.subsShadow,
            ]}>
            {subText}
          </Text>
        </View>
      ) : null}
      {catcherOn ? (
        <FocusCatcher
          onPress={phase.kind === 'playing' ? togglePlay : bumpOverlay}
        />
      ) : null}

      {phase.kind === 'resolving' || phase.kind === 'opening' ? (
        // player_loading_backdrop.dart: the title's picture, darkened, with
        // its name and where it starts — instead of a bare black screen.
        <View style={styles.backdrop} pointerEvents="none">
          {req.poster ? (
            <Image
              source={{uri: backdropSrc(req.poster, W)}}
              style={[StyleSheet.absoluteFill, styles.backdropImage]}
              resizeMode="cover"
            />
          ) : null}
          <Gradient name="playerBottom" direction="toBottom" />
          <View style={styles.backdropText}>
            {heading ? (
              <Text style={styles.backdropTitle} numberOfLines={2}>
                {heading}
              </Text>
            ) : null}
            {[
              sub,
              !req.isLive && req.startAt > 0
                ? `Riprende da ${fmtClock(req.startAt)}`
                : '',
              languageNote,
            ]
              .filter(Boolean)
              .map((l) => (
                <Text key={l} style={styles.backdropLine}>
                  {l}
                </Text>
              ))}
          </View>
        </View>
      ) : null}
      {phase.kind === 'resolving' ||
      phase.kind === 'opening' ||
      (buffering && phase.kind === 'playing') ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.textHigh} />
          {phase.kind === 'resolving' && phase.message ? (
            <Text style={styles.status}>{phase.message}</Text>
          ) : null}
        </View>
      ) : null}

      {phase.kind === 'playing' && overlay ? (
        <TVFocusGuideView
          style={StyleSheet.absoluteFill}
          trapFocusUp
          trapFocusDown
          trapFocusLeft
          trapFocusRight>
          <View style={styles.top}>
            <Gradient name="playerTop" direction="toBottom" />
            <Text style={styles.title} numberOfLines={1}>
              {heading}
            </Text>
            {sub ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {sub}
              </Text>
            ) : null}
          </View>
          <View style={styles.bottom}>
            {req.isLive ? (
              <View style={styles.liveRow}>
                <View style={styles.liveBadge}>
                  <Text style={styles.liveText}>IN DIRETTA</Text>
                </View>
              </View>
            ) : (
              <View style={styles.barRow}>
                <Text style={styles.time}>{fmtClock(shownPos)}</Text>
                <View style={styles.track}>
                  <View style={[styles.fill, {width: `${progress * 100}%`}]} />
                  {/* Skip intervals over the fill, coloured by type (player_seek_bar.dart). */}
                  {duration > 0
                    ? skips.map((k) => (
                        <View
                          key={`${k.type}${k.start}`}
                          style={[
                            styles.skipMark,
                            {backgroundColor: SKIP_COLORS[k.type]},
                            {
                              left: `${(k.start / duration) * 100}%`,
                              width: `${
                                ((Math.min(k.end, duration) - k.start) /
                                  duration) *
                                100
                              }%`,
                            },
                          ]}
                        />
                      ))
                    : null}
                  <View style={[styles.knob, {left: `${progress * 100}%`}]} />
                </View>
                <Text style={styles.time}>
                  {duration > 0 ? `-${fmtClock(duration - shownPos)}` : '--:--'}
                </Text>
              </View>
            )}
            <View style={styles.controls}>
              {hasPrev ? (
                <ControlButton
                  icon="skipPrevious"
                  onPress={() => goToEpisode(-1)}
                  onFocus={bumpOverlay}
                />
              ) : null}
              {!req.isLive ? (
                <ControlButton
                  label="−10"
                  onPress={() => seekBy(-SEEK_STEP)}
                  onFocus={bumpOverlay}
                />
              ) : null}
              {!req.isLive || paused ? (
                <ControlButton
                  ref={playBtn}
                  icon={paused ? 'play' : 'pause'}
                  onPress={togglePlay}
                  onFocus={bumpOverlay}
                />
              ) : null}
              {!req.isLive ? (
                <ControlButton
                  label="+10"
                  onPress={() => seekBy(SEEK_STEP)}
                  onFocus={bumpOverlay}
                />
              ) : null}
              {hasNext ? (
                <ControlButton
                  icon="skipNext"
                  onPress={() => goToEpisode(1)}
                  onFocus={bumpOverlay}
                />
              ) : null}
              {switching ? <ActivityIndicator color={colors.textHigh} /> : null}
              <View style={styles.spacer} />
              {req.isLive ? (
                <ControlButton
                  // No pause button on a live: the overlay's focus lands here.
                  ref={paused ? undefined : playBtn}
                  icon="refresh"
                  label="Riavvia"
                  onPress={restartPlayer}
                  onFocus={bumpOverlay}
                />
              ) : null}
              <ControlButton
                icon="settings"
                onPress={() => setPanel('master')}
                onFocus={bumpOverlay}
              />
            </View>
          </View>
        </TVFocusGuideView>
      ) : null}

      {showSkip && skip ? (
        <View style={[styles.promptRow, {bottom: promptBottom}]}>
          <PromptButton
            ref={skipBtn}
            icon={outroToNext ? 'skipNext' : 'fastForward'}
            label={outroToNext ? 'Prossimo episodio' : SKIP_LABELS[skip.type]}
            onPress={() => {
              setSkipDismissed(skip);
              if (outroToNext) {
                goToEpisode(1);
              } else {
                engine.current?.seek(skip.end);
              }
            }}
          />
          <PromptButton icon="close" onPress={() => setSkipDismissed(skip)} />
        </View>
      ) : null}

      {showBanner ? (
        <View
          style={[
            styles.banner,
            {bottom: promptBottom + px(showSkip ? 110 : 0)},
          ]}>
          <Text style={styles.bannerLabel}>
            Prossimo episodio in {bannerSecs}s
          </Text>
          {nextEp ? (
            <Text style={styles.bannerTitle} numberOfLines={1}>
              {episodeTitle(nextEp, req.showTitle)}
            </Text>
          ) : null}
          <View style={styles.bannerActions}>
            <PromptButton
              ref={bannerBtn}
              icon="skipNext"
              label="Vai subito"
              primary
              onPress={() => {
                setBannerDismissed(true);
                goToEpisode(1);
              }}
            />
            <PromptButton
              icon="close"
              onPress={() => {
                setBannerDismissed(true);
                if (skip?.type === 'ed') {
                  setSkipDismissed(skip);
                }
              }}
            />
          </View>
        </View>
      ) : null}

      {phase.kind === 'playing' && !overlay && preview !== null ? (
        <View style={styles.previewChip} pointerEvents="none">
          <Text style={styles.previewText}>
            {fmtClock(preview)} / {fmtClock(duration)}
          </Text>
        </View>
      ) : null}

      {panel ? (
        <TVFocusGuideView
          style={styles.panel}
          trapFocusUp
          trapFocusDown
          trapFocusLeft
          trapFocusRight>
          <Text style={styles.panelTitle}>{panelTitle}</Text>
          <ScrollView key={panel}>
            {panelItems.map((it) =>
              it.heading ? (
                <Text key={it.key} style={styles.panelHeading}>
                  {it.label}
                </Text>
              ) : (
                <PanelRow
                  key={it.key}
                  label={it.label}
                  value={(it as PanelItem & {value?: string}).value}
                  active={it.active}
                  first={it.key === firstKey}
                  onPress={() => it.onPress?.()}
                />
              ),
            )}
          </ScrollView>
        </TVFocusGuideView>
      ) : null}

      {phase.kind === 'error' || phase.kind === 'elsewhere' ? (
        <View style={styles.dialogScrim}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>
              {phase.kind === 'elsewhere'
                ? 'Profilo in uso su un altro dispositivo'
                : 'Impossibile riprodurre'}
            </Text>
            <Text style={styles.dialogText}>{phase.message}</Text>
            <View style={styles.dialogActions}>
              {phase.kind === 'elsewhere' ? (
                <FocusButton
                  label="Guarda qui"
                  primary
                  hasTVPreferredFocus
                  onPress={() =>
                    start(
                      {
                        ...reqRef.current,
                        startAt:
                          engine.current?.position || reqRef.current.startAt,
                      },
                      true,
                    )
                  }
                />
              ) : (
                <FocusButton
                  label="Riprova"
                  primary
                  hasTVPreferredFocus
                  onPress={() => {
                    setAttempt((a) => a + 1);
                    start(
                      {
                        ...reqRef.current,
                        startAt:
                          engine.current?.position || reqRef.current.startAt,
                      },
                      false,
                    );
                  }}
                />
              )}
              <FocusButton label="Indietro" onPress={onExit} />
            </View>
            {attempt > 2 ? (
              <Text style={styles.dialogHint}>
                Se continua, prova un'altra sorgente dalla scheda.
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </TVFocusGuideView>
  );
}

/** Invisible full-screen target holding focus while no control is shown. */
function FocusCatcher({onPress}: {onPress: () => void}) {
  const ref = useRef<View>(null);
  useEffect(() => focusSoon(() => ref.current), []);
  return (
    <Pressable
      ref={ref}
      accessibilityLabel="Riproduzione"
      onPress={onPress}
      style={styles.catcher}
    />
  );
}

// The surface can be created before the engine exists (it's mounted first):
// keep the handle and hand it over once the engine is up.
function pendingSurface(
  engine: React.MutableRefObject<PlayerEngine | null>,
  handle: string,
) {
  const t = setInterval(() => {
    if (engine.current) {
      engine.current.setSurface(handle);
      clearInterval(t);
    }
  }, 100);
  setTimeout(() => clearInterval(t), 60000);
}

const styles = scaledStyles({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  // Subtitle sizes are the profile's own (Flutter logical px = dp), so
  // they're given inline, outside the 1080p-scaled sheet.
  subsWrap: {position: 'absolute', left: 0, right: 0, alignItems: 'center'},
  subs: {
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 12,
    maxWidth: '80%',
  },
  subsBg: {backgroundColor: 'rgba(0,0,0,0.667)'},
  subsShadow: {textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 6},
  catcher: {...StyleSheet.absoluteFillObject, backgroundColor: 'transparent'},
  captions: {...StyleSheet.absoluteFillObject, backgroundColor: 'transparent'},
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  backdrop: {...StyleSheet.absoluteFillObject, backgroundColor: '#000'},
  backdropImage: {opacity: 0.45},
  backdropText: {position: 'absolute', left: 80, right: 80, bottom: 72},
  backdropTitle: {
    color: '#fff',
    fontSize: 52,
    fontWeight: '700',
    lineHeight: 60,
  },
  backdropLine: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 30,
    fontWeight: '600',
    marginTop: 12,
  },
  status: {color: colors.textMid, fontSize: 24},
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: 64,
    paddingTop: 48,
    paddingBottom: 80,
  },
  title: {color: colors.textHigh, fontSize: 40, fontWeight: '800'},
  subtitle: {color: colors.textMid, fontSize: 24, marginTop: 6},
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 64,
    paddingBottom: 48,
  },
  barRow: {flexDirection: 'row', alignItems: 'center', gap: 20},
  time: {
    color: colors.textHigh,
    fontSize: 22,
    minWidth: 110,
    textAlign: 'center',
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(242,242,240,0.25)',
    justifyContent: 'center',
  },
  fill: {height: 6, borderRadius: 3, backgroundColor: colors.primary},
  skipMark: {position: 'absolute', top: 0, height: 6, borderRadius: 3},
  knob: {
    position: 'absolute',
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
    backgroundColor: colors.textHigh,
  },
  liveRow: {flexDirection: 'row'},
  liveBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(229,57,53,0.9)',
  },
  liveText: {color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 1},
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 28,
  },
  spacer: {flex: 1},
  ctrl: {
    minWidth: 72,
    height: 72,
    borderRadius: 36,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(242,242,240,0.12)',
  },
  ctrlWide: {paddingHorizontal: 28},
  ctrlFocused: {backgroundColor: colors.textHigh, transform: [{scale: 1.08}]},
  ctrlText: {color: colors.textHigh, fontSize: 22, fontWeight: '600'},
  ctrlTextFocused: {color: colors.bg},
  previewChip: {
    position: 'absolute',
    bottom: 64,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  previewText: {color: colors.textHigh, fontSize: 28, fontWeight: '700'},
  promptRow: {
    position: 'absolute',
    right: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  prompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 48,
    paddingVertical: 28,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.54)',
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  promptPrimary: {
    backgroundColor: colors.textHigh,
    borderColor: 'transparent',
    paddingVertical: 20,
    paddingHorizontal: 40,
  },
  promptClose: {
    padding: 20,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  promptFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
    transform: [{scale: 1.05}],
  },
  promptText: {color: colors.textHigh, fontSize: 34, fontWeight: '600'},
  promptTextPrimary: {fontSize: 28, fontWeight: '700'},
  promptTextDark: {color: colors.bg},
  banner: {
    position: 'absolute',
    right: 48,
    maxWidth: 760,
    paddingLeft: 40,
    paddingRight: 32,
    paddingVertical: 32,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  bannerLabel: {
    color: 'rgba(255,255,255,0.54)',
    fontSize: 26,
    letterSpacing: 0.6,
  },
  bannerTitle: {
    color: colors.textHigh,
    fontSize: 32,
    fontWeight: '600',
    marginTop: 8,
  },
  bannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginTop: 28,
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 520,
    paddingTop: 48,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(20,20,40,0.96)',
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  panelTitle: {
    color: colors.textHigh,
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 16,
    marginLeft: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 6,
  },
  rowFocused: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(124,106,247,0.16)',
  },
  rowText: {flex: 1, color: colors.textMid, fontSize: 24},
  rowValue: {
    color: colors.textLow,
    fontSize: 20,
    maxWidth: 220,
    marginRight: 4,
  },
  panelHeading: {
    color: colors.textLow,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 14,
    marginBottom: 6,
    marginLeft: 16,
  },
  surface: {position: 'absolute'},
  rowTextOn: {color: colors.textHigh},
  check: {color: colors.primary, fontSize: 26, fontWeight: '800'},
  dialogScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialog: {
    width: 900,
    padding: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dialogTitle: {color: colors.textHigh, fontSize: 32, fontWeight: '700'},
  dialogText: {
    color: colors.textMid,
    fontSize: 24,
    marginTop: 14,
    lineHeight: 34,
  },
  dialogActions: {flexDirection: 'row', gap: 24, marginTop: 32},
  dialogHint: {color: colors.textLow, fontSize: 20, marginTop: 20},
});
