// Rows that page by themselves (pileus-player's features/media/paging.dart):
// no "Carica altri" to press — the next page is asked for while focus is
// still a few cards from the end, so it's usually in before the user gets
// there. A failed request isn't retried by itself (that would loop): the
// row ends in "Riprova" instead.

/** How many cards before the end of what's loaded the next page is asked for. */
export const LOAD_AHEAD_ITEMS = 5;

/** A home row stops growing past this many cards; longer lists are for search. */
export const HOME_ROW_MAX_ITEMS = 60;

export interface PageState {
  count: number;
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
}

/** The row still ends in a trailing slot: loading, "Riprova", or more to ask for. */
export const showsMoreSlot = (s: PageState, cap?: number) => s.hasMore && (cap === undefined || s.count < cap);

/** Focus reached card `index`: ask for the next page now? */
export const shouldLoadMore = (s: PageState, index: number, cap?: number) =>
  showsMoreSlot(s, cap) && !s.loading && !s.failed && index >= s.count - LOAD_AHEAD_ITEMS;
