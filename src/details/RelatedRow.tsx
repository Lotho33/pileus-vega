// Footer row of the details pages (related_carousel.dart): two sources,
// CORRELATI (extra.related) and SIMILI (extra.similar), one shown at a time.
// With both, ↓ on a card switches to SIMILI and ↑ back to CORRELATI; the
// little arrows by the title say which way is available.

import React, {useMemo, useRef, useState} from 'react';
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
  const lastIndex = useRef(0);
  const focusRequest = useMemo(
    () => (refocus ? {index: lastIndex.current, token: refocus} : null),
    [refocus],
  );
  const gate = useFocusGate(covered);
  useTVEventHandler(evt => {
    if (!both || !inRow.current || gate() || evt.eventKeyAction === 1) {
      return;
    }
    if (evt.eventType === 'down' && idx === 0) {
      setIdx(1);
      setSwitched(true);
    } else if (evt.eventType === 'up' && idx === 1) {
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
    <TVFocusGuideView trapFocusDown trapFocusUp={idx === 1}>
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
          inRow.current = true;
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

const styles = scaledStyles({
  header: {flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8},
  title: {color: colors.textHigh, fontWeight: '700', letterSpacing: 0.5},
  arrows: {alignItems: 'center'},
  arrow: {color: 'rgba(255,255,255,0.24)', fontSize: 12, lineHeight: 14},
  arrowOn: {color: 'rgba(255,255,255,0.54)'},
});
