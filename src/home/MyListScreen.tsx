// "La mia lista" page (my_list_screen.dart): the profile's saved titles of
// every plugin in one poster grid, most recently added first (the server's
// order). OK opens a title as the home does; holding OK opens the card menu
// (which can take it off the list). Opened from the side nav only — the
// home has no "La mia lista" row.

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {TVFocusGuideView, useKeplerBackHandler} from '@amazon-devices/react-native-kepler';
import {FocusButton} from '../components/FocusButton';
import {focusSoon} from '../core/focus';
import {myListCatalogItem, useMyList} from '../core/myList';
import * as perf from '../core/perf';
import {BackButton} from '../details/common';
import {colors, scaledStyles} from '../theme';
import type {HomeLayout} from './layout';
import {CardModel, catalogCard} from './model';
import {PosterGrid} from './PosterGrid';

const H_PAD = 48 / 1920;
const V_PAD = 28 / 1080;

export function MyListScreen({
  L,
  covered,
  onClose,
  onOpenItem,
  onCardMenu,
}: {
  L: HomeLayout;
  /** A page or popup is on top: Back and focus belong to it. */
  covered: boolean;
  onClose: () => void;
  onOpenItem: (card: CardModel) => void;
  onCardMenu: (card: CardModel) => void;
}) {
  useEffect(() => perf.enterScreen('mylist'), []);
  const {W, H} = L;
  const keplerBack = useKeplerBackHandler();
  const {items} = useMyList();
  const cards = useMemo(
    () => items.map(i => catalogCard(i.pluginId, myListCatalogItem(i), 'poster')),
    [items],
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
  const isEmpty = cards.length === 0;
  useEffect(() => (isEmpty && !covered ? focusSoon(() => backRef.current) : undefined), [isEmpty, covered, token]);

  const hPad = W * H_PAD;
  const vPad = H * V_PAD;
  const headerH = vPad + H * 0.06;
  const listH = H - headerH;

  return (
    <TVFocusGuideView style={styles.root} trapFocusLeft trapFocusRight trapFocusUp trapFocusDown>
      <View style={[styles.header, {paddingHorizontal: hPad, paddingTop: vPad, marginBottom: H * 0.014}]}>
        <BackButton s={H / 1080} onPress={onClose} />
        <Text style={[styles.heading, {fontSize: H * 0.026, marginLeft: W * 0.01}]} numberOfLines={1}>
          La mia lista
        </Text>
      </View>
      {isEmpty ? (
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
  heading: {flex: 1, color: '#fff', fontWeight: '700'},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 64},
  title: {color: colors.textHigh, fontSize: 36, fontWeight: '700', textAlign: 'center'},
  message: {color: colors.textMid, fontSize: 24, marginTop: 16, textAlign: 'center', maxWidth: 1100},
  actions: {flexDirection: 'row', gap: 24, marginTop: 40},
});
