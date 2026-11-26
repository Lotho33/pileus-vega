import {cardBadgeLabel, catalogItemRank, isRankedCatalog, rankedSlotWidth, rankFor} from '../src/core/ranking';
import {catalogCard} from '../src/home/model';
import type {CatalogDef, CatalogItem} from '../src/gen/media';

describe('ranking', () => {
  it('ranked catalogs and their numbers', () => {
    expect(isRankedCatalog({styleHint: 'ranked'} as CatalogDef)).toBe(true);
    expect(isRankedCatalog({styleHint: 'featured'} as CatalogDef)).toBe(false);
    expect(isRankedCatalog(undefined)).toBe(false);
    expect(rankFor(0, 0)).toBe(1);
    expect(rankFor(0, 9)).toBe(10);
    expect(rankFor(7, 2)).toBe(7);
    expect(rankedSlotWidth(100)).toBe(180);
  });

  it('badge labels; unknown values show nothing', () => {
    expect(cardBadgeLabel('new')).toBe('Novità');
    expect(cardBadgeLabel('new_episode')).toBe('Nuovo episodio');
    expect(cardBadgeLabel('hot')).toBe('');
    expect(cardBadgeLabel(undefined)).toBe('');
  });

  it("cards show the plugin's badge", () => {
    const card = (badge: string) =>
      catalogCard('p', {id: 'a', title: 'A', extra: {}, badge, rank: 0} as unknown as CatalogItem, 'poster');
    expect(card('new').flag).toBe('Novità');
    expect(card('').flag).toBe('');
    expect(card('hot').flag).toBe('');
  });

  it("the plugin's rank wins over the position", () => {
    expect(catalogItemRank({rank: 4} as CatalogItem)).toBe(4);
    expect(rankFor(catalogItemRank({rank: 0} as CatalogItem), 2)).toBe(3);
  });
});
