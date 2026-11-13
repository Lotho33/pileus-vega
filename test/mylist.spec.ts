import {GrpcError, GrpcStatus} from '../src/core/grpcWeb';
import {
  canSave,
  myListCatalogItem,
  myListItemFrom,
  myListItemFromDetails,
  myListMessage,
  MyListStore,
} from '../src/core/myList';
import {CatalogItem, DetailsResponse, LogoMeta, MyListItem} from '../src/gen/media';

const entry = (mediaId: string, pluginId = 'pl') => MyListItem.fromPartial({pluginId, mediaId, title: mediaId});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

function setup(initial: MyListItem[] = []) {
  let profile = 'p1';
  const api = {
    getMyList: jest.fn(async () => initial),
    setMyListItem: jest.fn(async () => ({ok: true})),
  };
  const store = new MyListStore(api, () => profile);
  return {store, api, setProfile: (p: string) => (profile = p)};
}

describe('La mia lista store', () => {
  it('loads the active profile list', async () => {
    const {store} = setup([entry('a'), entry('b')]);
    await store.refresh();
    expect(store.snapshot().items.map(i => i.mediaId)).toEqual(['a', 'b']);
    expect(store.contains('pl', 'a')).toBe(true);
    expect(store.contains('other', 'a')).toBe(false);
  });

  it('adds at the top and removes, optimistically', async () => {
    const {store, api} = setup([entry('a')]);
    await store.refresh();
    const seen: string[][] = [];
    store.subscribe(() => seen.push(store.snapshot().items.map(i => i.mediaId)));
    expect(await store.toggle(entry('b'))).toBe(true);
    expect(seen[0]).toEqual(['b', 'a']);
    expect(api.setMyListItem).toHaveBeenLastCalledWith(expect.objectContaining({mediaId: 'b'}), true);
    expect(await store.toggle(entry('a'))).toBe(false);
    expect(store.snapshot().items.map(i => i.mediaId)).toEqual(['b']);
    expect(api.setMyListItem).toHaveBeenLastCalledWith(expect.objectContaining({mediaId: 'a'}), false);
  });

  it('rolls back when the server refuses', async () => {
    const {store, api} = setup([entry('a')]);
    await store.refresh();
    api.setMyListItem.mockRejectedValueOnce(new GrpcError(GrpcStatus.UNAVAILABLE, 'down'));
    expect(await store.toggle(entry('b'))).toBeNull();
    expect(store.snapshot().items.map(i => i.mediaId)).toEqual(['a']);
    expect(store.snapshot().supported).toBe(true);
  });

  it('turns the feature off on UNIMPLEMENTED', async () => {
    const {store, api} = setup();
    api.getMyList.mockRejectedValueOnce(new GrpcError(GrpcStatus.UNIMPLEMENTED, 'no'));
    await store.refresh();
    expect(store.snapshot().supported).toBe(false);
    // A later answer (another server) turns it back on.
    await store.refresh();
    expect(store.snapshot().supported).toBe(true);
  });

  it('keeps a failed load from hiding the feature', async () => {
    const {store, api} = setup();
    api.getMyList.mockRejectedValueOnce(new GrpcError(GrpcStatus.UNAVAILABLE, 'down'));
    await store.refresh();
    expect(store.snapshot().supported).toBe(true);
  });

  it('never shows a list on another profile', async () => {
    const {store, setProfile} = setup([entry('a')]);
    await store.refresh();
    setProfile('p2');
    expect(store.snapshot().items).toEqual([]);
    expect(store.contains('pl', 'a')).toBe(false);
  });

  it("binds the load to the profile: the previous one's can't stand in", async () => {
    const {store, api, setProfile} = setup();
    const first = deferred<MyListItem[]>();
    const second = deferred<MyListItem[]>();
    api.getMyList.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = store.refresh();
    // Same profile: shares the request.
    expect(store.refresh()).toBe(a);
    setProfile('p2');
    const b = store.refresh();
    expect(b).not.toBe(a);
    expect(api.getMyList).toHaveBeenCalledTimes(2);
    first.resolve([entry('old')]);
    await a;
    expect(store.snapshot().items).toEqual([]);
    second.resolve([entry('new')]);
    await b;
    expect(store.snapshot().items.map(i => i.mediaId)).toEqual(['new']);
  });

  it('needs a profile to change anything', async () => {
    const {store, api, setProfile} = setup();
    setProfile('');
    expect(await store.toggle(entry('a'))).toBeNull();
    expect(api.setMyListItem).not.toHaveBeenCalled();
  });
});

describe('La mia lista entries', () => {
  const meta = LogoMeta.fromPartial({width: 400, height: 100, coverage: 0.5});
  const item = CatalogItem.fromPartial({
    id: 'm1',
    title: 'Film',
    mediaType: 'movie',
    posterUrl: 'p.jpg',
    year: 2020,
    rating: 7.5,
    logoUrl: 'logo.png',
    logoMeta: meta,
    extra: {cover_url: 'c.jpg', fanart_url: 'f.jpg', anilist_id: '9'},
  });

  it('keeps the card fields and the extra keys', () => {
    const e = myListItemFrom('pl', item);
    expect(e).toMatchObject({pluginId: 'pl', mediaId: 'm1', title: 'Film', mediaType: 'movie', year: 2020});
    expect(e.extra).toEqual({cover_url: 'c.jpg', fanart_url: 'f.jpg', anilist_id: '9'});
    expect(e.fanartUrl).toBe('f.jpg');
    expect(e.logoMeta).toEqual(meta);
  });

  it('takes plot, genres, fanart and logo from the details', () => {
    const d = DetailsResponse.fromPartial({
      movie: {plot: 'Trama', genres: ['Azione', 'Drama'], fanartUrl: 'big.jpg', logoUrl: 'other.png', year: 2021},
    });
    const e = myListItemFromDetails('pl', {...item, year: 0}, d, 'movie');
    expect(e.extra.plot).toBe('Trama');
    expect(e.extra.genres).toBe('Azione, Drama');
    expect(e.fanartUrl).toBe('big.jpg');
    expect(e.logoUrl).toBe('other.png');
    // The catalog item's measurements were of another logo.
    expect(e.logoMeta).toBeUndefined();
    expect(e.year).toBe(2021);
  });

  it('turns back into a catalog card', () => {
    const c = myListCatalogItem(myListItemFrom('pl', {...item, mediaType: 'series'}));
    expect(c).toMatchObject({id: 'm1', mediaType: 'series', isDir: true, logoUrl: 'logo.png'});
    expect(c.extra.fanart_url).toBe('f.jpg');
  });

  it('saves only series and films, and says what happened', () => {
    expect(canSave('series')).toBe(true);
    expect(canSave('movie')).toBe(true);
    expect(canSave('episode')).toBe(false);
    expect(canSave('live')).toBe(false);
    expect(myListMessage(true)).toBe('Aggiunto a La mia lista');
    expect(myListMessage(false)).toBe('Rimosso da La mia lista');
    expect(myListMessage(null)).toMatch(/Non è stato possibile/);
  });
});
