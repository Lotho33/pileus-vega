// Full search for one plugin, port of pileus-player's search_screen: bar +
// filters button + active-filter chips, the on-screen keyboard, one row of
// results with the focused title's details under it (further pages through
// a trailing «Carica altri» card, never on their own), and the filter drawer.
// Opened from quick search's filters button with the query typed so far.

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {useKeplerBackHandler} from '@amazon-devices/react-native-kepler';
import {FocusButton} from '../components/FocusButton';
import {Icon, IconName} from '../components/Icon';
import {OnScreenKeyboard} from '../components/OnScreenKeyboard';
import {mycelium} from '../core/api';
import {recentSearches} from '../core/recentSearches';
import {focusSoon, useFocusGate} from '../core/focus';
import type {PluginInfo, SearchFilter} from '../gen/media';
import {CarouselRow} from '../home/CarouselRow';
import {computeLayout} from '../home/layout';
import {CardModel, catalogCard} from '../home/model';
import {errorText} from '../state/auth';
import {colors, px, scaledStyles} from '../theme';
import {FilterPanel} from './FilterPanel';
import {ActiveFilters, optionLabel, setFilter} from './filters';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 350;

interface Results {
  cards: CardModel[];
  page: number;
  hasMore: boolean;
  loadingMore: boolean;
  /** The last next-page request failed: the row ends in "Riprova". */
  moreFailed: boolean;
}

type FiltersStatus = 'loading' | 'ready' | 'none' | 'error';

const SquareButton = forwardRef<
  View,
  {
    icon: IconName;
    size: number;
    label: string;
    badge?: number;
    busy?: boolean;
    dim?: boolean;
    onFocus: () => void;
    onPress: () => void;
  }
>(function SquareButton(
  {icon, size, label, badge, busy, dim, onFocus, onPress},
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      ref={ref}
      accessibilityLabel={label}
      onFocus={() => {
        setFocused(true);
        onFocus();
      }}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[
        styles.square,
        {width: size, height: size},
        focused && styles.squareFocused,
        dim && styles.dim,
      ]}>
      {busy ? (
        <ActivityIndicator color={colors.textMid} />
      ) : (
        <Icon
          name={icon}
          size={size * 0.46}
          color={focused ? colors.textHigh : 'rgba(242,242,240,0.7)'}
        />
      )}
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
});

function ActiveChip({
  label,
  onFocus,
  onRemove,
}: {
  label: string;
  onFocus: () => void;
  onRemove: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityLabel={`Rimuovi ${label}`}
      onFocus={() => {
        setFocused(true);
        onFocus();
      }}
      onBlur={() => setFocused(false)}
      onPress={onRemove}
      style={[styles.activeChip, focused && styles.activeChipFocused]}>
      <Text style={styles.activeChipText}>{label}</Text>
      <Icon name="close" size={px(20)} color={colors.textMid} />
    </Pressable>
  );
}

function ItemInfo({card, H, hPad}: {card: CardModel; H: number; hPad: number}) {
  const h = card.hero;
  const s = H / 1080;
  const meta = [
    h.year > 0 ? String(h.year) : '',
    h.rating > 0 ? `★ ${h.rating.toFixed(1)}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ');
  return (
    <View style={{paddingHorizontal: hPad, marginTop: 8 * s}}>
      <Text style={[styles.infoTitle, {fontSize: 34 * s}]} numberOfLines={1}>
        {h.title}
      </Text>
      {meta ? (
        <Text style={[styles.infoMeta, {fontSize: 20 * s}]}>{meta}</Text>
      ) : null}
      {h.genres.length ? (
        <View style={styles.genres}>
          {h.genres.slice(0, 4).map((g) => (
            <View key={g} style={styles.genre}>
              <Text style={[styles.genreText, {fontSize: 17 * s}]}>{g}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {h.plot ? (
        <Text
          style={[
            styles.infoPlot,
            {fontSize: 17 * s, lineHeight: 17 * s * 1.5},
          ]}
          numberOfLines={3}>
          {h.plot}
        </Text>
      ) : null}
    </View>
  );
}

export function SearchScreen({
  plugin,
  initialQuery,
  covered,
  onClose,
  onOpenItem,
}: {
  plugin: PluginInfo;
  initialQuery: string;
  /** A details page is open on top: Back and focus belong to it. */
  covered: boolean;
  onClose: () => void;
  onOpenItem: (card: CardModel) => void;
}) {
  const {width: W, height: H} = useWindowDimensions();
  const L = useMemo(() => computeLayout(W, H), [W, H]);
  const keplerBack = useKeplerBackHandler();
  const hPad = W * (48 / 1920);
  const vPad = H * (52 / 1080);
  const barH = H * (72 / 1080);
  const label = plugin.name || plugin.pluginId;

  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState<ActiveFilters>({});
  const [filters, setFilters] = useState<SearchFilter[]>([]);
  const [filtersStatus, setFiltersStatus] = useState<FiltersStatus>('loading');
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(true);
  const [kbFocus, setKbFocus] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [focused, setFocused] = useState(0);
  const filterBtn = useRef<View>(null);
  const seq = useRef(0);

  const loadFilters = useCallback(async () => {
    setFiltersStatus('loading');
    try {
      const f = await mycelium.getSearchFilters(plugin.pluginId);
      setFilters(f);
      setFiltersStatus(f.length ? 'ready' : 'none');
      return f;
    } catch {
      setFiltersStatus('error');
      return [];
    }
  }, [plugin.pluginId]);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  // One next page at a time: focus can step past several cards before the
  // "loading" state reaches the row.
  const moreInFlight = useRef(false);
  const runSearch = useCallback(
    async (q: string, f: ActiveFilters, page: number) => {
      if (page > 1 && moreInFlight.current) {
        return;
      }
      const id = page === 1 ? ++seq.current : seq.current;
      if (page === 1) {
        setLoading(true);
        setError('');
      } else {
        moreInFlight.current = true;
        setResults((r) =>
          r ? {...r, loadingMore: true, moreFailed: false} : r,
        );
      }
      try {
        const r = await mycelium.search(plugin.pluginId, q, page, f);
        if (id !== seq.current) {
          return;
        }
        setResults((prev) => {
          const base = page > 1 && prev ? prev.cards : [];
          const seen = new Set(base.map((c) => c.key));
          const next = r.items
            .map((i) => catalogCard(plugin.pluginId, i, 'poster'))
            .filter((c) => !seen.has(c.key) && !!seen.add(c.key));
          return {
            cards: [...base, ...next],
            page,
            hasMore: r.hasMore,
            loadingMore: false,
            moreFailed: false,
          };
        });
        if (page === 1) {
          setFocused(0);
        }
      } catch (e) {
        if (id !== seq.current) {
          return;
        }
        if (page === 1) {
          setResults(null);
          setError(errorText(e));
        } else {
          setResults((r) =>
            r ? {...r, loadingMore: false, moreFailed: true} : r,
          );
        }
      } finally {
        if (page > 1) {
          moreInFlight.current = false;
        }
        if (id === seq.current && page === 1) {
          setLoading(false);
        }
      }
    },
    [plugin.pluginId],
  );

  // Query changes are debounced; filter changes search right away.
  const lastFilters = useRef(active);
  useEffect(() => {
    const q = query.trim();
    const filtersChanged = lastFilters.current !== active;
    lastFilters.current = active;
    if (q.length < MIN_QUERY && !Object.keys(active).length) {
      seq.current++;
      setResults(null);
      setLoading(false);
      setError('');
      return;
    }
    const t = setTimeout(
      () => runSearch(q, active, 1),
      filtersChanged ? 0 : DEBOUNCE_MS,
    );
    return () => clearTimeout(t);
  }, [query, active, runSearch]);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    focusSoon(() => filterBtn.current);
  }, []);

  const onFilterButton = async () => {
    if (filtersStatus === 'ready') {
      setPanelOpen(true);
      return;
    }
    if (filtersStatus !== 'loading') {
      const f = await loadFilters();
      if (f.length) {
        setPanelOpen(true);
      }
    }
  };

  useEffect(() => {
    const sub = keplerBack.addEventListener('hardwareBackPress', () => {
      if (covered) {
        return false;
      }
      if (panelOpen) {
        closePanel();
      } else {
        onClose();
      }
      return true;
    });
    return () => sub.remove();
  }, [covered, panelOpen, closePanel, onClose, keplerBack]);

  const gate = useFocusGate(panelOpen || covered);

  // Back from a details page: focus returns to the result that opened it.
  const [refocus, setRefocus] = useState(0);
  const wasCovered = useRef(covered);
  useEffect(() => {
    if (wasCovered.current && !covered) {
      setRefocus((t) => t + 1);
    }
    wasCovered.current = covered;
  }, [covered]);

  const showKeyboard = () => {
    setKeyboardVisible(true);
    setKbFocus((t) => t + 1);
  };

  // ↑ from the results brings the keyboard back (Flutter onNavigateUp). With
  // the keyboard folded the native engine sends focus to the header, so a
  // header control that receives focus straight from a result redirects it.
  const fromResults = useRef(false);
  const onHeaderFocus = () => {
    if (fromResults.current) {
      fromResults.current = false;
      showKeyboard();
    }
  };

  const cards = results?.cards ?? [];
  const onFocusCard = (i: number) => {
    fromResults.current = true;
    setFocused(i);
    // Like the Flutter search: the keyboard folds away once you browse.
    setKeyboardVisible(false);
  };

  const chips = Object.entries(active).map(([id, value]) => {
    const f = filters.find((x) => x.id === id);
    return {
      id,
      label: f ? `${f.label}: ${optionLabel(f, value)}` : `${id}: ${value}`,
    };
  });

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: hPad,
            paddingTop: vPad,
            paddingBottom: vPad * 0.4,
          },
        ]}>
        <View style={[styles.headerRow, {gap: W * 0.006}]}>
          <SquareButton
            icon="back"
            size={barH}
            label="Indietro"
            onFocus={onHeaderFocus}
            onPress={onClose}
          />
          <View
            style={[
              styles.bar,
              {height: barH, paddingHorizontal: barH * 0.22},
            ]}>
            <Icon
              name="search"
              size={barH * 0.4}
              color="rgba(255,255,255,0.4)"
            />
            <Text
              style={[
                styles.barText,
                !query && styles.barPlaceholder,
                {fontSize: barH * 0.3, marginLeft: barH * 0.18},
              ]}
              numberOfLines={1}>
              {query || `Cerca in ${label}...`}
              {keyboardVisible ? <Text style={styles.caret}>|</Text> : null}
            </Text>
          </View>
          <SquareButton
            ref={filterBtn}
            icon="tune"
            size={barH}
            label="Filtri"
            badge={chips.length}
            busy={filtersStatus === 'loading'}
            dim={filtersStatus === 'none'}
            onFocus={onHeaderFocus}
            onPress={onFilterButton}
          />
        </View>
        {chips.length ? (
          <View style={[styles.chips, {marginTop: vPad * 0.3}]}>
            {chips.map((c) => (
              <ActiveChip
                key={c.id}
                label={c.label}
                onFocus={onHeaderFocus}
                onRemove={() => {
                  focusSoon(() => filterBtn.current);
                  setActive((a) => setFilter(a, c.id, ''));
                }}
              />
            ))}
          </View>
        ) : null}
      </View>

      {keyboardVisible ? (
        <View
          style={[
            styles.header,
            {paddingHorizontal: hPad, paddingBottom: vPad * 0.6},
          ]}>
          <OnScreenKeyboard
            value={query}
            onChange={setQuery}
            layout="search"
            showEnter={false}
            maxLength={80}
            width={W - hPad * 2}
            keyHeight={H * 0.044}
            takeFocus
            focusToken={kbFocus}
            onKeyFocus={() => {
              fromResults.current = false;
            }}
          />
        </View>
      ) : null}

      <View style={styles.results}>
        {loading && !cards.length ? (
          <ActivityIndicator
            size="large"
            color="rgba(255,255,255,0.54)"
            style={styles.center}
          />
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.promptTitle}>Ricerca non riuscita.</Text>
            <Text style={styles.promptText}>{error}</Text>
            <FocusButton
              label="Riprova"
              onPress={() => runSearch(query.trim(), active, 1)}
              style={styles.retry}
            />
          </View>
        ) : results && !cards.length ? (
          <View style={styles.center}>
            <Text style={styles.promptTitle}>Nessun risultato</Text>
            <Text style={styles.promptText}>
              {query.trim()
                ? `Niente per "${query.trim()}".`
                : 'Prova con un altro termine o filtro.'}
            </Text>
          </View>
        ) : cards.length ? (
          <View style={{marginTop: H * 0.01}}>
            {loading ? (
              <ActivityIndicator
                color="rgba(255,255,255,0.54)"
                style={[styles.refreshing, {right: hPad}]}
              />
            ) : null}
            <CarouselRow
              key={cards[0].key}
              cards={cards}
              variant="poster"
              L={L}
              isInactive={gate}
              takeFocus={false}
              focusRequest={refocus ? {index: focused, token: refocus} : null}
              onFocusCard={onFocusCard}
              onPressCard={(i) => {
                if (cards[i]) {
                  recentSearches.add(plugin.pluginId, query);
                  onOpenItem(cards[i]);
                }
              }}
              loadMore={
                results?.hasMore
                  ? {
                      loading: results.loadingMore,
                      failed: results.moreFailed,
                      onLoad: () =>
                        runSearch(query.trim(), active, results.page + 1),
                    }
                  : undefined
              }
            />
            {cards[focused] ? (
              <ItemInfo card={cards[focused]} H={H} hPad={hPad} />
            ) : null}
          </View>
        ) : (
          <View style={styles.center}>
            <Icon name="search" size={H * 0.07} color={colors.textLow} />
            <Text style={styles.promptTitle}>Cerca in {label}</Text>
            <Text style={styles.promptText}>
              Scrivi almeno {MIN_QUERY} lettere o scegli un filtro.
            </Text>
          </View>
        )}
      </View>

      {panelOpen ? (
        <FilterPanel
          filters={filters}
          active={active}
          width={Math.min(560, Math.max(360, W * 0.32))}
          onApply={(id, v) => setActive((a) => setFilter(a, id, v))}
          onReset={() => setActive({})}
          onClose={closePanel}
        />
      ) : null}
    </View>
  );
}

const styles = scaledStyles({
  root: {...StyleSheet.absoluteFillObject, backgroundColor: '#0D0D1A'},
  header: {backgroundColor: '#12121A'},
  headerRow: {flexDirection: 'row', alignItems: 'center'},
  bar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#1E1E2E',
  },
  barText: {flex: 1, color: '#fff'},
  barPlaceholder: {color: 'rgba(255,255,255,0.35)'},
  caret: {color: colors.primary},
  square: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(242,242,240,0.12)',
    backgroundColor: '#1E1E2E',
  },
  squareFocused: {borderColor: colors.primary, borderWidth: 2},
  dim: {opacity: 0.45},
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  badgeText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 10,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(124,106,247,0.6)',
    backgroundColor: 'rgba(124,106,247,0.2)',
  },
  activeChipFocused: {borderColor: colors.textHigh},
  activeChipText: {color: colors.textHigh, fontSize: 18},
  results: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12},
  promptTitle: {color: colors.textHigh, fontSize: 30, fontWeight: '700'},
  promptText: {color: colors.textLow, fontSize: 22, textAlign: 'center'},
  retry: {marginTop: 12},
  refreshing: {position: 'absolute', top: 0},
  infoTitle: {color: colors.textHigh, fontWeight: '800'},
  infoMeta: {color: colors.textMid, marginTop: 6},
  genres: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10},
  genre: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(242,242,240,0.10)',
  },
  genreText: {color: colors.textMid},
  infoPlot: {color: 'rgba(242,242,240,0.65)', marginTop: 10, maxWidth: '70%'},
});
