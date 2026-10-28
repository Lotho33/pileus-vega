import {
  HOME_ROW_MAX_ITEMS,
  shouldLoadMore,
  showsMoreSlot,
} from '../src/core/paging';

describe('paging', () => {
  const s = {count: 20, hasMore: true, loading: false, failed: false};

  it('asks for the next page 5 cards from the end, once', () => {
    expect(shouldLoadMore(s, 14)).toBe(false);
    expect(shouldLoadMore(s, 15)).toBe(true);
    expect(shouldLoadMore(s, 20)).toBe(true); // the trailing slot itself
    expect(shouldLoadMore({...s, loading: true}, 19)).toBe(false);
  });

  it('a failure waits for "Riprova"', () => {
    expect(shouldLoadMore({...s, failed: true}, 19)).toBe(false);
    expect(showsMoreSlot({...s, failed: true})).toBe(true);
  });

  it('home rows stop at the cap; the last page ends the row', () => {
    const full = {...s, count: HOME_ROW_MAX_ITEMS};
    expect(showsMoreSlot(full, HOME_ROW_MAX_ITEMS)).toBe(false);
    expect(
      shouldLoadMore(full, HOME_ROW_MAX_ITEMS - 1, HOME_ROW_MAX_ITEMS),
    ).toBe(false);
    expect(showsMoreSlot({...s, hasMore: false})).toBe(false);
  });
});
