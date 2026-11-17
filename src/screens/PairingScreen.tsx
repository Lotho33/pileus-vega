import React, {useState} from 'react';
import {FocusButton} from '../components/FocusButton';
import {OnScreenKeyboard} from '../components/OnScreenKeyboard';
import {AuthFrame, FieldLabel, TextLink} from '../components/Screen';
import {Text} from '../components/Text';
import {TextField} from '../components/TextField';
import {errorText, useAuth} from '../state/auth';
import {colors, px, scaledStyles} from '../theme';

export function PairingScreen() {
  const {pair, changeServer} = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!code.trim() || busy) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await pair(code);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  // device_pairing_screen.dart: "Codice di abbinamento", a keyboard with no
  // Invio (the code is confirmed with "Autorizza"), "Cambia server" as a link.
  return (
    <AuthFrame subtitle="Connettiti a Mycelium">
      <FieldLabel
        label="Codice di abbinamento"
        hint="Generato dalla dashboard admin di Mycelium — scade dopo pochi minuti."
      />
      <TextField inCard value={code} placeholder="es. 8H7K12" />
      {/* The code is 0-9 + A-Z only, so the keyboard offers exactly that. */}
      <OnScreenKeyboard
        value={code}
        onChange={setCode}
        layout="code"
        showEnter={false}
        maxLength={16}
        width={px(400)}
        keyHeight={px(46)}
        takeFocus
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FocusButton label="Autorizza" primary busy={busy} onPress={submit} />
      <TextLink label="Cambia server" onPress={changeServer} />
    </AuthFrame>
  );
}

const styles = scaledStyles({
  error: {color: colors.error, fontSize: 20, textAlign: 'center'},
});
