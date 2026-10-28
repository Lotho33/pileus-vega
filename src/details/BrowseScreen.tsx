// Folder contents (browse_screen.dart): Browse(parent) shown as a numbered
// episode list when the children look like episodes, else as a poster grid.
// Folders open another browse page, anime episodes their episode page, live
// items the live popup, anything else plays right away (the item id is the
// stream id, as in pileus-player). First page only, like the Flutter app.
// The focused position is remembered per folder, so coming back from a
// page on top lands where you were.

import React, {forwardRef, useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, Text, View} from 'react-native';
import {FocusButton} from '../components/FocusButton';
import {Icon} from '../components/Icon';
import {mycelium} from '../core/api';
import {focusSoon} from '../core/focus';
import type {CatalogItem} from '../gen/media';
import {PosterCard} from '../home/Cards';
import type {HomeLayout} from '../home/layout';
import {catalogCard, CardModel, OpenTarget} from '../home/model';
import type {EpisodeNav} from '../player/episodes';
import {emptyRequest, PlayRequest} from '../player/session';
import {errorText} from '../state/auth';
import {colors, scaledStyles} from '../theme';
import {BackButton} from './common';
import {isAnimeItem, isEpisodeList} from './format';

const H_PAD = 48 / 1920;
const V_PAD = 28 / 1080;
const CARD_W = 200 / 1920;
const CARD_GAP = 20 / 1920;
const TILE_H = 72 / 1080;

const lastFocus = new Map<string, number>();

function genresOf(i: CatalogItem): string[] {
  return (i.extra?.genres ?? '')
    .split(',')
    .map(g => g.trim())
    .filter(Boolean);
}

const EpisodeTile = forwardRef<
  View,
  {item: CatalogItem; height: number; preferred: boolean; onFocus: () => void; onPress: () => void}
>(function EpisodeTile({
  item,
  height,
  preferred,
  onFocus,
  onPress,
}, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      ref={ref}
      hasTVPreferredFocus={preferred}
      accessibilityLabel={item.title}
      onFocus={() => {
        setFocused(true);
        onFocus();
      }}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[
        styles.tile,
        {height: height - Math.round(height * 0.07), marginBottom: Math.round(height * 0.07), paddingHorizontal: height * 0.26},
        focused && styles.tileOn,
      ]}>
      <Text style={[styles.tileNum, {width: height * 0.8, fontSize: height * 0.36}, focused && styles.textOn]}>
        {item.episodeNumber > 0 ? item.episodeNumber : '—'}
      </Text>
      <Text
        style={[styles.tileTitle, {fontSize: height * 0.24, marginLeft: height * 0.2}, focused && styles.textOn]}
        numberOfLines={1}>
        {item.title}
      </Text>
      <Icon name="chevronRight" size={height * 0.38} color={focused ? '#fff' : 'rgba(255,255,255,0.24)'} />
    </Pressable>
  );
});

export function BrowseScreen({
  pluginId,
  parentId,
  title,
  L,
  onBack,
  onOpen,
  onPlay,
  refocus = 0,
}: {
  /** Bumped when something on top (the player) closes: focus comes back. */
  refocus?: number;
  pluginId: string;
  parentId: string;
  title: string;
  L: HomeLayout;
  onBack: () => void;
  /** Another page on top: a folder, an episode page or a live popup. */
  onOpen: (card: CardModel) => void;
  onPlay: (req: PlayRequest) => void;
}) {
  const {W, H} = L;
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [error, setError] = useState('');
  const epList = useRef<FlatList<CatalogItem>>(null);
  const gridList = useRef<FlatList<CatalogItem[]>>(null);
  const scrollList = (offset: number, animated: boolean) =>
    (epList.current ?? gridList.current)?.scrollToOffset({offset: Math.max(0, offset), animated});
  const key = `${pluginId}:${parentId}`;
  const startAt = useRef(lastFocus.get(key) ?? 0).current;
  // Items by index, to put focus back explicitly: hasTVPreferredFocus
  // alone loses the race against the native engine on a remount.
  const itemRefs = useRef(new Map<number, View>());
  const setItemRef = (i: number) => (v: View | null) => {
    if (v) {
      itemRefs.current.set(i, v);
    } else {
      itemRefs.current.delete(i);
    }
  };

  const load = useCallback(async () => {
    setError('');
    setItems(null);
    try {
      const r = await mycelium.browse(pluginId, parentId);
      setItems(r.items);
    } catch (e) {
      setError(errorText(e));
    }
  }, [pluginId, parentId]);

  useEffect(() => {
    load();
  }, [load]);

  const hPad = W * H_PAD;
  const vPad = H * V_PAD;
  const episodes = !!items && isEpisodeList(items);

  const open = (item: CatalogItem, index: number) => {
    lastFocus.set(key, index);
    const card = catalogCard(pluginId, item, 'poster');
    if (item.isDir) {
      onOpen({...card, open: {...card.open, view: 'browse'}});
    } else if (episodes && isAnimeItem(item)) {
      // The folder is the season: previous/next and batch downloads walk it.
      const nav: EpisodeNav = {
        episodes: (items ?? []).map(i => ({
          id: i.id,
          title: i.title,
          thumb: i.posterUrl,
          episodeNumber: i.episodeNumber,
          seasonNumber: i.seasonNumber,
        })),
        index,
        seasonIds: [],
        seasonIndex: 0,
        seriesPoster: '',
      };
      onOpen({...card, open: {...card.open, view: 'episode', showTitle: title, nav}});
    } else if (item.mediaType === 'live') {
      onOpen(card);
    } else {
      onPlay(
        emptyRequest({
          pluginId,
          streamId: item.id,
          title: item.title,
          showTitle: episodes ? title : '',
          poster: item.posterUrl,
          plot: item.extra?.plot ?? '',
          genres: genresOf(item),
          rating: item.rating,
          year: item.year,
          seasonNumber: item.seasonNumber,
          episodeNumber: item.episodeNumber,
        }),
      );
    }
  };

  // Grid geometry (_PosterGridView).
  const avail = W - hPad * 2;
  // Whole pixels: the list scrolls by multiples of these.
  const gap = Math.round(W * CARD_GAP);
  const cols = Math.max(2, Math.min(10, Math.floor(avail / (W * CARD_W + gap))));
  const cardW = Math.floor((avail - gap * (cols - 1)) / cols);
  const cardH = Math.round(cardW * 1.5);
  const rowH = cardH + gap;
  const tileH = Math.round(H * TILE_H);
  const stride = episodes ? tileH : rowH;
  const rows: CatalogItem[][] = [];
  if (items && !episodes) {
    for (let i = 0; i < items.length; i += cols) {
      rows.push(items.slice(i, i + cols));
    }
  }

  // Keep the focused line about a third of the way down.
  const listH = H - vPad - H * 0.06 - H * 0.014;
  const scrollTo = (line: number) => scrollList(line * stride - listH * 0.3, true);

  // Initial position: the remembered line is scrolled in before it focuses.
  const initialLine = episodes ? startAt : Math.floor(startAt / cols);
  useEffect(() => {
    if (items?.length && initialLine > 0) {
      scrollList(initialLine * stride - listH * 0.3, false);
    }
    // Once, when the items arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Once the items are there, and again whenever the player on top closes:
  // the remembered item.
  const loaded = !!items?.length;
  useEffect(() => {
    if (loaded) {
      return focusSoon(() => itemRefs.current.get(lastFocus.get(key) ?? 0) ?? itemRefs.current.get(0));
    }
  }, [loaded, refocus, key]);

  const retryRef = useRef<View>(null);
  useEffect(() => (error ? focusSoon(() => retryRef.current) : undefined), [error]);

  let body: React.ReactNode;
  if (error) {
    body = (
      <View style={styles.center}>
        <Text style={styles.title}>Impossibile caricare il contenuto.</Text>
        <Text style={styles.message}>{error}</Text>
        <View style={styles.actions}>
          <FocusButton ref={retryRef} label="Riprova" primary onPress={load} />
          <FocusButton label="Indietro" onPress={onBack} />
        </View>
      </View>
    );
  } else if (!items) {
    body = <ActivityIndicator size="large" color={colors.textHigh} style={styles.spinner} />;
  } else if (!items.length) {
    body = (
      <View style={styles.center}>
        <Text style={styles.title}>Niente da mostrare</Text>
        <Text style={styles.message}>Questa sezione è vuota.</Text>
        <View style={styles.actions}>
          <FocusButton label="Indietro" onPress={onBack} hasTVPreferredFocus />
        </View>
      </View>
    );
  } else if (episodes) {
    body = (
      <FlatList
        ref={epList}
        data={items}
        keyExtractor={i => i.id}
        getItemLayout={(_, index) => ({length: stride, offset: stride * index, index})}
        scrollEnabled={false}
        initialNumToRender={Math.max(12, startAt + 8)}
        contentContainerStyle={[styles.epContent, {paddingHorizontal: hPad}]}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        renderItem={({item, index}) => (
          <EpisodeTile
            ref={setItemRef(index)}
            item={item}
            height={tileH}
            preferred={index === startAt}
            onFocus={() => {
              lastFocus.set(key, index);
              scrollTo(index);
            }}
            onPress={() => open(item, index)}
          />
        )}
      />
    );
  } else {
    body = (
      <FlatList
        ref={gridList}
        data={rows}
        keyExtractor={r => r[0].id}
        getItemLayout={(_, index) => ({length: stride, offset: stride * index, index})}
        scrollEnabled={false}
        initialNumToRender={Math.max(4, initialLine + 3)}
        contentContainerStyle={[styles.gridContent, {paddingHorizontal: hPad, paddingTop: cardH * 0.08}]}
        maxToRenderPerBatch={3}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        renderItem={({item: row, index: r}) => (
          <View style={[styles.gridRow, {height: rowH, gap}]}>
            {row.map((it, c) => {
              const i = r * cols + c;
              return (
                <PosterCard
                  key={it.id}
                  ref={setItemRef(i)}
                  card={catalogCard(pluginId, it, 'poster')}
                  width={cardW}
                  height={cardH}
                  preferred={i === startAt}
                  onFocus={() => {
                    lastFocus.set(key, i);
                    scrollTo(r);
                  }}
                  onPress={() => open(it, i)}
                />
              );
            })}
          </View>
        )}
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, {paddingHorizontal: hPad, paddingTop: vPad, marginBottom: H * 0.014}]}>
        <BackButton s={H / 1080} onPress={onBack} />
        {title ? (
          <Text style={[styles.heading, {fontSize: H * 0.026, marginLeft: W * 0.01}]} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>
      <View style={styles.flex}>{body}</View>
    </View>
  );
}

/** What a browse page needs on the details stack. */
export function browseTarget(pluginId: string, mediaId: string, title: string): OpenTarget {
  return {pluginId, mediaId, mediaType: '', isDir: true, title, view: 'browse'};
}

const styles = scaledStyles({
  root: {flex: 1, backgroundColor: '#000'},
  flex: {flex: 1},
  header: {flexDirection: 'row', alignItems: 'center'},
  heading: {flex: 1, color: '#fff', fontWeight: '700'},
  spinner: {marginTop: 120},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 64},
  title: {color: colors.textHigh, fontSize: 36, fontWeight: '700', textAlign: 'center'},
  message: {color: colors.textMid, fontSize: 24, marginTop: 16, textAlign: 'center'},
  actions: {flexDirection: 'row', gap: 24, marginTop: 40},
  epContent: {paddingBottom: 32},
  gridContent: {paddingBottom: 24},
  gridRow: {flexDirection: 'row', alignItems: 'flex-start'},
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tileOn: {backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.54)'},
  tileNum: {color: 'rgba(255,255,255,0.38)', fontWeight: '700'},
  tileTitle: {flex: 1, color: 'rgba(255,255,255,0.7)', fontWeight: '600'},
  textOn: {color: '#fff'},
});
