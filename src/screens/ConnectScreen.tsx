import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Text, View} from 'react-native';
import {FocusButton} from '../components/FocusButton';
import {OnScreenKeyboard} from '../components/OnScreenKeyboard';
import {CenteredScreen} from '../components/Screen';
import {TextField} from '../components/TextField';
import {discoverServers, FoundServer} from '../core/discovery';
import {focusSoon} from '../core/focus';
import {parseServerAddressInput} from '../core/serverAddress';
import {errorText, useAuth} from '../state/auth';
import {colors, font, px, scaledStyles, space} from '../theme';

export function ConnectScreen() {
  const {connect, session} = useAuth();
  const [input, setInput] = useState(session.serverInput);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [found, setFound] = useState<FoundServer[]>([]);
  const [scanning, setScanning] = useState(true);
  const firstFound = useRef<View>(null);
  // Typing comes first: a server found later doesn't take focus from the keyboard.
  const typed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const last = parseServerAddressInput(session.serverInput);
    discoverServers({
      lastHost: !last.remote && last.host ? last.host : null,
      isCancelled: () => cancelled,
      onFound: s => setFound(list => (list.some(f => f.host === s.host) ? list : [...list, s])),
    }).finally(() => !cancelled && setScanning(false));
    return () => {
      cancelled = true;
    };
  }, [session.serverInput]);

  const hasFound = found.length > 0;
  useEffect(() => {
    if (hasFound && !typed.current) {
      return focusSoon(() => firstFound.current);
    }
  }, [hasFound]);

  const submit = async (value = input) => {
    if (!value.trim() || busy) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await connect(value);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CenteredScreen
      title="Collegati a Mycelium"
      subtitle="Scegli un server trovato nella rete di casa, oppure inserisci l'indirizzo: un IP (es. 192.168.1.20) o un dominio (es. media.esempio.it)."
      error={error}>
      <View style={styles.found}>
        {/* At most MAX_SHOWN, side by side: many servers mustn't push the keyboard off screen. */}
        <View style={styles.servers}>
          {found.slice(0, MAX_SHOWN).map((s, i) => (
            <FocusButton
              key={s.host}
              ref={i === 0 ? firstFound : undefined}
              label={`Mycelium · ${s.host}${s.version ? `  (v${s.version})` : ''}`}
              primary={i === 0}
              busy={busy}
              onPress={() => {
                setInput(s.host);
                submit(s.host);
              }}
            />
          ))}
        </View>
        {scanning ? (
          <View style={styles.scan}>
            <ActivityIndicator color={colors.textMid} />
            <Text style={styles.scanText}>Ricerca dei server nella rete di casa…</Text>
          </View>
        ) : !hasFound ? (
          <Text style={styles.scanText}>Nessun server trovato automaticamente.</Text>
        ) : null}
      </View>
      <TextField value={input} placeholder="192.168.1.20 o media.esempio.it" />
      <OnScreenKeyboard
        value={input}
        onChange={v => {
          typed.current = true;
          setInput(v);
        }}
        layout="host"
        onSubmit={() => submit()}
        maxLength={253}
        width={px(720)}
        takeFocus
      />
      <FocusButton label="Connetti" primary={!hasFound} busy={busy} onPress={() => submit()} />
    </CenteredScreen>
  );
}

const MAX_SHOWN = 4;

const styles = scaledStyles({
  found: {alignItems: 'center', gap: space.s, minHeight: 40},
  servers: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.s, maxWidth: 1600},
  scan: {flexDirection: 'row', alignItems: 'center', gap: space.s},
  scanText: {color: colors.textMid, fontSize: font.body},
});
