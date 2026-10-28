// One home row. Like pileus-player's fixed carousel, the focused card stays
// pinned in the first slot and the row slides under it, until the last
// card reaches the right margin: from there focus moves across the last
// visible slots (scrollIdx clamp in fixed_carousel.dart). Sizes are whole
// pixels: with fractional ones the native layout rounds each cell while the
// scroll offset doesn't, and the cards crept off their slots step by step.

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {ActivityIndicator, FlatList, Pressable, Text, View} from 'react-native';
import {Icon} from '../components/Icon';
import {focusSoon} from '../core/focus';
import {shouldLoadMore} from '../core/paging';
import {LandscapeCard, PosterCard} from './Cards';
import type {HomeLayout} from './layout';
import type {CardModel, CardVariant} from './model';
import {colors, px, scaledStyles} from '../theme';

/** Ask the row to focus card `index`; a new `token` repeats the request. */
export interface FocusRequest {
  index: number;
  token: number;
}

interface Props {
  cards: CardModel[];
  variant: CardVariant;
  L: HomeLayout;
  /**
   * True while a panel (nav, search, settings) owns the remote. Focus that
   * strays onto a card meanwhile (the native engine reassigning it) is
   * ignored instead of sliding the row and swapping the hero. A function so
   * it can answer synchronously, before the panel's state has rendered.
   */
  isInactive: () => boolean;
  /** Grab focus on mount (the row just became the active one). */
  takeFocus: boolean;
  focusRequest: FocusRequest | null;
  /** Show the first card as focused while focus is elsewhere (side nav). */
  highlightFirst?: boolean;
  /** Titles under the posters at this font size (details footer). */
  captionFs?: number;
  onFocusCard: (index: number) => void;
  onBlurCard?: () => void;
  onPressCard: (index: number) => void;
  /** Select held on a card (context menu). */
  onLongPressCard?: (index: number) => void;
  /**
   * Paging (CarouselLoadMore): `onLoad` is called as soon as focus gets within
   * LOAD_AHEAD_ITEMS cards of the end, so the next page is usually in before
   * the user reaches it. Until then the row ends in a placeholder card; focus
   * parked on it moves onto the first new card when they land. After a
   * failure (`failed`) nothing loads by itself and that card reads "Riprova".
   */
  loadMore?: {loading: boolean; failed: boolean; onLoad: () => void};
}

// _LoadMoreCardView: a poster-sized placeholder with a spinner, or "Riprova".
const LoadMoreCard = forwardRef<
  View,
  {
    width: number;
    height: number;
    failed: boolean;
    onFocus: () => void;
    onPress: () => void;
  }
>(function LoadMoreCard({width, height, failed, onFocus, onPress}, ref) {
  const [focused, setFocused] = useState(false);
  const glyph = width * 0.32;
  const tint = focused ? '#fff' : 'rgba(255,255,255,0.6)';
  return (
    <Pressable
      ref={ref}
      accessibilityLabel={failed ? 'Riprova' : 'Caricamento'}
      onFocus={() => {
        setFocused(true);
        onFocus();
      }}
      onBlur={() => setFocused(false)}
      onPress={() => failed && onPress()}
      style={[
        styles.more,
        {width, height},
        !failed && styles.morePending,
        focused && styles.moreFocused,
      ]}>
      {failed ? (
        <>
          <Icon name="refresh" size={glyph} color={tint} />
          <Text
            style={[
              styles.moreText,
              {
                fontSize: Math.min(px(40), Math.max(px(22), width * 0.11)),
                marginTop: width * 0.08,
                color: tint,
              },
            ]}>
            Riprova
          </Text>
        </>
      ) : (
        <ActivityIndicator color="rgba(255,255,255,0.4)" />
      )}
    </Pressable>
  );
});

export function CarouselRow(p: Props) {
  const list = useRef<FlatList<CardModel>>(null);
  const refs = useRef(new Map<number, View>());
  const w = Math.round(
    p.variant === 'landscape' ? p.L.landscapeW : p.L.posterW,
  );
  const h = Math.round(p.L.posterH);
  const stride = w + Math.round(p.L.gap);
  // Slots: the cards plus the load-more card; whole cards that fit.
  const slots = p.cards.length + (p.loadMore ? 1 : 0);
  const fit = Math.max(
    1,
    Math.floor((p.L.W - p.L.hPad * 2 + p.L.gap) / stride),
  );
  // No state here: a re-render of every cell on each step made the first
  // card's hasTVPreferredFocus pull focus back to it.
  const slideTo = (i: number, animated: boolean) => {
    const f = Math.max(0, Math.min(i, slots - fit));
    list.current?.scrollToOffset({offset: stride * f, animated});
  };

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: stride,
      offset: stride * index,
      index,
    }),
    [stride],
  );

  const takeFocus = useRef(p.takeFocus).current;
  // Preferred focus only until a card of the row has had focus once.
  const settled = useRef(false);
  useEffect(
    () => (takeFocus ? focusSoon(() => refs.current.get(0)) : undefined),
    [takeFocus],
  );

  const req = p.focusRequest;
  useEffect(() => {
    if (!req) {
      return;
    }
    const index = Math.max(0, Math.min(req.index, p.cards.length - 1));
    // Scroll first so the card's cell is mounted before focus lands on it.
    slideTo(index, false);
    return focusSoon(() => refs.current.get(index) ?? refs.current.get(0));
    // Only a new request moves focus, not a reflow of the cards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req?.token]);

  // Focus on the load-more card when the cards grow: go to the first new one.
  const onTrailing = useRef(false);
  const prevLen = useRef(p.cards.length);
  const moreRef = useRef<View>(null);
  useEffect(() => {
    const old = prevLen.current;
    prevLen.current = p.cards.length;
    if (p.cards.length > old && onTrailing.current) {
      onTrailing.current = false;
      slideTo(old, false);
      return focusSoon(() => refs.current.get(old));
    }
    // Only a growing list moves anything here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.cards.length]);

  const Card = p.variant === 'landscape' ? LandscapeCard : PosterCard;
  const {onFocusCard, onPressCard} = p;
  // Focus near the end (or on the placeholder): ask for the next page.
  const maybeLoadMore = (index: number) => {
    const m = p.loadMore;
    if (
      m &&
      shouldLoadMore(
        {
          count: p.cards.length,
          hasMore: true,
          loading: m.loading,
          failed: m.failed,
        },
        index,
      )
    ) {
      m.onLoad();
    }
  };

  return (
    <View
      style={[
        styles.wrap,
        {height: h * 1.2 + (p.captionFs ? captionBlock(p.captionFs) : 0)},
      ]}>
      <FlatList
        ref={list}
        horizontal
        data={p.cards}
        keyExtractor={(c) => c.key}
        getItemLayout={getItemLayout}
        extraData={p.highlightFirst}
        renderItem={({item, index}) => (
          <View style={[styles.cell, {width: stride}]}>
            <Card
              ref={(v: View | null) => {
                if (v) {
                  refs.current.set(index, v);
                } else {
                  refs.current.delete(index);
                }
              }}
              card={item}
              width={w}
              height={h}
              preferred={takeFocus && index === 0 && !settled.current}
              highlight={!!p.highlightFirst && index === 0}
              captionFs={p.captionFs}
              onFocus={() => {
                if (p.isInactive()) {
                  return;
                }
                settled.current = true;
                onTrailing.current = false;
                slideTo(index, true);
                onFocusCard(index);
                maybeLoadMore(index);
              }}
              onBlur={p.onBlurCard}
              onPress={() => onPressCard(index)}
              onLongPress={
                p.onLongPressCard ? () => p.onLongPressCard?.(index) : undefined
              }
            />
          </View>
        )}
        ListFooterComponent={
          p.loadMore ? (
            <View style={[styles.cell, {width: stride}]}>
              <LoadMoreCard
                ref={moreRef}
                width={w}
                height={h}
                failed={p.loadMore.failed}
                onFocus={() => {
                  if (p.isInactive()) {
                    return;
                  }
                  onTrailing.current = true;
                  slideTo(p.cards.length, true);
                  maybeLoadMore(p.cards.length);
                }}
                onPress={p.loadMore.onLoad}
              />
            </View>
          ) : null
        }
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        contentContainerStyle={{paddingHorizontal: Math.round(p.L.hPad)}}
        initialNumToRender={VISIBLE + 2}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={50}
        windowSize={3}
      />
    </View>
  );
}

const VISIBLE = 7;

/** Room the two caption lines take under a poster. */
export function captionBlock(fs: number): number {
  return fs * 1.3 * 2 + px(8);
}

const styles = scaledStyles({
  wrap: {justifyContent: 'center'},
  cell: {justifyContent: 'center'},
  more: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: colors.surface2,
  },
  morePending: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'transparent',
  },
  moreFocused: {borderColor: colors.primary, transform: [{scale: 1.07}]},
  moreText: {fontWeight: '600', textAlign: 'center'},
});
