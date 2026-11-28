import React, {useEffect, useRef, useState} from 'react';
import {View} from 'react-native';
import {Text} from '../components/Text';
import {FocusButton} from '../components/FocusButton';
import {OnScreenKeyboard} from '../components/OnScreenKeyboard';
import {Icon} from '../components/Icon';
import {AuthFrame, FieldLabel, TextLink} from '../components/Screen';
import {TextField} from '../components/TextField';
import {discoverServers, FoundServer} from '../core/discovery';
import {focusSoon} from '../core/focus';
import {parseServerAddressInput} from '../core/serverAddress';
import {errorText, useAuth} from '../state/auth';
import {colors, px, scaledStyles} from '../theme';
import {Spinner} from '../components/Spinner';

export function ConnectScreen() {
  const {connect, session} = useAuth();
  const [input, setInput] = useState(session.serverInput);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [found, setFound] = useState<FoundServer[]>([]);
  const [scanning, setScanning] = useState(true);
  // "Riprova scansione automatica" runs the discovery again.
  const [scan, setScan] = useState(0);
  const firstFound = useRef<View>(null);
  // Typing comes first: a server found later doesn't take focus from the keyboard.
  const typed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setScanning(true);
    const last = parseServerAddressInput(session.serverInput);
    discoverServers({
      lastHost: !last.remote && last.host ? last.host : null,
      isCancelled: () => cancelled,
      onFound: s => setFound(list => (list.some(f => f.host === s.host) ? list : [...list, s])),
    }).finally(() => !cancelled && setScanning(false));
    return () => {
      cancelled = true;
    };
  }, [session.serverInput, scan]);

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

  // server_discovery_screen.dart's card: what the scan found (or that it
  // found nothing), "Indirizzo server" with its hint, the keyboard,
  // "Connetti", and "Riprova scansione automatica" as a link.
  return (
    <AuthFrame subtitle="Connessione a Mycelium">
      {found.length ? (
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
      ) : scanning ? (
        <View style={styles.scan}>
          <Spinner />
          <Text style={styles.scanText}>Ricerca server Mycelium…</Text>
        </View>
      ) : (
        <View style={styles.scan}>
          <Icon name="wifiOff" size={px(40)} color="#FF9F43" />
          <Text style={styles.scanText}>Server non trovato automaticamente</Text>
        </View>
      )}
      <FieldLabel label="Indirizzo server" hint="Un IP (rete locale) o un dominio/https:// (server remoto)" />
      <TextField inCard value={input} placeholder="192.168.1.10 o https://dominio" />
      <OnScreenKeyboard
        value={input}
        onChange={v => {
          typed.current = true;
          setInput(v);
        }}
        layout="host"
        onSubmit={() => submit()}
        maxLength={253}
        width={px(400)}
        keyHeight={px(46)}
        takeFocus
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FocusButton label="Connetti" primary busy={busy} onPress={() => submit()} />
      <TextLink label="Riprova scansione automatica" onPress={() => setScan(n => n + 1)} />
    </AuthFrame>
  );
}

const MAX_SHOWN = 4;

const styles = scaledStyles({
  servers: {gap: 12},
  scan: {alignItems: 'center', gap: 12},
  scanText: {color: 'rgba(255,255,255,0.7)', fontSize: 20, textAlign: 'center'},
  error: {color: colors.error, fontSize: 20, textAlign: 'center'},
});
