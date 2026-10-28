// Labels for server-side downloads, ported from pileus-player's
// features/downloads/download_format.dart.

import type {DownloadInfo, DownloadTrack, DownloadVariant, PluginInfo} from '../gen/media';

export function pluginSupportsDownload(p: PluginInfo | undefined): boolean {
  return !!p?.capabilities?.includes('download');
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  const decimals = u === 0 ? 0 : v < 10 ? 1 : 0;
  return `${v.toFixed(decimals)} ${units[u]}`;
}

export function totalEstimatedBytes(variant: DownloadVariant | undefined, audio: DownloadTrack[]): number {
  return (variant?.estimatedBytes ?? 0) + audio.reduce((n, a) => n + (a.estimatedBytes ?? 0), 0);
}

export function formatVariantSize(v: DownloadVariant): string {
  const size = formatBytes(v.estimatedBytes);
  return v.bandwidthIsPeak ? `fino a ~${size}` : size;
}

export function formatEta(totalBytes: number, bytesPerSec: number): string {
  if (bytesPerSec <= 0 || totalBytes <= 0) {
    return '';
  }
  const secs = totalBytes / bytesPerSec;
  if (secs < 60) {
    return `~${Math.ceil(secs)} s`;
  }
  const mins = Math.ceil(secs / 60);
  if (mins < 60) {
    return `~${mins} min`;
  }
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `~${h} h` : `~${h} h ${m}min`;
}

export function retentionLabel(days: number): string {
  return days <= 0
    ? 'Il file resta sul server finché non lo elimini'
    : `Il file resta sul server per ${days} giorn${days === 1 ? 'o' : 'i'}`;
}

export function qualityBelowUsualWarning(below: boolean, usualMaxHeight: number, bestHeightNow: number): string {
  if (!below || usualMaxHeight <= 0) {
    return '';
  }
  const now = bestHeightNow > 0 ? `${bestHeightNow}p` : 'una qualità ridotta';
  return `Ora il massimo è ${now}, di solito ${usualMaxHeight}p: conviene scaricare più tardi`;
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function downloadStatusLabel(info: DownloadInfo): string {
  switch (info.status) {
    case 'queued':
      return 'In coda';
    case 'scheduled':
      return info.scheduledFor > 0 ? `Programmato alle ${hhmm(new Date(info.scheduledFor * 1000))}` : 'Programmato';
    case 'running':
      return `Preparazione ${Math.round(Math.min(1, Math.max(0, info.progress)) * 100)}%`;
    case 'paused':
      return 'In pausa — riprende quando nessuno guarda';
    case 'completed':
      return 'Pronto';
    case 'failed':
      return info.error || 'Errore';
    case 'canceled':
      return 'Annullato';
    default:
      return info.status;
  }
}

export function isCancellable(info: DownloadInfo): boolean {
  return ['queued', 'scheduled', 'running', 'paused'].includes(info.status);
}

export function downloadSubtitle(info: DownloadInfo): string {
  const size = info.fileBytes > 0 ? info.fileBytes : info.estimatedBytes;
  return [
    downloadStatusLabel(info),
    size > 0 ? formatBytes(size) : '',
    info.qualityLabel,
    info.shared ? 'Condiviso con un altro profilo' : '',
    info.upgradePending ? 'Cerco una qualità migliore' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
