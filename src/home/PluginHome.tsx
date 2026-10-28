// One plugin's home: hero on top, a single row at the bottom swapped with
// ↑/↓ (Continue Watching first when it has items for this plugin), like
// _StandardHomeShell in pileus-player. A catalog row loads its next pages by
// itself as focus nears the end (core/paging.ts), up to HOME_ROW_MAX_ITEMS
// cards; live rows stay on their first page (refreshed every minute).

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, AppState, Image, StyleSheet, Text, View} from 'react-native';
import {useTVEventHandler} from '@amazon-devices/react-native-kepler';
import {mycelium} from '../core/api';
import {HOME_ROW_MAX_ITEMS, showsMoreSlot} from '../core/paging';
import * as perf from '../core/perf';
import {scheduleWarm} from '../core/warm';
import {useFocusGate} from '../core/focus';
import type {CatalogDef, ContinueWatchingItem, PluginInfo} from '../gen/media';
import {colors, scaledStyles} from '../theme';
import {CarouselRow, FocusRequest} from './CarouselRow';
import {cachedCwHero, fetchCwHero} from './cwHero';
import {createHeroStore, HeroFromStore, heroImageUrls} from './Hero';
import type {HomeLayout} from './layout';
import {CardModel, CardVariant, catalogCard, cwCard, variantFor} from './model';
import {SectionHeader} from './SectionHeader';

interface CatalogState {
  cards: CardModel[];
  loading: boolean;
  failed: boolean;
  /** Pages loaded so far, and whether the plugin has another. */
  page: number;
  hasMore: boolean;
  loadingMore: boolean;
  /** The last next-page request failed: the row ends in "Riprova". */
  moreFailed: boolean;
}

const firstPage = (cards: CardModel[], extra: Partial<CatalogState> = {}): CatalogState => ({
  cards,
  loading: false,
  failed: false,
  page: 1,
  hasMore: false,
  loadingMore: false,
  moreFailed: false,
  ...extra,
});

interface Row {
  id: string;
  title: string;
  variant: CardVariant;
  def?: CatalogDef;
}

const NO_CARDS: CardModel[] = [];
const LIVE_REFRESH_MS = 60_000;
// Just past the remote's key-repeat interval: a held →/← lands one hero at
// the end, a single press updates the text right away. The fanart and the
// logo fade in on their own once decoded (meta_zone.dart /
// HomeHeroBackground), so the text never waits for the images.
const HERO_DEBOUNCE_MS = 120;
// With ←/→ held the hero waits for the release; this long without a new card
// counts as released too.
const HOLD_SETTLE_FALLBACK_MS = 400;

export function PluginHome({
  plugin,
  catalogs,
  cw,
  L,
  navOpen,
  inactive,
  refocus,
  onOpenNav,
  onOpenSearch,
  onOpenItem,
  onCardMenu,
}: {
  plugin: PluginInfo;
  catalogs: CatalogDef[];
  cw: ContinueWatchingItem[];
  L: HomeLayout;
  /** The side nav is over this page: the first card keeps its focus look. */
  navOpen: boolean;
  /** Something else (nav, search, settings) owns focus and the remote. */
  inactive: boolean;
  /**
   * A new token puts focus back on the active row: its first card, or with
   * `restore` the card that had it (closing quick search).
   */
  refocus: {token: number; restore: boolean};
  onOpenNav: () => void;
  onOpenSearch: () => void;
  onOpenItem: (card: CardModel) => void;
  /** Select held on a card; `def` is the card's catalog (none for CW). */
  onCardMenu: (card: CardModel, def?: CatalogDef) => void;
}) {
  const [state, setState] = useState<Record<string, CatalogState>>({});
  const stateRef = useRef(state);
  stateRef.current = state;

  const cwCards = useMemo(() => cw.map(cwCard), [cw]);

  // Rows that are known to be empty drop out, so ↓ never lands on nothing.
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    if (cwCards.length) {
      out.push({id: 'cw', title: 'Continua a guardare', variant: 'landscape'});
    }
    for (const def of catalogs) {
      const s = state[def.id];
      if (s && !s.loading && !s.failed && s.cards.length === 0) {
        continue;
      }
      out.push({
        id: def.id,
        title: def.name || def.id,
        variant: variantFor(def),
        def,
      });
    }
    return out;
  }, [catalogs, cwCards.length, state]);

  const [rowId, setRowId] = useState<string>(() => (cwCards.length ? 'cw' : catalogs[0]?.id ?? ''));
  const rowIndex = Math.max(
    0,
    rows.findIndex(r => r.id === rowId),
  );
  const row = rows[rowIndex];

  const load = useCallback(
    async (def: CatalogDef) => {
      if (stateRef.current[def.id]?.loading) {
        return;
      }
      setState(s => ({...s, [def.id]: firstPage([], {loading: true})}));
      try {
        const r = await mycelium.getCatalog(plugin.pluginId, def.id, 1);
        const variant = variantFor(def);
        const seen = new Set<string>();
        const cards = r.items
          .map(i => catalogCard(plugin.pluginId, i, variant))
          .filter(c => !seen.has(c.key) && !!seen.add(c.key));
        setState(s => ({
          ...s,
          [def.id]: firstPage(cards, {hasMore: r.hasMore}),
        }));
      } catch {
        setState(s => ({...s, [def.id]: firstPage([], {failed: true})}));
      }
    },
    [plugin.pluginId],
  );

  // The next page of a row, appended without repeats. One at a time per row:
  // focus can step past several cards before "loading" reaches the row.
  const moreInFlight = useRef(new Set<string>());
  const loadMore = useCallback(
    async (def: CatalogDef) => {
      const cur = stateRef.current[def.id];
      if (!cur || cur.loading || !cur.hasMore || moreInFlight.current.has(def.id)) {
        return;
      }
      moreInFlight.current.add(def.id);
      const page = cur.page + 1;
      // Only onto the list this page follows (not one reloaded meanwhile).
      const update = (f: (c: CatalogState) => CatalogState) =>
        setState(s => {
          const c = s[def.id];
          return c && c.page === cur.page && !c.loading ? {...s, [def.id]: f(c)} : s;
        });
      update(c => ({...c, loadingMore: true, moreFailed: false}));
      try {
        const r = await mycelium.getCatalog(plugin.pluginId, def.id, page);
        const variant = variantFor(def);
        update(c => {
          const seen = new Set(c.cards.map(x => x.key));
          const more = r.items
            .map(i => catalogCard(plugin.pluginId, i, variant))
            .filter(x => !seen.has(x.key) && !!seen.add(x.key));
          return {
            ...c,
            cards: [...c.cards, ...more],
            page,
            hasMore: r.hasMore,
            loadingMore: false,
            moreFailed: false,
          };
        });
      } catch {
        update(c => ({...c, loadingMore: false, moreFailed: true}));
      } finally {
        moreInFlight.current.delete(def.id);
      }
    },
    [plugin.pluginId],
  );

  // Live rows reload silently every minute while this page is in front
  // (live_rows_refresher.dart): events go on air, start times move. Cards
  // already shown stay until the new page lands; a failure keeps them.
  useEffect(() => {
    const live = catalogs.filter(c => c.type === 'live');
    if (inactive || !live.length) {
      return;
    }
    const t = setInterval(async () => {
      if (AppState.currentState !== 'active') {
        return;
      }
      for (const def of live) {
        const cur = stateRef.current[def.id];
        // A row paged past its first page keeps what's been loaded.
        if (!cur || cur.loading || cur.page > 1) {
          continue;
        }
        try {
          const r = await mycelium.getCatalog(plugin.pluginId, def.id, 1);
          const variant = variantFor(def);
          const seen = new Set<string>();
          const fresh = r.items
            .map(i => catalogCard(plugin.pluginId, i, variant))
            .filter(c => !seen.has(c.key) && !!seen.add(c.key));
          // An emptied row would drop out from under the focus: leave it for
          // the next full load instead.
          if (fresh.length) {
            setState(st => ({
              ...st,
              [def.id]: firstPage(fresh, {hasMore: r.hasMore}),
            }));
          }
        } catch {
          // Keep what's on screen; the next tick tries again.
        }
      }
    }, LIVE_REFRESH_MS);
    return () => clearInterval(t);
  }, [catalogs, inactive, plugin.pluginId]);

  // Load the active row and pre-load the next one.
  useEffect(() => {
    for (const r of [rows[rowIndex], rows[rowIndex + 1]]) {
      if (r?.def && !stateRef.current[r.def.id]) {
        load(r.def);
      }
    }
  }, [rows, rowIndex, load]);

  // If CW was emptied, or the active row turned out empty, stay on a row
  // that exists.
  useEffect(() => {
    if (row && row.id !== rowId) {
      setRowId(row.id);
    }
  }, [row, rowId]);

  const activeDefId = row?.def?.id;
  const cards = useMemo(
    () => (row?.id === 'cw' ? cwCards : activeDefId ? state[activeDefId]?.cards ?? NO_CARDS : NO_CARDS),
    [row?.id, cwCards, activeDefId, state],
  );
  const rowState = row?.def ? state[row.def.id] : undefined;

  // Hero follows the focused card, debounced so holding → doesn't decode
  // every fanart on the way.
  const heroStore = useRef(createHeroStore()).current;
  const setHero = heroStore.set;
  const heroTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedIndex = useRef(0);

  // The card the hero is (or is about to be) showing: a CW details lookup
  // only lands while it's still that card.
  const heroCard = useRef('');
  const commitHero = useCallback((card: CardModel) => {
    heroCard.current = card.key;
    const entry = card.open.cw;
    setHero((entry && cachedCwHero(entry)) || card.hero);
    if (entry && !cachedCwHero(entry)) {
      fetchCwHero(entry, card.hero).then(h => {
        if (h && heroCard.current === card.key) {
          setHero(h);
        }
      });
    }
  }, [setHero]);

  const firstHero = useRef(false);
  useEffect(() => {
    if (!firstHero.current && cards.length) {
      firstHero.current = true;
      perf.homeShown();
      commitHero(cards[0]);
    }
  }, [cards, commitHero]);
  useEffect(
    () => () => {
      if (heroTimer.current) {
        clearTimeout(heroTimer.current);
      }
    },
    [],
  );

  // Resting on a Continue Watching card is the strongest "about to resume"
  // signal the home has: warm the stream it resumes (continue_watching.dart).
  // Passing over it cancels before the dwell.
  const cancelWarm = useRef<() => void>(() => {});
  useEffect(() => () => cancelWarm.current(), []);
  useEffect(() => {
    if (inactive) {
      cancelWarm.current();
    }
  }, [inactive]);

  const showHero = useCallback(
    (card: CardModel | undefined, delay: number) => {
      if (heroTimer.current) {
        clearTimeout(heroTimer.current);
      }
      if (!card) {
        return;
      }
      // Start the downloads now, so they're under way by the time the hero
      // swaps.
      heroImageUrls(card.hero, L).forEach(u => Image.prefetch(u).catch(() => false));
      heroTimer.current = setTimeout(() => commitHero(card), delay);
    },
    [commitHero, L],
  );

  const onFocusCard = useCallback(
    (index: number, held: boolean) => {
      focusedIndex.current = index;
      const card = cards[index];
      cancelWarm.current();
      const entry = card?.open.cw;
      cancelWarm.current = entry ? scheduleWarm(entry.pluginId, entry.mediaId) : () => {};
      if (held) {
        // Passing over cards with ←/→ held: no downloads and no hero swap for
        // each of them (they piled up, and the card you stopped on waited
        // behind all of them). The row reports the release (onSettle); this
        // is only the fallback if that never comes.
        if (heroTimer.current) {
          clearTimeout(heroTimer.current);
        }
        heroTimer.current = setTimeout(() => card && showHero(card, 0), HOLD_SETTLE_FALLBACK_MS);
        return;
      }
      showHero(card, HERO_DEBOUNCE_MS);
    },
    [cards, showHero],
  );

  const onSettle = useCallback((index: number) => showHero(cards[index], 0), [cards, showHero]);

  const switchRow = useCallback(
    (delta: number) => {
      const next = rows[rowIndex + delta];
      if (!next) {
        return;
      }
      focusedIndex.current = 0;
      setRowId(next.id);
      const s = next.def ? stateRef.current[next.def.id] : undefined;
      const first = next.id === 'cw' ? cwCards[0] : s?.cards[0];
      if (heroTimer.current) {
        clearTimeout(heroTimer.current);
      }
      if (first) {
        commitHero(first);
      }
    },
    [rows, rowIndex, cwCards, commitHero],
  );

  // Opening a panel ignores card focus for a moment: the key that opened it
  // can also move native focus onto some card before the panel's state lands.
  // and when a panel closes, the native engine's own pick lands first.
  const gate = useFocusGate(inactive);
  const suppressUntil = useRef(0);
  const isInactive = useCallback(() => gate() || Date.now() < suppressUntil.current, [gate]);
  const suppress = () => {
    suppressUntil.current = Date.now() + 250;
  };

  // A held ← only steps back through the row and stops on the first card;
  // only a fresh press there opens the nav (card_carousel_block_view.dart).
  const leftHeld = useRef(false);
  useTVEventHandler(evt => {
    if (evt.eventType === 'left') {
      const repeat = leftHeld.current && evt.eventKeyAction !== 1;
      leftHeld.current = evt.eventKeyAction !== 1;
      if (repeat) {
        return;
      }
    }
    if (inactive || evt.eventKeyAction === 1) {
      return;
    }
    switch (evt.eventType) {
      case 'down':
        switchRow(1);
        break;
      case 'up':
        if (rowIndex === 0) {
          suppress();
          onOpenSearch();
        } else {
          switchRow(-1);
        }
        break;
      case 'left':
        if (focusedIndex.current === 0) {
          suppress();
          onOpenNav();
        }
        break;
    }
  });

  // Once the switched-to row's first card exists it takes focus.
  const firstCardKey = cards[0]?.key ?? '';

  const focusRequest: FocusRequest | null = useMemo(
    () =>
      refocus.token
        ? {
            token: refocus.token,
            index: refocus.restore ? focusedIndex.current : 0,
          }
        : null,
    [refocus],
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      <HeroFromStore store={heroStore} L={L} />
      {row ? <SectionHeader title={row.title} active={rowIndex} total={rows.length} L={L} /> : null}
      <View style={[styles.strip, {top: L.carouselTop + L.headerH}]}>
        {cards.length ? (
          <CarouselRow
            key={`${row?.id}:${firstCardKey}`}
            cards={cards}
            variant={row?.variant ?? 'poster'}
            L={L}
            isInactive={isInactive}
            takeFocus={!inactive}
            focusRequest={focusRequest}
            highlightFirst={navOpen}
            onFocusCard={onFocusCard}
            onSettle={onSettle}
            onPressCard={i => cards[i] && onOpenItem(cards[i])}
            onLongPressCard={i => cards[i] && onCardMenu(cards[i], row?.def)}
            loadMore={
              row?.def &&
              row.def.type !== 'live' &&
              rowState &&
              showsMoreSlot(
                {
                  count: rowState.cards.length,
                  hasMore: rowState.hasMore,
                  loading: rowState.loadingMore,
                  failed: rowState.moreFailed,
                },
                HOME_ROW_MAX_ITEMS,
              )
                ? {
                    loading: rowState.loadingMore,
                    failed: rowState.moreFailed,
                    onLoad: () => row.def && loadMore(row.def),
                  }
                : undefined
            }
          />
        ) : rowState?.failed ? (
          <Text style={styles.message}>Impossibile caricare questa sezione.</Text>
        ) : rows.length === 0 && Object.keys(state).length >= catalogs.length ? (
          <Text style={styles.message}>Nessun contenuto disponibile.</Text>
        ) : (
          <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
        )}
      </View>
    </View>
  );
}

const styles = scaledStyles({
  strip: {position: 'absolute', left: 0, right: 0, bottom: 0},
  message: {color: colors.textMid, fontSize: 26, marginLeft: 56, marginTop: 40},
  spinner: {marginTop: 80},
});
