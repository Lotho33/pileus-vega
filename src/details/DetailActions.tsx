// The details page's secondary chips after Play/Scarica (details_actions.dart):
// "La mia lista" (hidden on a server without it) and "Trailer" (only with a
// trailer_url). Each may be missing; the D-pad moves on to the next one.

import React from 'react';
import {myList, myListItemFromDetails, myListMessage, useMyList} from '../core/myList';
import {openTrailer, TRAILER_UNAVAILABLE} from '../core/trailer';
import type {CatalogItem, DetailsResponse} from '../gen/media';
import {ActionChip} from './Sources';

export function MyListChip({
  s,
  pluginId,
  item,
  details,
  mediaType,
  onToast,
  onFocusChange,
}: {
  s: number;
  pluginId: string;
  item: CatalogItem;
  /** What the page loaded: the plot, genres, fanart, logo a saved card shows. */
  details: DetailsResponse | null | undefined;
  mediaType: 'movie' | 'series';
  onToast: (text: string) => void;
  onFocusChange?: (focused: boolean) => void;
}) {
  const {supported, items} = useMyList();
  if (!supported) {
    return null;
  }
  const saved = items.some(i => i.pluginId === pluginId && i.mediaId === item.id);
  return (
    <ActionChip
      s={s}
      icon={saved ? 'check' : 'add'}
      label={saved ? 'Nella mia lista' : 'La mia lista'}
      onFocusChange={onFocusChange}
      onPress={() =>
        myList
          .toggle(myListItemFromDetails(pluginId, item, details, mediaType))
          .then(r => onToast(myListMessage(r)))
      }
    />
  );
}

export function TrailerChip({
  s,
  url,
  onToast,
  onFocusChange,
}: {
  s: number;
  url: string;
  onToast: (text: string) => void;
  onFocusChange?: (focused: boolean) => void;
}) {
  if (!url.trim()) {
    return null;
  }
  return (
    <ActionChip
      s={s}
      icon="movie"
      label="Trailer"
      onFocusChange={onFocusChange}
      onPress={() =>
        openTrailer(url).then(ok => {
          if (!ok) {
            onToast(TRAILER_UNAVAILABLE);
          }
        })
      }
    />
  );
}
