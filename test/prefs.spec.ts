jest.mock('@amazon-devices/react-native-async-storage__async-storage', () => ({}));

import {PluginInfo, CatalogDef} from '../src/gen/media';
import {
  applyCatalogPrefs,
  applyPluginPrefs,
  argbToCss,
  isPluginReady,
  parsePluginPrefs,
  parseSubtitleStyle,
  writePluginPrefs,
  writeSubtitleStyle,
} from '../src/core/prefs';
import {logoRenderSize, logoUrlOnly, logoDark} from '../src/core/logo';
import {cwCard} from '../src/home/model';
import {ContinueWatchingItem} from '../src/gen/media';

const plugin = (id: string) => PluginInfo.fromPartial({pluginId: id, catalogs: [{id: 'c'}]});

describe('plugin prefs', () => {
  const prefs = parsePluginPrefs(
    JSON.stringify({
      v: 1,
      plugins: {
        order: ['b', 'a'],
        hiddenPlugins: ['c'],
        catalogs: {a: {order: ['y'], hidden: ['z']}},
      },
    }),
  );

  it('orders and hides plugins, unknown ids keep server order after', () => {
    const out = applyPluginPrefs(['a', 'c', 'd', 'b'].map(plugin), prefs);
    expect(out.map(p => p.pluginId)).toEqual(['b', 'a', 'd']);
  });

  it('orders and hides catalogs per plugin', () => {
    const defs = ['x', 'y', 'z'].map(id => CatalogDef.fromPartial({id}));
    expect(applyCatalogPrefs('a', defs, prefs).map(d => d.id)).toEqual(['y', 'x']);
    expect(applyCatalogPrefs('other', defs, prefs)).toBe(defs);
  });

  it('tolerates garbage', () => {
    expect(parsePluginPrefs('not json').order).toEqual([]);
    expect(parsePluginPrefs('').hidden.size).toBe(0);
  });

  it('readiness gate', () => {
    expect(isPluginReady(plugin('a'))).toBe(true);
    expect(isPluginReady(PluginInfo.fromPartial({catalogs: [{id: 'c'}], statusLabel: 'syncing'}))).toBe(false);
    expect(isPluginReady(PluginInfo.fromPartial({}))).toBe(false);
  });
});

describe('logo helpers', () => {
  it('parses the 4-part encoding, urls with pipes included', () => {
    expect(logoUrlOnly('https://x/a|b.png|800|200|1')).toBe('https://x/a|b.png');
    expect(logoDark('https://x/a.png|800|200|1')).toBe(true);
    expect(logoRenderSize('u|800|200|0', 400, 300, 400)).toEqual({w: 400, h: 100});
  });
});

describe('cwCard', () => {
  it('uses the show name for the hero and overline', () => {
    const c = cwCard(
      ContinueWatchingItem.fromPartial({
        pluginId: 'p',
        mediaId: 'm',
        title: 'Episodio 5',
        navigationContext: 'Serie',
        seasonNumber: 2,
        episodeNumber: 5,
        progressTime: 600,
        totalTime: 1200,
      }),
    );
    expect(c.overline).toBe('Serie · S2 · E5');
    expect(c.hero.title).toBe('Serie');
    expect(c.progress).toBe(0.5);
    expect(c.progressLabel).toBe('10:00 · 10 min rimanenti');
  });
});

describe('writePluginPrefs', () => {
  it('replaces the plugins block and keeps the rest', () => {
    const src = JSON.stringify({v: 1, subtitles: {fontSize: 30}, future: {x: 1}, plugins: {order: ['a'], extra: true}});
    const out = JSON.parse(
      writePluginPrefs(src, {order: ['b', 'a'], hidden: new Set(['c']), catalogs: {a: {order: [], hidden: new Set(['k'])}}}),
    );
    expect(out.subtitles).toEqual({fontSize: 30});
    expect(out.future).toEqual({x: 1});
    expect(out.plugins).toEqual({extra: true, order: ['b', 'a'], hiddenPlugins: ['c'], catalogs: {a: {hidden: ['k']}}});
  });

  it('round-trips through parsePluginPrefs and drops an empty block', () => {
    const prefs = parsePluginPrefs(writePluginPrefs('', {order: ['x'], hidden: new Set(), catalogs: {}}));
    expect(prefs.order).toEqual(['x']);
    expect(JSON.parse(writePluginPrefs('{"plugins":{"order":["x"]}}', {order: [], hidden: new Set(), catalogs: {}}))).toEqual({v: 1});
  });
});

describe('subtitle style', () => {
  it('reads Flutter defaults and values, writes keeping other blocks', () => {
    expect(parseSubtitleStyle('')).toEqual({fontSize: 32, colorArgb: 0xffffffff, bgEnabled: true, bottomPadding: 80});
    const src = JSON.stringify({v: 1, plugins: {order: ['a']}, subtitles: {fontSize: 40, colorArgb: 0xffffeb3b, bgEnabled: false}});
    const st = parseSubtitleStyle(src);
    expect(st).toEqual({fontSize: 40, colorArgb: 0xffffeb3b, bgEnabled: false, bottomPadding: 80});
    const out = JSON.parse(writeSubtitleStyle(src, {...st, bottomPadding: 120}));
    expect(out.plugins).toEqual({order: ['a']});
    expect(out.subtitles.bottomPadding).toBe(120);
    expect(argbToCss(0xffffeb3b)).toBe('rgba(255,235,59,1.000)');
  });
});

import {moveItem} from '../src/settings/reorder';
describe('moveItem', () => {
  it('moves one step and clamps at the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    const same = ['a', 'b'];
    expect(moveItem(same, 0, -1)).toBe(same);
  });
});
