// The downloads page's unit (pileus-player download_groups.dart): a movie, or
// a series with its downloaded episodes in season/episode order — ten
// episodes of one show are one row that opens on them, not ten loose rows.

import type {DownloadInfo} from '../gen/media';

export interface DownloadGroup {
  key: string;
  isSeries: boolean;
  pluginId: string;
  parentId: string;
  title: string;
  poster: string;
  items: DownloadInfo[];
}

const IN_PROGRESS = new Set(['queued', 'scheduled', 'running', 'paused']);

export const groupTotalBytes = (g: DownloadGroup) =>
  g.items.reduce((n, i) => n + Number(i.fileBytes > 0 ? i.fileBytes : i.estimatedBytes), 0);

export const groupInProgress = (g: DownloadGroup) => g.items.some(i => IN_PROGRESS.has(i.status));

export function downloadGroupKey(d: DownloadInfo): string {
  return d.parentId
    ? `s\u0000${d.pluginId}\u0000${d.parentId}`
    : `m\u0000${d.pluginId}\u0000${d.mediaId || d.downloadId}`;
}

/** Groups keeping the first-seen order (the server lists newest first). */
export function groupDownloads(downloads: DownloadInfo[]): DownloadGroup[] {
  const byKey = new Map<string, DownloadInfo[]>();
  for (const d of downloads) {
    const k = downloadGroupKey(d);
    byKey.set(k, [...(byKey.get(k) ?? []), d]);
  }
  return [...byKey].map(([key, list]) => {
    const items = [...list].sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
    const first = items[0];
    const isSeries = !!first.parentId;
    return {
      key,
      isSeries,
      pluginId: first.pluginId,
      parentId: first.parentId,
      title: isSeries && first.seriesTitle ? first.seriesTitle : first.title,
      poster: first.poster,
      items,
    };
  });
}

/** "S1 · E3 — Titolo" for an episode row inside its series. */
export function episodeRowLabel(d: DownloadInfo): string {
  const num =
    d.episodeNumber > 0
      ? d.seasonNumber > 0
        ? `S${d.seasonNumber} · E${d.episodeNumber}`
        : `E${d.episodeNumber}`
      : '';
  if (!num) {
    return d.title;
  }
  return d.title ? `${num} — ${d.title}` : num;
}
