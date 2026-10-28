import React, {useState} from 'react';
import {View} from 'react-native';
import {FocusButton} from '../components/FocusButton';
import {OnScreenKeyboard} from '../components/OnScreenKeyboard';
import {CenteredScreen} from '../components/Screen';
import {TextField} from '../components/TextField';
import {errorText, useAuth} from '../state/auth';
import {px, scaledStyles, space} from '../theme';

export function PairingScreen() {
  const {pair, changeServer, session} = useAuth();
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

  return (
    <CenteredScreen
      title="Associa questo dispositivo"
      subtitle={`Apri la dashboard di Mycelium (${session.serverInput}), genera un codice di associazione e inseriscilo qui.`}
      error={error}>
      <TextField value={code} placeholder="Codice di associazione" center />
      {/* The code is 0-9 + A-Z only, so the keyboard offers exactly that. */}
      <OnScreenKeyboard
        value={code}
        onChange={setCode}
        layout="code"
        onSubmit={submit}
        maxLength={16}
        width={px(720)}
        keyHeight={px(56)}
        takeFocus
      />
      <View style={styles.row}>
        <FocusButton label="Associa" primary busy={busy} onPress={submit} />
        <FocusButton label="Cambia server" onPress={changeServer} />
      </View>
    </CenteredScreen>
  );
}

const styles = scaledStyles({
  row: {flexDirection: 'row', gap: space.m},
});
