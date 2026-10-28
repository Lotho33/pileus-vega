// Quick search, port of pileus-player's quick_search_area: a bar at the top
// of the home, opened with ↑ from the first row. It expands in place into
// the on-screen keyboard plus a live preview row of results for the active
// plugin; the filters button and "Vedi tutti i risultati" under the
// preview open the full SearchScreen with the query. Focus is trapped in
// the panel: only Back and the X close it.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, Text, View} from 'react-native';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {Icon, IconName} from '../components/Icon';
import {OnScreenKeyboard} from '../components/OnScreenKeyboard';
import {mycelium} from '../core/api';
import {RecentSearchRecorder, recentSearches} from '../core/recentSearches';
import type {PluginInfo} from '../gen/media';
import {colors, scaledStyles} from '../theme';
import {PosterCard} from './Cards';
import type {HomeLayout} from './layout';
import {CardModel, catalogCard} from './model';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 350;
const PREVIEW_COUNT = 8;
const VISIBLE_RESULTS = 4;

function SquareButton({
  icon,
  label,
  size,
  onPress,
}: {
  icon: IconName;
  label: string;
  size: number;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityLabel={label}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[styles.square, {width: size, height: size}, focused && styles.squareFocused]}>
      <Icon name={icon} size={size * 0.44} color="rgba(242,242,240,0.7)" />
    </Pressable>
  );
}

// _SeeAllResultsButton: a quiet text button, outlined when focused.
function SeeAllButton({label, fontSize, onPress}: {label: string; fontSize: number; onPress: () => void}) {
  const [focused, setFocused] = useState(false);
  const color = focused ? colors.textHigh : 'rgba(242,242,240,0.6)';
  return (
    <Pressable
      accessibilityLabel={label}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[styles.seeAll, focused && styles.seeAllOn]}>
      <Icon name="grid" size={fontSize * 1.2} color={focused ? colors.textHigh : 'rgba(255,255,255,0.54)'} />
      <Text style={{fontSize, color}}>{label}</Text>
    </Pressable>
  );
}

// Geometry of the Flutter preview (fixed_carousel.dart with 4 slots): the
// panel's own catalog padding, 4 cards plus a 0.16 peek of the next one,
// the focused card pinned in the first slot until the row's end. Whole
// pixels, so the slide never drifts off the slots. `maxCardH` keeps the
// panel (and the see-all button under it) on screen.
const PEEK = 0.16;

function Results({
  cards,
  width,
  maxCardH,
  onOpen,
}: {
  cards: CardModel[];
  width: number;
  maxCardH: number;
  onOpen: (card: CardModel) => void;
}) {
  const list = useRef<FlatList<CardModel>>(null);
  const [focused, setFocused] = useState(0);
  const pad = Math.round(width * (56 / 1920));
  const gap = Math.round(width * (20 / 1920));
  const cardW = Math.round(
    Math.min((width - pad * 2 - gap * VISIBLE_RESULTS) / (VISIBLE_RESULTS + PEEK), maxCardH / 1.5),
  );
  const cardH = Math.round(cardW * 1.5);
  const stride = cardW + gap;
  const title = cards[focused]?.title ?? cards[0]?.title ?? '';
  return (
    <View>
      <Text style={[styles.resultTitle, {fontSize: cardW * 0.09}]} numberOfLines={1}>
        {title}
      </Text>
      <FlatList
        ref={list}
        horizontal
        data={cards}
        keyExtractor={c => c.key}
        getItemLayout={(_, index) => ({length: stride, offset: stride * index, index})}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={{width, height: cardH * 1.12}}
        contentContainerStyle={{paddingHorizontal: pad}}
        renderItem={({item, index}) => (
          <View style={[styles.cell, {width: stride}]}>
            <PosterCard
              card={item}
              width={cardW}
              height={cardH}
              preferred={false}
              onFocus={() => {
                setFocused(index);
                const first = Math.max(0, Math.min(index, cards.length - VISIBLE_RESULTS));
                list.current?.scrollToOffset({offset: stride * first, animated: true});
              }}
              onPress={() => onOpen(item)}
            />
          </View>
        )}
      />
    </View>
  );
}

// "Ricerche recenti" (recent_row.dart): with nothing typed, the profile's
// recent searches for this plugin as chips, then "Cancella".
function RecentChip({
  label,
  icon,
  dim,
  fontSize,
  onPress,
}: {
  label: string;
  icon: IconName;
  dim?: boolean;
  fontSize: number;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityLabel={label}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[styles.chip, {paddingHorizontal: fontSize * 0.8, paddingVertical: fontSize * 0.4, gap: fontSize * 0.4}, focused && styles.chipOn]}>
      <Icon name={icon} size={fontSize * 1.2} color={focused ? colors.textHigh : 'rgba(255,255,255,0.54)'} />
      <Text
        style={{fontSize, color: focused ? colors.textHigh : dim ? 'rgba(242,242,240,0.5)' : 'rgba(242,242,240,0.8)'}}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function RecentRow({
  queries,
  fontSize,
  onPick,
  onClear,
}: {
  queries: string[];
  fontSize: number;
  onPick: (q: string) => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.recent}>
      <Text style={[styles.recentTitle, {fontSize: fontSize * 0.8, marginBottom: fontSize * 0.66}]}>RICERCHE RECENTI</Text>
      <View style={[styles.recentWrap, {gap: fontSize * 0.53}]}>
        {queries.map(q => (
          <RecentChip key={q} label={q} icon="history" fontSize={fontSize} onPress={() => onPick(q)} />
        ))}
        <RecentChip label="Cancella" icon="delete" dim fontSize={fontSize} onPress={onClear} />
      </View>
    </View>
  );
}

export function QuickSearch({
  plugin,
  L,
  open,
  onClose,
  onOpenItem,
  onOpenFullSearch,
}: {
  plugin: PluginInfo;
  L: HomeLayout;
  open: boolean;
  onClose: () => void;
  onOpenItem: (card: CardModel) => void;
  onOpenFullSearch: (query: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CardModel[] | null>(null);
  /** Results past the preview (the "+N" of the see-all button). */
  const [more, setMore] = useState(0);
  const [pending, setPending] = useState(false);
  const seq = useRef(0);
  const recorder = useRef(new RecentSearchRecorder()).current;
  const [recent, setRecent] = useState<string[]>([]);
  // A new value sends focus back to the keyboard (a picked chip unmounts).
  const [kbFocus, setKbFocus] = useState(0);
  useEffect(() => () => recorder.dispose(), [recorder]);
  useEffect(() => {
    if (open) {
      setRecent(recentSearches.list(plugin.pluginId));
    }
  }, [open, plugin.pluginId]);

  const barH = L.H * 0.052;
  const pad = L.H * (21.6 / 1080);
  const collapsedW = Math.min(620, Math.max(320, L.W * 0.3));
  const expandedW = Math.min(Math.min(1200, Math.max(700, L.W * 0.6)), L.W - L.hPad * 2);
  const innerW = expandedW - pad * 2;

  // Closing forgets the query, like _dismiss() in the Flutter app.
  useEffect(() => {
    if (!open) {
      seq.current++;
      setQuery('');
      setResults(null);
      setPending(false);
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    const id = ++seq.current;
    recorder.typing();
    if (q.length < MIN_QUERY) {
      setPending(false);
      setResults(null);
      return;
    }
    setPending(true);
    const t = setTimeout(async () => {
      try {
        const r = await mycelium.search(plugin.pluginId, q);
        if (id === seq.current) {
          const seen = new Set<string>();
          const all = r.items
            .map(i => catalogCard(plugin.pluginId, i, 'poster'))
            .filter(c => !seen.has(c.key) && !!seen.add(c.key));
          setResults(all.slice(0, PREVIEW_COUNT));
          setMore(Math.max(0, all.length - PREVIEW_COUNT));
          recorder.settled(plugin.pluginId, q, all.length > 0);
        }
      } catch {
        if (id === seq.current) {
          setResults([]);
        }
      } finally {
        if (id === seq.current) {
          setPending(false);
        }
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, plugin.pluginId, recorder]);

  const openItem = useCallback(
    (card: CardModel) => {
      recorder.submit(plugin.pluginId, query);
      onClose();
      onOpenItem(card);
    },
    [onClose, onOpenItem, recorder, plugin.pluginId, query],
  );
  const openFull = () => {
    if (query.trim()) {
      recorder.submit(plugin.pluginId, query);
    }
    onOpenFullSearch(query);
  };

  const label = plugin.name || plugin.pluginId;
  const bar = (
    <View style={[styles.bar, open && styles.barOpen, {height: barH, paddingHorizontal: barH * 0.28}]}>
      <Icon name="search" size={barH * 0.42} color="rgba(242,242,240,0.5)" />
      <Text
        style={[styles.barText, !query && styles.barPlaceholder, {fontSize: barH * 0.32, marginLeft: barH * 0.2}]}
        numberOfLines={1}>
        {query || `Cerca in ${label}…`}
        {open ? <Text style={styles.caret}>|</Text> : null}
      </Text>
    </View>
  );

  return (
    <View style={[styles.anchor, {top: L.H * (22 / 1080)}]} pointerEvents="box-none">
      {!open ? (
        <View style={{width: collapsedW}}>{bar}</View>
      ) : (
        <TVFocusGuideView
          style={[styles.panel, {width: expandedW, padding: pad}]}
          trapFocusLeft
          trapFocusRight
          trapFocusUp
          trapFocusDown>
          <View style={[styles.barRow, {gap: barH * 0.16}]}>
            <View style={styles.flex}>{bar}</View>
            <SquareButton icon="tune" label="Ricerca completa" size={barH} onPress={openFull} />
            <SquareButton icon="close" label="Chiudi ricerca" size={barH} onPress={onClose} />
          </View>
          <View style={{marginTop: L.H * (15 / 1080)}}>
            <OnScreenKeyboard
              value={query}
              onChange={setQuery}
              layout="search"
              showEnter={false}
              maxLength={80}
              width={innerW}
              keyHeight={L.H * 0.046}
              takeFocus
              focusToken={kbFocus}
            />
          </View>
          <View style={{marginTop: L.H * (19.4 / 1080)}}>
            {pending ? (
              <ActivityIndicator color={colors.primary} style={{marginVertical: L.H * 0.02}} />
            ) : results && results.length ? (
              <>
                <Results cards={results} width={innerW} maxCardH={L.H * 0.3} onOpen={openItem} />
                <SeeAllButton
                  label={more > 0 ? `Vedi tutti i risultati (+${more})` : 'Vedi tutti i risultati'}
                  fontSize={L.H * (30 / 1080)}
                  onPress={openFull}
                />
              </>
            ) : results ? (
              <Text style={[styles.empty, {fontSize: L.H * 0.02}]}>Nessun risultato per “{query.trim()}”</Text>
            ) : !query && recent.length ? (
              <RecentRow
                queries={recent}
                fontSize={L.H * (15 / 1080)}
                onPick={q => {
                  // Keyboard first: the chip is about to unmount.
                  setKbFocus(n => n + 1);
                  setQuery(q);
                }}
                onClear={() => {
                  setKbFocus(n => n + 1);
                  recentSearches.clear(plugin.pluginId);
                  setRecent([]);
                }}
              />
            ) : null}
          </View>
        </TVFocusGuideView>
      )}
    </View>
  );
}

const styles = scaledStyles({
  anchor: {position: 'absolute', left: 0, right: 0, alignItems: 'center'},
  panel: {borderRadius: 16, backgroundColor: 'rgba(16,16,24,0.95)'},
  barRow: {flexDirection: 'row', alignItems: 'center'},
  flex: {flex: 1},
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(242,242,240,0.12)',
    backgroundColor: '#1E1E2E',
  },
  barOpen: {borderColor: 'rgba(242,242,240,0.20)'},
  barText: {flex: 1, color: colors.textHigh},
  barPlaceholder: {color: 'rgba(242,242,240,0.4)'},
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
  resultTitle: {color: '#fff', fontWeight: '700', textAlign: 'center', marginBottom: 12},
  cell: {justifyContent: 'center'},
  empty: {color: colors.textMid, textAlign: 'center', marginVertical: 12},
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 12,
    marginTop: 22,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  seeAllOn: {borderColor: colors.primary, backgroundColor: 'rgba(124,106,247,0.18)'},
  recent: {alignItems: 'center'},
  recentTitle: {color: colors.textLow, fontWeight: '700', letterSpacing: 1.2},
  recentWrap: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center'},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chipOn: {borderColor: colors.primary, backgroundColor: 'rgba(124,106,247,0.18)'},
});
