// Poster grid (pileus-player _PosterGridView / MediaCatalogCard): fixed
// columns, the title on two lines under each poster. The cell height
// includes those lines (MediaCatalogCard.cellHeight), not a bare 2:3, so
// rows never overlap the titles. The focused row stays about a third of the
// way down; the list scrolls by whole rows.

import React, {useEffect, useRef} from 'react';
import {FlatList, View} from 'react-native';
import {focusSoon} from '../core/focus';
import {scaledStyles} from '../theme';
import {PosterCard} from './Cards';
import {captionBlock} from './CarouselRow';
import {captionFont} from './layout';
import type {CardModel} from './model';

const CARD_W = 200 / 1920;
const CARD_GAP = 20 / 1920;

export interface GridGeometry {
  cols: number;
  cardW: number;
  cardH: number;
  gap: number;
  captionFs: number;
  rowH: number;
}

/** Whole pixels: the list scrolls by multiples of these. */
export function gridGeometry(W: number, H: number, hPad: number): GridGeometry {
  const avail = W - hPad * 2;
  const gap = Math.round(W * CARD_GAP);
  const cols = Math.max(2, Math.min(10, Math.floor(avail / (W * CARD_W + gap))));
  const cardW = Math.floor((avail - gap * (cols - 1)) / cols);
  const cardH = Math.round(cardW * 1.5);
  const captionFs = captionFont(H);
  const rowH = Math.round(cardH + captionBlock(captionFs) + gap);
  return {cols, cardW, cardH, gap, captionFs, rowH};
}

export function PosterGrid({
  cards,
  W,
  H,
  hPad,
  listH,
  startAt = 0,
  focus,
  onFocusItem,
  onPressItem,
  onLongPressItem,
}: {
  cards: CardModel[];
  W: number;
  H: number;
  hPad: number;
  /** Height of the list's viewport (where "a third of the way" falls). */
  listH: number;
  /** The item focused first (and scrolled to before it is). */
  startAt?: number;
  /** A new token focuses `index` (e.g. back from a page on top). */
  focus: {index: number; token: number} | null;
  onFocusItem?: (index: number) => void;
  onPressItem: (index: number) => void;
  onLongPressItem?: (index: number) => void;
}) {
  const g = gridGeometry(W, H, hPad);
  const list = useRef<FlatList<CardModel[]>>(null);
  const refs = useRef(new Map<number, View>());
  const rows: CardModel[][] = [];
  for (let i = 0; i < cards.length; i += g.cols) {
    rows.push(cards.slice(i, i + g.cols));
  }
  const scrollTo = (line: number, animated: boolean) =>
    list.current?.scrollToOffset({offset: Math.max(0, line * g.rowH - listH * 0.3), animated});

  const initialLine = Math.floor(startAt / g.cols);
  useEffect(() => {
    if (initialLine > 0) {
      scrollTo(initialLine, false);
    }
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!focus) {
      return;
    }
    scrollTo(Math.floor(focus.index / g.cols), false);
    return focusSoon(() => refs.current.get(focus.index) ?? refs.current.get(0));
    // Only a new request moves focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.token]);

  return (
    <FlatList
      ref={list}
      data={rows}
      keyExtractor={r => r[0].key}
      getItemLayout={(_, index) => ({length: g.rowH, offset: g.rowH * index, index})}
      scrollEnabled={false}
      initialNumToRender={Math.max(4, initialLine + 3)}
      contentContainerStyle={[styles.content, {paddingHorizontal: hPad, paddingTop: g.cardH * 0.08}]}
      maxToRenderPerBatch={3}
      updateCellsBatchingPeriod={50}
      windowSize={5}
      renderItem={({item: row, index: r}) => (
        <View style={[styles.row, {height: g.rowH, gap: g.gap}]}>
          {row.map((card, c) => {
            const i = r * g.cols + c;
            return (
              <PosterCard
                key={card.key}
                ref={(v: View | null) => {
                  if (v) {
                    refs.current.set(i, v);
                  } else {
                    refs.current.delete(i);
                  }
                }}
                card={card}
                width={g.cardW}
                height={g.cardH}
                captionFs={g.captionFs}
                preferred={i === startAt}
                onFocus={() => {
                  onFocusItem?.(i);
                  scrollTo(r, true);
                }}
                onPress={() => onPressItem(i)}
                onLongPress={onLongPressItem ? () => onLongPressItem(i) : undefined}
              />
            );
          })}
        </View>
      )}
    />
  );
}

const styles = scaledStyles({
  content: {paddingBottom: 24},
  row: {flexDirection: 'row', alignItems: 'flex-start'},
});
