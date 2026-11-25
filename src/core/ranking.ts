// Top 10 rows and card badges (pileus-player's features/media/catalog_ranking.dart
// and shared/widgets/card_badge.dart) — mycelium core 2.0.1 contract:
//  - a catalog with styleHint "ranked" is a chart: at most RANKED_MAX_ITEMS
//    cards, no further pages, each drawn beside its number;
//  - `rank` on an item (> 0) is the number to show, else its position —
//    plugins drop titles already shown higher up, so positions can slip;
//  - `badge` on an item: "new" / "new_episode"; any other value shows nothing.

import type {CatalogDef, CatalogItem} from '../gen/media';

export const RANKED_MAX_ITEMS = 10;

/** How wide the number beside a card is (× card width); the card covers RANK_OVERLAP of it. */
export const RANK_NUMBER_WIDTH = 0.92;
export const RANK_OVERLAP = 0.22;

export const isRankedCatalog = (def: CatalogDef | undefined) => def?.styleHint === 'ranked';

export const catalogItemRank = (i: CatalogItem) => i.rank ?? 0;

export const catalogItemBadge = (i: CatalogItem) => i.badge ?? '';

/** The number for the item at `index` (0-based) of a ranked row. */
export const rankFor = (rank: number, index: number) => (rank > 0 ? rank : index + 1);

export const rankedSlotWidth = (cardW: number) => Math.round(cardW * (1 + RANK_NUMBER_WIDTH - RANK_OVERLAP));

/** A card's badge as its label; '' for anything unknown. */
export function cardBadgeLabel(badge: string | undefined): string {
  switch ((badge ?? '').trim()) {
    case 'new':
      return 'Novità';
    case 'new_episode':
      return 'Nuovo episodio';
    default:
      return '';
  }
}
