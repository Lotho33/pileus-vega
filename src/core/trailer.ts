// Trailers (pileus-player shared/utils/open_trailer.dart): YouTube videos,
// which our player can't play, so they open in the Fire TV YouTube app.
// No autoplay anywhere: only the details page's "Trailer" chip.

import {Linking} from 'react-native';

/**
 * The YouTube id of a trailer link — watch?v=, youtu.be/, /embed/, /shorts/,
 * /v/, or a bare 11-character id (TMDB's videos `key`). Null otherwise.
 */
export function youtubeIdOf(url: string): string | null {
  const s = url.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) {
    return s;
  }
  const m = /^(?:https?:)?\/\/([^/?#]+)([^?#]*)(\?[^#]*)?/i.exec(s);
  if (!m || !m[1].toLowerCase().includes('youtu')) {
    return null;
  }
  const host = m[1].toLowerCase();
  const query = m[3] ?? '';
  const v = /[?&]v=([^&]+)/.exec(query)?.[1];
  if (v) {
    return decodeURIComponent(v);
  }
  const seg = m[2].split('/').filter(Boolean);
  if (host.includes('youtu.be') && seg.length) {
    return seg[0];
  }
  for (const k of ['embed', 'shorts', 'v']) {
    const i = seg.indexOf(k);
    if (i >= 0 && i + 1 < seg.length) {
      return seg[i + 1];
    }
  }
  return null;
}

/**
 * What to hand the system, in order: the YouTube app's own link, then the
 * https one (YouTube registers for youtube.com links on Fire TV). A link
 * that isn't YouTube goes as it is.
 */
export function trailerUris(url: string): string[] {
  const id = youtubeIdOf(url);
  if (!id) {
    const s = url.trim();
    return /^https?:\/\//i.test(s) ? [s] : [];
  }
  return [`youtube://www.youtube.com/watch?v=${id}`, `https://www.youtube.com/watch?v=${id}`];
}

/** False when nothing on the device could open it. */
export async function openTrailer(url: string, linking: Pick<typeof Linking, 'openURL'> = Linking): Promise<boolean> {
  for (const uri of trailerUris(url)) {
    try {
      await linking.openURL(uri);
      return true;
    } catch {
      // Next one.
    }
  }
  return false;
}

export const TRAILER_UNAVAILABLE = "Per vedere il trailer serve l'app YouTube.";
