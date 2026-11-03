// Footer row of the details pages (related_carousel.dart): two sources,
// CORRELATI (extra.related) and SIMILI (extra.similar), one shown at a time.
// With both, ↓ on a card switches to SIMILI and ↑ back to CORRELATI; the
// little arrows by the title say which way is available.

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Text, View} from 'react-native';
import {TVFocusGuideView, useTVEventHandler} from '@amazon-devices/react-native-kepler';
import {useFocusGate} from '../core/focus';
import {captionBlock, CarouselRow} from '../home/CarouselRow';
import type {HomeLayout} from '../home/layout';
import type {CardModel} from '../home/model';
import {colors, scaledStyles} from '../theme';
import {RelatedEntry, relLabel} from './format';

export function relatedCards(pluginId: string, entries: RelatedEntry[]): CardModel[] {
  return entries.map(e => ({
    key: `rel:${pluginId}:${e.id}`,
    open: {pluginId, mediaId: e.id, mediaType: '', isDir: false, title: e.title},
    title: e.title,
    image: e.poster,
    overline: '',
    progress: 0,
    progressLabel: '',
    badge: relLabel(e.rel).toUpperCase(),
    hero: {key: e.id, title: e.title, logo: '', year: 0, rating: 0, genres: [], plot: '', background: ''},
  }));
}

export function RelatedRow({
  pluginId,
  lists,
  L,
  cardH,
  hPad,
  onOpen,
  covered,
  refocus = 0,
}: {
  /** A new token puts focus back on the last focused card (popup closed). */
  refocus?: number;
  /** Something is over the page (popup, player). */
  covered: boolean;
  pluginId: string;
  lists: {related: RelatedEntry[]; similar: RelatedEntry[]};
  /** Home layout, resized so the posters are `cardH` tall. */
  L: HomeLayout;
  cardH: number;
  hPad: number;
  onOpen: (card: CardModel) => void;
}) {
  const both = lists.related.length > 0 && lists.similar.length > 0;
  const [idx, setIdx] = useState(lists.related.length ? 0 : 1);
  const [switched, setSwitched] = useState(false);
  // While CORRELATI ⇄ SIMILI swaps rows, the guide's autoFocus is off: it
  // sent focus back to the card it remembered, which had just unmounted, and
  // focus was lost (no way back into the row either). On again once the new
  // row has focus.
  const [swapping, setSwapping] = useState(false);
  const active = idx === 0 ? lists.related : lists.similar;
  const cards = useMemo(() => relatedCards(pluginId, active), [pluginId, active]);
  // Flutter: titleFs = clamp(16.2/1080 of the height, 13, 26); the poster
  // takes what the two title lines leave of the card height.
  const captionFs = Math.min(26, Math.max(13, L.H * (16.2 / 1080)));
  const rowL = useMemo(() => {
    const posterH = Math.max(1, cardH - captionBlock(captionFs));
    return {...L, hPad, posterH, posterW: posterH / 1.5, gap: L.gap * 0.8};
  }, [L, cardH, hPad, captionFs]);

  // Whether a card of this row has focus, from the cards' own focus/blur.
  const inRow = useRef(false);
  // The ↓ that brings focus into the row can reach this handler after the
  // card's focus event, and then switched straight to SIMILI.
  const enteredAt = useRef(0);
  const lastIndex = useRef(0);
  const focusRequest = useMemo(
    () => (refocus ? {index: lastIndex.current, token: refocus} : null),
    [refocus],
  );
  const gate = useFocusGate(covered);
  // Fallback if the new row never reports focus.
  useEffect(() => {
    if (!swapping) {
      return;
    }
    const t = setTimeout(() => setSwapping(false), 800);
    return () => clearTimeout(t);
  }, [swapping]);
  useTVEventHandler(evt => {
    if (!both || !inRow.current || gate() || evt.eventKeyAction === 1 || Date.now() - enteredAt.current < ENTRY_KEY_MS) {
      return;
    }
    if (evt.eventType === 'down' && idx === 0) {
      setSwapping(true);
      setIdx(1);
      setSwitched(true);
    } else if (evt.eventType === 'up' && idx === 1) {
      setSwapping(true);
      setIdx(0);
      setSwitched(true);
    }
  });

  if (!cards.length) {
    return null;
  }
  const fs = Math.min(42, Math.max(23, L.H * (32.5 / 1080)));
  return (
    // ↓ never leaves the row; on SIMILI ↑ stays too (it switches back).
    // autoFocus: a ↓ from the buttons above reaches the row even when no
    // card sits straight under them.
    <TVFocusGuideView autoFocus={!swapping} trapFocusDown trapFocusUp={idx === 1}>
      <View style={[styles.header, {paddingHorizontal: hPad}]}>
        <Text style={[styles.title, {fontSize: fs}]}>{idx === 0 ? 'CORRELATI' : 'SIMILI'}</Text>
        {both ? (
          <View style={styles.arrows}>
            <Text style={[styles.arrow, idx > 0 && styles.arrowOn]}>▲</Text>
            <Text style={[styles.arrow, idx < 1 && styles.arrowOn]}>▼</Text>
          </View>
        ) : null}
      </View>
      <CarouselRow
        key={idx}
        cards={cards}
        variant="poster"
        L={rowL}
        isInactive={gate}
        takeFocus={switched}
        captionFs={captionFs}
        focusRequest={focusRequest}
        onFocusCard={i => {
          if (!inRow.current) {
            enteredAt.current = Date.now();
          }
          inRow.current = true;
          if (swapping) {
            setSwapping(false);
          }
          lastIndex.current = i;
        }}
        onBlurCard={() => {
          inRow.current = false;
        }}
        onPressCard={i => cards[i] && onOpen(cards[i])}
      />
    </TVFocusGuideView>
  );
}

/** A ↑/↓ this soon after focus came into the row is the one that brought it. */
const ENTRY_KEY_MS = 150;

const styles = scaledStyles({
  header: {flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8},
  title: {color: colors.textHigh, fontWeight: '700', letterSpacing: 0.5},
  arrows: {alignItems: 'center'},
  arrow: {color: 'rgba(255,255,255,0.24)', fontSize: 12, lineHeight: 14},
  arrowOn: {color: 'rgba(255,255,255,0.54)'},
});
