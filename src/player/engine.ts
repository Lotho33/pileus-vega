// One playback engine over Vega's W3C media stack, the counterpart of
// pileus-player's PlayerEngine facade:
//  - HLS (mycelium's /proxy/playlist.m3u8, live included) → MSE + Amazon's
//    patched Shaka (URL mode is not supported for adaptive streams on Vega);
//  - anything else (progressive files via /proxy/segment.ts, direct MP4) →
//    URL mode, `src` straight on the VideoPlayer.
// The video is drawn by a KeplerVideoSurfaceView whose handle the screen
// hands over with setSurface().

import {VideoPlayer} from '@amazon-devices/react-native-w3cmedia';
import {loadDevicePrefs} from '../core/devicePrefs';
import {capRestrictions, qualityTier, rememberBandwidth, startBandwidth, tierLabel} from './quality';
import {loadShaka} from './shakaSetup';
import {CueStore} from './subtitles';

export interface Track {
  id: string;
  label: string;
  language: string;
  active: boolean;
}

export type EngineEvent =
  | 'timeupdate'
  | 'playing'
  | 'pause'
  | 'waiting'
  | 'ended'
  | 'error'
  | 'loadedmetadata'
  | 'resize'
  | 'tracks';

/**
 * Shaka's error as text: BAD_HTTP_STATUS (1001) carries the status and the
 * URL in data[1] / data[0], which tell a missing segment (404) from the
 * proxy's "playing on another device" (409) or an expired link (403).
 */
export function shakaErrorText(detail: any): string {
  if (!detail) {
    return 'Shaka';
  }
  const code = detail.code ?? '';
  if (code === 1001 && Array.isArray(detail.data)) {
    const [uri, status] = detail.data;
    let path = '';
    try {
      path = String(uri ?? '')
        .split('?')[0]
        .split('/')
        .slice(-2)
        .join('/');
    } catch {
      path = '';
    }
    return `Shaka 1001: HTTP ${status ?? '?'}${path ? ` su ${path}` : ''}`;
  }
  return detail.message || `Shaka ${code}`.trim();
}

export function isHlsUrl(url: string): boolean {
  const path = url.split('?')[0].toLowerCase();
  return path.endsWith('.m3u8') || path.includes('/playlist/');
}

const MEDIA_EVENTS: EngineEvent[] = [
  'timeupdate',
  'playing',
  'pause',
  'waiting',
  'ended',
  'error',
  'loadedmetadata',
  'resize',
];

export class PlayerEngine {
  private video: VideoPlayer | null = null;
  private shaka: any = null;
  private listeners = new Map<EngineEvent, Set<(arg?: unknown) => void>>();
  private surface: string | null = null;
  private wantPlay = false;
  lastError = '';
  /** HLS subtitles, drawn by the screen with the profile's style. */
  readonly cues = new CueStore();

  async init(): Promise<void> {
    const v = new VideoPlayer();
    // Amazon's DocumentPolyfill hands this element to Shaka.
    (globalThis as any).gmedia = v;
    await v.initialize();
    v.autoplay = false;
    for (const type of MEDIA_EVENTS) {
      v.addEventListener(type, () => {
        if (type === 'error') {
          const err = (v as any).error;
          this.lastError = err?.message || (err?.code ? `codice ${err.code}` : 'errore di riproduzione');
        }
        this.emit(type);
      });
    }
    this.video = v;
  }

  on(type: EngineEvent, cb: (arg?: unknown) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(cb);
    return () => set?.delete(cb);
  }

  private emit(type: EngineEvent, arg?: unknown) {
    this.listeners.get(type)?.forEach(cb => cb(arg));
  }

  /** Opens `url` paused at `startAt` seconds; play() once the surface is set. */
  async open(
    url: string,
    opts: {startAt?: number; headers?: Record<string, string>; isLive?: boolean} = {},
  ): Promise<void> {
    const v = this.video;
    if (!v) {
      throw new Error('player non inizializzato');
    }
    this.lastError = '';
    if (isHlsUrl(url)) {
      const shaka = loadShaka();
      if (!this.shaka) {
        this.shaka = new shaka.Player(v);
        // Our displayer instead of the native captions view, which can't
        // be styled.
        this.shaka.configure({textDisplayFactory: () => this.cues});
        this.shaka.addEventListener('error', (e: any) => {
          this.lastError = shakaErrorText(e?.detail);
          console.warn(`[player] shaka error ${this.lastError}`, JSON.stringify(e?.detail?.data ?? []).slice(0, 800));
          this.emit('error');
        });
        this.shaka.addEventListener('trackschanged', () => this.emit('tracks'));
        this.shaka.addEventListener('variantchanged', () => this.emit('tracks'));
        this.shaka.addEventListener('adaptation', () => this.emit('tracks'));
        this.shaka.addEventListener('textchanged', () => this.emit('tracks'));
      }
      const net = this.shaka.getNetworkingEngine();
      net.clearAllRequestFilters();
      const headers = opts.headers ?? {};
      if (Object.keys(headers).length) {
        net.registerRequestFilter((_type: number, req: any) => {
          Object.assign(req.headers, headers);
        });
      }
      // Preferenze: "Qualità video massima" and "Riserva di riproduzione".
      const prefs = await loadDevicePrefs();
      const startBps = await startBandwidth();
      const reserve = opts.isLive ? prefs.liveBufferSec : prefs.vodBufferSec;
      this.shaka.configure({
        streaming: {
          bufferingGoal: reserve,
          rebufferingGoal: 2,
          bufferBehind: 30,
          retryParameters: {maxAttempts: 4, baseDelay: 1000, timeout: 30000},
          infiniteLiveStreamDuration: true,
        },
        manifest: {
          hls: {useSafariBehaviorForLive: false, disableClosedCaptionsDetection: true},
          retryParameters: {maxAttempts: 4, baseDelay: 1000, timeout: 30000},
        },
        abr: {
          enabled: true,
          restrictions: capRestrictions(prefs.maxVideoHeight),
          // Start from what the last playback measured, not Shaka's 1 Mbps
          // (or the system's estimate): see quality.ts.
          defaultBandwidthEstimate: startBps,
          useNetworkInformation: false,
        },
      });
      await this.shaka.load(url, opts.startAt && opts.startAt > 0 ? opts.startAt : null);
      this.emit('tracks');
    } else {
      v.src = url;
      if (opts.startAt && opts.startAt > 0) {
        const at = opts.startAt;
        const seekOnce = () => {
          v.removeEventListener('loadedmetadata', seekOnce);
          v.currentTime = at;
        };
        v.addEventListener('loadedmetadata', seekOnce);
      }
    }
    if (this.wantPlay || this.surface) {
      this.play();
    }
  }

  setSurface(handle: string) {
    this.surface = handle;
    this.video?.setSurfaceHandle(handle);
    if (this.wantPlay) {
      this.video?.play();
    }
  }

  clearSurface(handle: string) {
    this.video?.clearSurfaceHandle(handle);
    if (this.surface === handle) {
      this.surface = null;
    }
  }

  setCaptions(handle: string) {
    this.video?.setCaptionViewHandle(handle);
  }

  play() {
    this.wantPlay = true;
    if (this.surface) {
      this.video?.play();
    }
  }

  pause() {
    this.wantPlay = false;
    this.video?.pause();
  }

  get paused(): boolean {
    return this.video?.paused ?? true;
  }

  get position(): number {
    return this.video?.currentTime ?? 0;
  }

  get duration(): number {
    const d = this.video?.duration ?? 0;
    return Number.isFinite(d) ? d : 0;
  }

  /** Live edge reached by seeking, in seconds; 0 outside live/HLS. */
  get liveEdge(): number {
    const r = this.shaka?.seekRange?.();
    return r ? r.end : 0;
  }

  seek(t: number) {
    const v = this.video;
    if (!v) {
      return;
    }
    const d = this.duration;
    v.currentTime = Math.max(0, d > 0 ? Math.min(t, d - 1) : t);
  }

  audioTracks(): Track[] {
    if (this.shaka) {
      const tracks: any[] = this.shaka.getAudioTracks?.() ?? [];
      return tracks.map((t, i) => ({
        id: `a${i}`,
        label: t.label || t.language || `Traccia ${i + 1}`,
        language: t.language ?? '',
        active: !!t.active,
      }));
    }
    const list: any = (this.video as any)?.audioTracks;
    const out: Track[] = [];
    for (let i = 0; list && i < list.length; i++) {
      const t = list[i];
      out.push({
        id: `a${i}`,
        label: t.label || t.language || `Traccia ${i + 1}`,
        language: t.language ?? '',
        active: !!t.enabled,
      });
    }
    return out;
  }

  selectAudio(id: string) {
    const i = Number(id.slice(1));
    if (this.shaka) {
      const t = (this.shaka.getAudioTracks?.() ?? [])[i];
      if (t) {
        this.shaka.selectAudioTrack(t);
      }
    } else {
      const list: any = (this.video as any)?.audioTracks;
      for (let k = 0; list && k < list.length; k++) {
        list[k].enabled = k === i;
      }
    }
    this.emit('tracks');
  }

  /** 'auto' (ABR) first, then one entry per quality tier, best first. */
  videoTracks(): Track[] {
    if (!this.shaka) {
      return [];
    }
    const variants: any[] = (this.shaka.getVariantTracks?.() ?? []).filter((t: any) => t.height > 0);
    const tierOf = (t: any) => qualityTier(t.width ?? 0, t.height);
    const byTier = new Map<number, any>();
    for (const t of variants) {
      const cur = byTier.get(tierOf(t));
      if (!cur || (t.active && !cur.active) || (!cur.active && t.bandwidth > cur.bandwidth)) {
        byTier.set(tierOf(t), t);
      }
    }
    const tiers = [...byTier.keys()].sort((a, b) => b - a);
    if (tiers.length < 2) {
      return [];
    }
    const abr = this.shaka.getConfiguration?.().abr?.enabled !== false;
    const active = variants.find((t: any) => t.active);
    return [
      {
        id: 'auto',
        label: active && abr ? `Automatica (${tierLabel(tierOf(active))})` : 'Automatica',
        language: '',
        active: abr,
      },
      ...tiers.map(h => {
        const t = byTier.get(h);
        const parts = [tierLabel(h)];
        if (t.frameRate > 0) {
          parts.push(`${Math.round(t.frameRate)} fps`);
        }
        if (t.bandwidth > 0) {
          parts.push(`${(t.bandwidth / 1e6).toFixed(1)} Mbps`);
        }
        return {id: `v${h}`, label: parts.join(' · '), language: '', active: !abr && !!active && tierOf(active) === h};
      }),
    ];
  }

  selectVideo(id: string) {
    if (!this.shaka) {
      return;
    }
    if (id === 'auto') {
      this.shaka.configure({abr: {enabled: true}});
    } else {
      const h = Number(id.slice(1));
      const active = (this.shaka.getVariantTracks?.() ?? []).find((t: any) => t.active);
      const candidates = (this.shaka.getVariantTracks?.() ?? []).filter(
        (t: any) => t.height > 0 && qualityTier(t.width ?? 0, t.height) === h,
      );
      // Same audio as now, highest bitrate in that tier.
      const pick =
        candidates
          .filter((t: any) => !active || t.language === active.language)
          .sort((a: any, b: any) => b.bandwidth - a.bandwidth)[0] ?? candidates[0];
      if (pick) {
        this.shaka.configure({abr: {enabled: false}});
        this.shaka.selectVariantTrack(pick, true);
      }
    }
    this.emit('tracks');
  }

  /** Decoded picture size, 0×0 until known. */
  get videoSize(): {w: number; h: number} {
    const v: any = this.video;
    return {w: v?.videoWidth ?? 0, h: v?.videoHeight ?? 0};
  }

  textTracks(): Track[] {
    if (this.shaka) {
      const visible = this.shaka.isTextTrackVisible?.() ?? false;
      return (this.shaka.getTextTracks?.() ?? []).map((t: any) => ({
        id: `t${t.id}`,
        label: t.label || t.language || 'Sottotitoli',
        language: t.language ?? '',
        active: visible && !!t.active,
      }));
    }
    const list: any = (this.video as any)?.textTracks;
    const out: Track[] = [];
    for (let i = 0; list && i < list.length; i++) {
      const t = list[i];
      if (t.kind === 'metadata') {
        continue;
      }
      out.push({
        id: `t${i}`,
        label: t.label || t.language || `Sottotitoli ${i + 1}`,
        language: t.language ?? '',
        active: t.mode === 'showing',
      });
    }
    return out;
  }

  /** null turns subtitles off. */
  selectText(id: string | null) {
    if (this.shaka) {
      if (id === null) {
        this.shaka.setTextTrackVisibility(false);
      } else {
        const t = (this.shaka.getTextTracks?.() ?? []).find((x: any) => `t${x.id}` === id);
        if (t) {
          this.shaka.selectTextTrack(t);
          this.shaka.setTextTrackVisibility(true);
        }
      }
    } else {
      const list: any = (this.video as any)?.textTracks;
      for (let k = 0; list && k < list.length; k++) {
        if (list[k].kind !== 'metadata') {
          list[k].mode = `t${k}` === id ? 'showing' : 'hidden';
        }
      }
    }
    this.emit('tracks');
  }

  async destroy(): Promise<void> {
    this.listeners.clear();
    // The next video starts from this throughput (quality.ts).
    try {
      rememberBandwidth(this.shaka?.getStats?.().estimatedBandwidth ?? 0);
    } catch {
      // No stats: keep the previous estimate.
    }
    const v = this.video;
    this.video = null;
    try {
      v?.pause();
    } catch {
      // Tearing down: nothing left to report to.
    }
    try {
      await this.shaka?.destroy();
    } catch {
      // Tearing down: nothing left to report to.
    }
    this.shaka = null;
    try {
      await v?.deinitialize();
    } catch {
      // Tearing down: nothing left to report to.
    }
    if ((globalThis as any).gmedia === v) {
      (globalThis as any).gmedia = null;
    }
  }
}
