import React, {useState} from 'react';
import {FocusButton} from '../components/FocusButton';
import {OnScreenKeyboard} from '../components/OnScreenKeyboard';
import {CenteredScreen} from '../components/Screen';
import {TextField} from '../components/TextField';
import {errorText, useAuth} from '../state/auth';
import {px} from '../theme';

export function ConnectScreen() {
  const {connect, session} = useAuth();
  const [input, setInput] = useState(session.serverInput);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!input.trim() || busy) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await connect(input);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CenteredScreen
      title="Collegati a Mycelium"
      subtitle="Inserisci l'indirizzo del server: un IP della rete di casa (es. 192.168.1.20) oppure un dominio (es. media.esempio.it)."
      error={error}>
      <TextField value={input} placeholder="192.168.1.20 o media.esempio.it" />
      <OnScreenKeyboard
        value={input}
        onChange={setInput}
        layout="host"
        onSubmit={submit}
        maxLength={253}
        width={px(720)}
        takeFocus
      />
      <FocusButton label="Connetti" primary busy={busy} onPress={submit} />
    </CenteredScreen>
  );
}
