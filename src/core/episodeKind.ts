// Filler and recap episodes (pileus-player's features/media/episode_kind.dart),
// from the plugin's `extra.filler` on an episode: "filler" / "recap"; "" or
// absent when canon or not known — most plugins never say, and then nothing
// is shown. A word in the episode's meta line, in EPISODE_KIND_COLOR — not a
// badge, so it doesn't compete with the language ones.

export function episodeKindLabel(filler: string | undefined): string {
  switch ((filler ?? '').trim().toLowerCase()) {
    case 'filler':
      return 'Filler';
    case 'recap':
      return 'Riassunto';
    default:
      return '';
  }
}

export const EPISODE_KIND_COLOR = '#FBBF24';
