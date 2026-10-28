// Home shell: loads plugins + continue watching, applies the profile's
// plugin/catalog prefs, and hosts the side nav over the active plugin page.
// Details pages stack on top of it (and of the full search); only the top
// one is mounted.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {useKeplerBackHandler, useTVEventHandler} from '@amazon-devices/react-native-kepler';
import {DetailsScreen} from '../details/DetailsScreen';
import {LivePopup} from '../details/LivePopup';
import {pluginSupportsDownload} from '../downloads/format';
import {PlayerScreen} from '../player/PlayerScreen';
import {emptyRequest, PlayRequest, requestFromCw} from '../player/session';
import {ContextMenu, MenuAction} from '../components/ContextMenu';
import {FocusButton} from '../components/FocusButton';
import {InfoPopup} from '../details/InfoPopup';
import {mycelium} from '../core/api';
import {applyCatalogPrefs, applyPluginPrefs, isPluginReady, parsePluginPrefs} from '../core/prefs';
import type {CatalogDef, ContinueWatchingItem, PluginInfo} from '../gen/media';
import {useHomeLayout} from '../home/layout';
import {PluginHome} from '../home/PluginHome';
import type {CardModel, OpenTarget} from '../home/model';
import {PluginNav} from '../home/PluginNav';
import {QuickSearch} from '../home/QuickSearch';
import {errorText, useAuth} from '../state/auth';
import {SearchScreen} from '../search/SearchScreen';
import {SettingsScreen} from './SettingsScreen';
import {colors, font, scaledStyles, space} from '../theme';

// Back at the root only exits on a second press within this window, like
// home_view.dart's _handleRootBack.
const EXIT_CONFIRM_MS = 2000;
// A panel closing unmounts first, then focus goes back to the row: an
// explicit focus can't leave a still-mounted focus trap. The card the native
// engine picks meanwhile is ignored by the row (useFocusGate).
const REFOCUS_AFTER_HIDE_MS = 50;

function NotReady({plugin}: {plugin: PluginInfo}) {
  const text = plugin.needsConfig
    ? 'Questo plugin va configurato dalle impostazioni.'
    : plugin.statusLabel === 'syncing'
    ? `Sincronizzazione in corso…${plugin.statusDetail ? `\n${plugin.statusDetail}` : ''}`
    : plugin.statusLabel === 'error'
    ? `Errore plugin${plugin.statusDetail ? `: ${plugin.statusDetail}` : ''}`
    : 'Nessun catalogo disponibile.';
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{plugin.name || plugin.pluginId}</Text>
      <Text style={styles.message}>{text}</Text>
    </View>
  );
}

/** "Show · Episode" for a CW episode, else the card's title. */
function menuTitle(card: CardModel): string {
  const show = card.open.cw?.navigationContext ?? '';
  return show && show.toLowerCase() !== card.title.toLowerCase() ? `${show} · ${card.title}` : card.title;
}

export function HomeScreen() {
  const {profile, exitProfile} = useAuth();
  const L = useHomeLayout();
  const keplerBack = useKeplerBackHandler();
  const [plugins, setPlugins] = useState<PluginInfo[] | null>(null);
  const [cw, setCw] = useState<ContinueWatchingItem[]>([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [refocus, setRefocus] = useState({token: 0, restore: false});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backFromSettings, setBackFromSettings] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [fullSearch, setFullSearch] = useState<{query: string} | null>(null);
  const [stack, setStack] = useState<OpenTarget[]>([]);
  const [player, setPlayer] = useState<PlayRequest | null>(null);
  const [live, setLive] = useState<OpenTarget | null>(null);
  const [detailsRefocus, setDetailsRefocus] = useState(0);
  const [settingsRefocus, setSettingsRefocus] = useState(0);
  const [toast, setToast] = useState('');
  const [menu, setMenu] = useState<{card: CardModel; def?: CatalogDef} | null>(null);
  const [info, setInfo] = useState<CardModel | null>(null);
  const lastBack = useRef(0);

  const prefs = useMemo(() => parsePluginPrefs(profile?.preferencesJson ?? ''), [profile]);

  const load = useCallback(async () => {
    setError('');
    setPlugins(null);
    try {
      const [list, items] = await Promise.all([
        mycelium.listPlugins(),
        mycelium.getContinueWatching(0).catch(() => [] as ContinueWatchingItem[]),
      ]);
      setPlugins(applyPluginPrefs(list, prefs));
      setCw(items);
    } catch (e) {
      setError(errorText(e));
      setPlugins([]);
    }
  }, [prefs]);

  useEffect(() => {
    load();
  }, [load]);

  const refocusRow = useCallback((restore: boolean, hide: () => void) => {
    hide();
    setTimeout(() => setRefocus(r => ({token: r.token + 1, restore})), REFOCUS_AFTER_HIDE_MS);
  }, []);

  const closeNav = useCallback(() => refocusRow(false, () => setNavOpen(false)), [refocusRow]);

  // Back and the X can both fire for one close.
  const searchOpenRef = useRef(false);
  searchOpenRef.current = searchOpen;
  const closeSearch = useCallback(() => {
    if (!searchOpenRef.current) {
      return;
    }
    searchOpenRef.current = false;
    refocusRow(true, () => setSearchOpen(false));
  }, [refocusRow]);

  const openFullSearch = useCallback((query: string) => {
    searchOpenRef.current = false;
    setSearchOpen(false);
    setFullSearch({query});
  }, []);

  const closeFullSearch = useCallback(() => refocusRow(true, () => setFullSearch(null)), [refocusRow]);

  // openCatalogItem in pileus-player: live events get their own popup, a
  // Continue Watching card resumes, everything else opens its details.
  const openItem = useCallback((card: CardModel) => {
    if (card.open.cw) {
      setPlayer(requestFromCw(card.open.cw));
      return;
    }
    // A live folder (a channel list) browses like any folder.
    if (card.open.mediaType === 'live' && card.open.item && !card.open.isDir) {
      setLive(card.open);
      return;
    }
    setStack(st => [...st, card.open]);
  }, []);

  const refreshCw = useCallback(() => {
    mycelium
      .getContinueWatching(0)
      .then(setCw)
      .catch(() => {});
  }, []);

  // Back from the player: the CW row picks up the new position; focus goes
  // back to whatever was under it.
  const closePlayer = useCallback(() => {
    refreshCw();
    if (settingsOpen) {
      setPlayer(null);
      setSettingsRefocus(t => t + 1);
    } else if (stack.length) {
      setPlayer(null);
      setDetailsRefocus(t => t + 1);
    } else if (fullSearch) {
      setPlayer(null);
    } else {
      refocusRow(true, () => setPlayer(null));
    }
  }, [settingsOpen, stack.length, fullSearch, refocusRow, refreshCw]);

  const closeLive = useCallback(() => {
    if (stack.length || fullSearch) {
      setLive(null);
    } else {
      refocusRow(true, () => setLive(null));
    }
  }, [stack.length, fullSearch, refocusRow]);

  const closeMenu = useCallback(() => refocusRow(true, () => setMenu(null)), [refocusRow]);
  const closeInfo = useCallback(() => refocusRow(true, () => setInfo(null)), [refocusRow]);

  // "Riproduci" from the card menu: the first source, like _fetchAndPlay.
  const playFirstSource = useCallback(
    async (card: CardModel) => {
      const o = card.open;
      try {
        const sources = await mycelium.getStreams(o.pluginId, o.mediaId);
        if (!sources.length) {
          setToast('Nessuna sorgente disponibile.');
          return;
        }
        const it = o.item;
        setPlayer(
          emptyRequest({
            pluginId: o.pluginId,
            streamId: sources[0].id,
            sourceLabel: sources[0].label,
            title: o.title,
            poster: it?.extra?.cover_url || it?.extra?.fanart_url || it?.posterUrl || '',
            plot: it?.extra?.plot ?? '',
            rating: it?.rating ?? 0,
            year: it?.year ?? 0,
            sources,
          }),
        );
      } catch (e) {
        setToast(`Impossibile avviare la riproduzione: ${errorText(e)}`);
      }
    },
    [],
  );

  // Long-press menu (_CardContextMenu / _CwContextMenu in pileus-player).
  const menuActions = useMemo((): MenuAction[] => {
    if (!menu) {
      return [];
    }
    const {card, def} = menu;
    const cwItem = card.open.cw;
    if (cwItem) {
      return [
        {
          icon: 'info',
          label: 'Dettagli',
          onPress: () => {
            setMenu(null);
            setStack(st => [...st, {...card.open, cw: undefined}]);
          },
        },
        {
          icon: 'delete',
          label: 'Rimuovi dai continua a guardare',
          destructive: true,
          onPress: () => {
            closeMenu();
            setCw(items => items.filter(i => !(i.pluginId === cwItem.pluginId && i.mediaId === cwItem.mediaId)));
            mycelium.deleteProgress(cwItem.pluginId, cwItem.mediaId).catch(e => {
              setToast(`Impossibile rimuovere: ${errorText(e)}`);
              refreshCw();
            });
          },
        },
        {icon: 'close', label: 'Annulla', onPress: closeMenu},
      ];
    }
    const mt = card.open.mediaType;
    const out: MenuAction[] = [];
    if (mt !== 'live') {
      out.push({
        icon: 'info',
        label: 'Dettagli',
        onPress: () => {
          setMenu(null);
          setInfo(card);
        },
      });
      if (mt === 'series') {
        out.push({
          icon: 'playlist',
          label: 'Episodi',
          onPress: () => {
            setMenu(null);
            setStack(st => [...st, card.open]);
          },
        });
      } else {
        out.push({
          icon: 'play',
          label: 'Riproduci',
          onPress: () => {
            closeMenu();
            playFirstSource(card);
          },
        });
      }
    }
    if (def?.liveRefreshable) {
      out.push({
        icon: 'refresh',
        label: 'Aggiorna ora',
        onPress: () => {
          closeMenu();
          mycelium
            .triggerRefresh(card.open.pluginId)
            .then(r =>
              setToast(r.message || (r.ok ? 'Aggiornamento avviato.' : "Impossibile avviare l'aggiornamento.")),
            )
            .catch(e => setToast(`Impossibile avviare l'aggiornamento: ${errorText(e)}`));
        },
      });
    }
    return out;
  }, [menu, closeMenu, playFirstSource, refreshCw]);

  const openMenu = useCallback((card: CardModel, def?: CatalogDef) => {
    const mt = card.open.mediaType;
    // Same gate as _handleLongPress: the menu's actions were built for
    // these kinds; a live_refreshable catalog still gets "Aggiorna ora".
    if (!card.open.cw && mt !== 'series' && mt !== 'movie' && mt !== 'episode' && !def?.liveRefreshable) {
      return;
    }
    setMenu({card, def});
  }, []);

  const popDetails = useCallback(() => {
    const last = stack.length === 1;
    if (last && !fullSearch) {
      refocusRow(true, () => setStack(st => st.slice(0, -1)));
    } else {
      setStack(st => st.slice(0, -1));
    }
  }, [stack.length, fullSearch, refocusRow]);

  const plugin = plugins?.length ? plugins[Math.min(selected, plugins.length - 1)] : undefined;
  const ready = plugin ? isPluginReady(plugin) : false;
  // A not-ready plugin has nothing behind the nav to go back to.
  const canCloseNav = navOpen && ready;

  // Back closes search or the nav when open; otherwise the first press only shows
  // "Premi di nuovo per uscire" and a second one within the window exits.
  // Settings and full search handle their own Back (this listener may be
  // newer, so it steps aside while they're up).
  useEffect(() => {
    const sub = keplerBack.addEventListener('hardwareBackPress', () => {
      if (settingsOpen || fullSearch || stack.length || player || live || menu || info) {
        return false;
      }
      if (searchOpen) {
        closeSearch();
        return true;
      }
      if (canCloseNav) {
        closeNav();
        return true;
      }
      const now = Date.now();
      if (now - lastBack.current < EXIT_CONFIRM_MS) {
        keplerBack.exitApp();
        return true;
      }
      lastBack.current = now;
      setToast('Premi di nuovo per uscire');
      return true;
    });
    return () => sub.remove();
  }, [settingsOpen, fullSearch, stack.length, player, live, menu, info, searchOpen, canCloseNav, closeNav, closeSearch, keplerBack]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const t = setTimeout(() => setToast(''), EXIT_CONFIRM_MS - 200);
    return () => clearTimeout(t);
  }, [toast]);

  // → closes the nav; ← at its edge does nothing (focus is trapped in it).
  useTVEventHandler(evt => {
    if (!canCloseNav || settingsOpen || evt.eventKeyAction === 1) {
      return;
    }
    if (evt.eventType === 'right') {
      closeNav();
    }
  });

  if (plugins === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!plugins.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>{error || 'Nessun plugin disponibile su questo server.'}</Text>
        <View style={styles.actions}>
          <FocusButton label="Riprova" primary onPress={load} hasTVPreferredFocus />
          <FocusButton label="Cambia profilo" onPress={exitProfile} />
        </View>
      </View>
    );
  }

  if (!plugin) {
    return null;
  }

  return (
    <View style={styles.root}>
      {ready ? (
        <PluginHome
          key={plugin.pluginId}
          plugin={plugin}
          catalogs={applyCatalogPrefs(plugin.pluginId, plugin.catalogs, prefs)}
          cw={cw.filter(i => i.pluginId === plugin.pluginId)}
          L={L}
          navOpen={navOpen}
          inactive={
            navOpen || settingsOpen || searchOpen || !!fullSearch || stack.length > 0 || !!player || !!live || !!menu || !!info
          }
          refocus={refocus}
          onOpenNav={() => {
            setBackFromSettings(false);
            setNavOpen(true);
          }}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenItem={openItem}
          onCardMenu={openMenu}
        />
      ) : (
        <NotReady plugin={plugin} />
      )}
      {ready ? (
        <QuickSearch
          key={plugin.pluginId}
          plugin={plugin}
          L={L}
          open={searchOpen && !settingsOpen}
          onClose={closeSearch}
          onOpenItem={openItem}
          onOpenFullSearch={openFullSearch}
        />
      ) : null}
      {/* Same plain scrim as home_view.dart while the nav is out. */}
      {navOpen && ready && !settingsOpen ? <View style={styles.scrim} pointerEvents="none" /> : null}
      {(navOpen || !ready) && !settingsOpen ? (
        <PluginNav
          plugins={plugins}
          selected={selected}
          L={L}
          focusAction={backFromSettings}
          onSelect={i => {
            setSelected(i);
            closeNav();
          }}
          actions={[{label: 'Impostazioni', icon: 'settings', onPress: () => setSettingsOpen(true)}]}
        />
      ) : null}
      {settingsOpen ? (
        <SettingsScreen
          onPlay={setPlayer}
          refocus={settingsRefocus}
          onClose={() => {
            setBackFromSettings(true);
            setSettingsOpen(false);
          }}
        />
      ) : null}
      {fullSearch && ready ? (
        <SearchScreen
          plugin={plugin}
          initialQuery={fullSearch.query}
          covered={stack.length > 0 || !!player || !!live}
          onClose={closeFullSearch}
          onOpenItem={openItem}
        />
      ) : null}
      {stack.length ? (
        <DetailsScreen
          key={`${stack.length}:${stack[stack.length - 1].mediaId}`}
          target={stack[stack.length - 1]}
          cw={cw}
          onBack={popDetails}
          onOpen={openItem}
          onPlay={setPlayer}
          refocus={detailsRefocus}
          covered={!!player || !!live}
          canDownload={pluginSupportsDownload(plugins.find(p => p.pluginId === stack[stack.length - 1].pluginId))}
        />
      ) : null}
      {live?.item ? (
        <LivePopup
          pluginId={live.pluginId}
          item={live.item}
          onClose={closeLive}
          onPlay={(src, all) => {
            const it = live.item!;
            setLive(null);
            setPlayer(
              emptyRequest({
                pluginId: live.pluginId,
                streamId: src.id,
                sourceLabel: src.label,
                title: it.title,
                poster: it.posterUrl,
                isLive: true,
                sources: all,
              }),
            );
          }}
        />
      ) : null}
      {menu && menuActions.length ? (
        <ContextMenu
          title={menuTitle(menu.card)}
          actions={menuActions}
          onClose={closeMenu}
        />
      ) : null}
      {info ? (
        <InfoPopup
          pluginId={info.open.pluginId}
          mediaId={info.open.mediaId}
          title={info.title}
          poster={info.open.item?.posterUrl ?? info.image}
          W={L.W}
          H={L.H}
          onNavigate={() => {
            setInfo(null);
            setStack(st => [...st, info.open]);
          }}
          onClose={closeInfo}
        />
      ) : null}
      {player ? (
        <PlayerScreen
          key={player.streamId}
          request={player}
          onExit={closePlayer}
          onOpenEpisode={target => {
            refreshCw();
            setPlayer(null);
            setStack(st => [...st, target]);
          }}
        />
      ) : null}
      {toast && !settingsOpen ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = scaledStyles({
  root: {flex: 1, backgroundColor: colors.bg},
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  title: {color: colors.textHigh, fontSize: font.title, fontWeight: '700'},
  message: {color: colors.textMid, fontSize: font.body, marginTop: space.m, textAlign: 'center'},
  actions: {flexDirection: 'row', gap: space.m, marginTop: space.l},
  scrim: {...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)'},
  toast: {
    position: 'absolute',
    bottom: space.xl,
    alignSelf: 'center',
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    borderRadius: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toastText: {color: colors.textHigh, fontSize: font.body},
});
