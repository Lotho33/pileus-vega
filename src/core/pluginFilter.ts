// The "one plugin" filter of Calendario and La mia lista
// (pileus-player's plugin_filter.dart): the plugins as the side menu shows
// them — in the profile's order, without the hidden ones (neither as a
// choice nor among "Tutti").

import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';

/**
 * The choices for `present` (the plugins with something to show) and the
 * `remembered` one (kept even with nothing to show): no hidden plugin, in
 * the side menu's `order`, the ones it doesn't know last by id.
 */
export function pluginChoices(
  present: Iterable<string>,
  order: string[],
  hidden: Set<string>,
  remembered = '',
): string[] {
  const ids = new Set(present);
  if (remembered) {
    ids.add(remembered);
  }
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...ids]
    .filter(id => !hidden.has(id))
    .sort((a, b) => {
      const ra = rank.get(a);
      const rb = rank.get(b);
      if (ra !== undefined && rb !== undefined) {
        return ra - rb;
      }
      if (ra !== undefined) {
        return -1;
      }
      if (rb !== undefined) {
        return 1;
      }
      return a < b ? -1 : a > b ? 1 : 0;
    });
}

// La mia lista's choice, remembered per profile like the calendar's.
const myListKey = (profileId: string) => `pileus.mylist.plugin:${profileId}`;

export async function readMyListFilter(profileId: string): Promise<string> {
  try {
    return (await AsyncStorage.getItem(myListKey(profileId))) ?? '';
  } catch {
    return '';
  }
}

export function saveMyListFilter(profileId: string, plugin: string): void {
  AsyncStorage.setItem(myListKey(profileId), plugin).catch(() => {});
}
