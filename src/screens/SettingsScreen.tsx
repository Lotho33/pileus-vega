// Impostazioni, reached from the side nav (pileus-player settings_screen.dart):
// a small page stack — main list, Profilo, Preferenze, Plugin › one plugin.
// Back pops a page (dialogs inside the pages take Back first: their
// listeners are newer), and leaves settings from the main list.

import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {TVFocusGuideView, useKeplerBackHandler} from '@amazon-devices/react-native-kepler';
import {ConfirmDialog} from '../components/ConfirmDialog';
import type {PluginInfo} from '../gen/media';
import type {PlayRequest} from '../player/session';
import {DownloadsPage} from '../settings/DownloadsPage';
import {PluginPage, PluginsPage} from '../settings/PluginsPage';
import {PreferencesPage} from '../settings/PreferencesPage';
import {ProfilePage} from '../settings/ProfilePage';
import {Page, Row, SectionHeader} from '../settings/ui';
import {useAuth} from '../state/auth';
import {colors, scaledStyles} from '../theme';

type SettingsPage =
  | {kind: 'main'}
  | {kind: 'profile'}
  | {kind: 'prefs'}
  | {kind: 'plugins'}
  | {kind: 'downloads'}
  | {kind: 'plugin'; plugin: PluginInfo};

type Dialog = 'server' | 'exit' | null;

function MainPage({
  focusToken,
  open,
  onDialog,
}: {
  focusToken: number;
  open: (p: SettingsPage) => void;
  onDialog: (d: Dialog) => void;
}) {
  const {profile, session} = useAuth();
  const first = useRef<View>(null);
  return (
    <Page title="Impostazioni" first={first} focusToken={focusToken}>
      <SectionHeader title="Account" />
      <Row
        ref={first}
        icon="person"
        label="Profilo"
        subtitle={profile ? `${profile.name} · nome, avatar, PIN` : 'Nome, avatar, PIN'}
        nav
        onPress={() => open({kind: 'profile'})}
      />
      <SectionHeader title="Connessione" />
      <Row
        icon="dns"
        label="Cambia server"
        subtitle={`${session.serverInput || 'Server'} · richiede un nuovo abbinamento`}
        onPress={() => onDialog('server')}
      />
      <SectionHeader title="App" />
      <Row
        icon="tune"
        label="Preferenze"
        subtitle="Qualità video, riserva di riproduzione"
        nav
        onPress={() => open({kind: 'prefs'})}
      />
      <Row
        icon="extension"
        label="Plugin"
        subtitle="Ordine, visibilità e configurazione per singolo plugin"
        nav
        onPress={() => open({kind: 'plugins'})}
      />
      <Row
        icon="arrowDown"
        label="Download"
        subtitle="Contenuti scaricati sul server"
        nav
        onPress={() => open({kind: 'downloads'})}
      />
      <View style={styles.gap} />
      <Row icon="logout" label="Esci dall'app" subtitle="Chiude Pileus" onPress={() => onDialog('exit')} />
    </Page>
  );
}

export function SettingsScreen({
  onClose,
  onPlay,
  refocus = 0,
}: {
  onClose: () => void;
  /** Plays a finished download (the player opens on top of settings). */
  onPlay: (req: PlayRequest) => void;
  /** Bumped when the player on top closes. */
  refocus?: number;
}) {
  const {changeServer} = useAuth();
  const keplerBack = useKeplerBackHandler();
  const [stack, setStack] = useState<SettingsPage[]>([{kind: 'main'}]);
  const [dialog, setDialog] = useState<Dialog>(null);
  // Bumped when a page comes back to the top: it refocuses its first row.
  const [focusToken, setFocusToken] = useState(0);

  const top = stack[stack.length - 1];
  const push = (p: SettingsPage) => setStack(s => [...s, p]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const depth = useRef(1);
  depth.current = stack.length;
  useEffect(() => {
    const sub = keplerBack.addEventListener('hardwareBackPress', () => {
      if (depth.current > 1) {
        setStack(s => s.slice(0, -1));
        setFocusToken(t => t + 1);
      } else {
        onCloseRef.current();
      }
      return true;
    });
    return () => sub.remove();
  }, [keplerBack]);

  return (
    <TVFocusGuideView style={styles.root} trapFocusLeft trapFocusRight trapFocusUp trapFocusDown>
      {top.kind === 'main' ? (
        <MainPage focusToken={focusToken} open={push} onDialog={setDialog} />
      ) : top.kind === 'profile' ? (
        <ProfilePage />
      ) : top.kind === 'prefs' ? (
        <PreferencesPage />
      ) : top.kind === 'downloads' ? (
        <DownloadsPage onPlay={onPlay} focusToken={refocus} />
      ) : top.kind === 'plugins' ? (
        <PluginsPage key={focusToken} onOpen={p => push({kind: 'plugin', plugin: p})} />
      ) : (
        <PluginPage plugin={top.plugin} />
      )}
      {dialog === 'server' ? (
        <ConfirmDialog
          title="Cambiare server?"
          message="Tornerai alla scelta del server. Dovrai abbinare di nuovo questo dispositivo al nuovo server."
          confirmLabel="Cambia server"
          onCancel={() => {
            setDialog(null);
            setFocusToken(t => t + 1);
          }}
          onConfirm={() => {
            setDialog(null);
            changeServer();
          }}
        />
      ) : dialog === 'exit' ? (
        <ConfirmDialog
          title="Uscire dall'app?"
          message="Pileus verrà chiuso."
          confirmLabel="Esci"
          destructive
          onCancel={() => {
            setDialog(null);
            setFocusToken(t => t + 1);
          }}
          onConfirm={() => keplerBack.exitApp()}
        />
      ) : null}
    </TVFocusGuideView>
  );
}

const styles = scaledStyles({
  root: {...StyleSheet.absoluteFillObject, backgroundColor: colors.bg},
  gap: {height: 16},
});
