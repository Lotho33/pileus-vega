// "La mia lista" page (my_list_screen.dart): the profile's saved titles of
// every plugin in one poster grid, most recently added first (the server's
// order). OK opens a title as the home does; holding OK opens the card menu
// (which can take it off the list). Opened from the side nav only — the
// home has no "La mia lista" row. The calendar's plugin chips narrow it to
// one plugin (remembered per profile), in the side menu's order.

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {Text} from '../components/Text';
import {TVFocusGuideView, useKeplerBackHandler} from '@amazon-devices/react-native-kepler';
import {FocusButton} from '../components/FocusButton';
import {PluginChips} from '../components/FilterChip';
import {mycelium} from '../core/api';
import {focusSoon} from '../core/focus';
import {myListCatalogItem, useMyList} from '../core/myList';
import * as perf from '../core/perf';
import {pluginChoices, readMyListFilter, saveMyListFilter} from '../core/pluginFilter';
import {SquareBackButton} from '../components/SquareBackButton';
import {colors, scaledStyles} from '../theme';
import type {HomeLayout} from './layout';
import {CardModel, catalogCard} from './model';
import {PosterGrid} from './PosterGrid';

const H_PAD = 48 / 1920;
const V_PAD = 28 / 1080;

export function MyListScreen({
  L,
  covered,
  pluginNames,
  pluginOrder,
  hiddenPlugins,
  onClose,
  onOpenItem,
  onCardMenu,
}: {
  L: HomeLayout;
  /** A page or popup is on top: Back and focus belong to it. */
  covered: boolean;
  /** plugin id → its name, for the chips. */
  pluginNames: Record<string, string>;
  /** The side menu's plugins, in its order. */
  pluginOrder: string[];
  /** Hidden from the side menu: hidden here too. */
  hiddenPlugins: Set<string>;
  onClose: () => void;
  onOpenItem: (card: CardModel) => void;
  onCardMenu: (card: CardModel) => void;
}) {
  useEffect(() => perf.enterScreen('mylist'), []);
  const {W, H} = L;
  const keplerBack = useKeplerBackHandler();
  const s = H / 1080;
  const {items} = useMyList();
  const profileId = mycelium.creds.profileId;
  const [chosen, setChosen] = useState('');
  useEffect(() => {
    let alive = true;
    readMyListFilter(profileId).then(p => alive && setChosen(p));
    return () => {
      alive = false;
    };
  }, [profileId]);
  const choose = (p: string) => {
    setChosen(p);
    saveMyListFilter(profileId, p);
  };
  // Hidden from the side menu since it was chosen: "Tutti".
  const plugin = hiddenPlugins.has(chosen) ? '' : chosen;
  const choices = useMemo(
    () =>
      pluginChoices(
        items.map(i => i.pluginId),
        pluginOrder,
        hiddenPlugins,
        plugin,
      ),
    [items, pluginOrder, hiddenPlugins, plugin],
  );
  const chips = choices.length > 1 || !!plugin;
  const name = (id: string) => pluginNames[id] || id;
  const cards = useMemo(
    () =>
      items
        .filter(i => !hiddenPlugins.has(i.pluginId) && (!plugin || i.pluginId === plugin))
        .map(i => catalogCard(i.pluginId, myListCatalogItem(i), 'poster')),
    [items, hiddenPlugins, plugin],
  );
  const last = useRef(0);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const sub = keplerBack.addEventListener('hardwareBackPress', () => {
      if (covered) {
        return false;
      }
      onCloseRef.current();
      return true;
    });
    return () => sub.remove();
  }, [covered, keplerBack]);

  // Focus: the first title on open, the one that was open when a page on
  // top closes (a removed one falls back to its neighbour).
  const [token, setToken] = useState(1);
  const wasCovered = useRef(covered);
  useEffect(() => {
    if (wasCovered.current && !covered) {
      setToken(t => t + 1);
    }
    wasCovered.current = covered;
  }, [covered]);

  const backRef = useRef<View>(null);
  const chipRef = useRef<View>(null);
  const isEmpty = cards.length === 0;
  // A plugin with nothing saved: focus stays on its chip.
  const filteredEmpty = isEmpty && !!plugin;
  useEffect(
    () => (isEmpty && !covered ? focusSoon(() => (filteredEmpty ? chipRef.current : backRef.current)) : undefined),
    [isEmpty, filteredEmpty, covered, token],
  );
  // A new choice: the grid from its first title.
  const firstChoice = useRef(true);
  useEffect(() => {
    if (firstChoice.current) {
      firstChoice.current = false;
      return;
    }
    last.current = 0;
  }, [plugin]);

  const hPad = W * H_PAD;
  const vPad = H * V_PAD;
  const chipsH = chips ? 64 * s : 0;
  const headerH = vPad + H * 0.06 + chipsH;
  const listH = H - headerH;

  return (
    <TVFocusGuideView style={styles.root} trapFocusLeft trapFocusRight trapFocusUp trapFocusDown>
      <View style={[styles.header, {paddingHorizontal: hPad, paddingTop: vPad, marginBottom: H * 0.014}]}>
        <SquareBackButton s={s} onPress={onClose} />
        <Text style={[styles.heading, {fontSize: H * 0.026, marginLeft: W * 0.01}]} numberOfLines={1}>
          La mia lista
        </Text>
      </View>
      {chips ? (
        <View style={[styles.chips, {paddingHorizontal: hPad, height: chipsH}]}>
          <PluginChips s={s} plugin={plugin} choices={choices} name={name} onPlugin={choose} selectedRef={chipRef} />
        </View>
      ) : null}
      {filteredEmpty ? (
        <View style={styles.center}>
          <Text style={styles.message}>Nessun titolo salvato da {name(plugin)}.</Text>
        </View>
      ) : isEmpty ? (
        <View style={styles.center}>
          <Text style={styles.title}>La tua lista è vuota</Text>
          <Text style={styles.message}>
            Tieni premuto OK su un film o una serie, o usa «La mia lista» nella sua pagina, per salvarlo qui.
          </Text>
          <View style={styles.actions}>
            <FocusButton ref={backRef} label="Indietro" onPress={onClose} />
          </View>
        </View>
      ) : (
        <View style={styles.flex}>
          <PosterGrid
            cards={cards}
            W={W}
            H={H}
            hPad={hPad}
            listH={listH}
            focus={{index: Math.min(last.current, cards.length - 1), token}}
            onFocusItem={i => {
              last.current = i;
            }}
            onPressItem={i => cards[i] && onOpenItem(cards[i])}
            onLongPressItem={i => cards[i] && onCardMenu(cards[i])}
          />
        </View>
      )}
    </TVFocusGuideView>
  );
}

const styles = scaledStyles({
  root: {...StyleSheet.absoluteFillObject, backgroundColor: '#000'},
  flex: {flex: 1},
  header: {flexDirection: 'row', alignItems: 'center'},
  chips: {flexDirection: 'row', alignItems: 'flex-start'},
  heading: {flex: 1, color: '#fff', fontWeight: '700'},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 64},
  title: {color: colors.textHigh, fontSize: 36, fontWeight: '700', textAlign: 'center'},
  message: {color: colors.textMid, fontSize: 24, marginTop: 16, textAlign: 'center', maxWidth: 1100},
  actions: {flexDirection: 'row', gap: 24, marginTop: 40},
});
