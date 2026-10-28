// What a download is filed under, and the wider episode choices of the
// options dialog (_batchGroups in episode_detail_screen.dart).

export interface DownloadMeta {
  mediaId: string;
  parentId: string;
  title: string;
  seriesTitle: string;
  poster: string;
  seasonNumber: number;
  episodeNumber: number;
}

/** "Scarica la stagione" / "Scarica i prossimi N episodi". */
export interface BatchGroup {
  label: string;
  episodes: DownloadMeta[];
}

const NEXT_BATCH = 5;

/** The batch choices for episode `index` of `episodes` (_batchGroups in pileus-player). */
export function batchGroups(episodes: DownloadMeta[], index: number): BatchGroup[] {
  if (index < 0 || index >= episodes.length) {
    return [];
  }
  const out: BatchGroup[] = [];
  if (episodes.length > 1) {
    out.push({label: `Tutta la stagione (${episodes.length} episodi)`, episodes});
  }
  const remaining = episodes.length - index;
  if (remaining > 1) {
    const n = Math.min(remaining, NEXT_BATCH);
    out.push({label: `I prossimi ${n} episodi`, episodes: episodes.slice(index, index + n)});
  }
  return out;
}
