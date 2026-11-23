// Impostazioni › Server (pileus-player server_info_dialog.dart): where this
// TV connects and whether the server answers now — so a tester can read out
// (or photograph) the address and version instead of guessing.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {View} from 'react-native';
import {mycelium} from '../core/api';
import {localIPv4} from '../core/discovery';
import {useAuth} from '../state/auth';
import {Note, Page, Row, SectionHeader} from './ui';

const APP_VERSION: string = require('../../package.json').version;

interface Probe {
  latencyMs: number | null;
  version: string;
  error: string;
}

export function ServerPage() {
  const first = useRef<View>(null);
  const {session} = useAuth();
  const [probe, setProbe] = useState<Probe | null>(null);

  const load = useCallback(async () => {
    setProbe(null);
    const t0 = Date.now();
    try {
      const info = await mycelium.probe(5000);
      setProbe({latencyMs: Date.now() - t0, version: info.version ?? '', error: ''});
    } catch (e) {
      setProbe({latencyMs: null, version: '', error: e instanceof Error ? e.message : 'nessuna risposta'});
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const origin = mycelium.origin;
  const remote = /^https:/i.test(origin);
  const ip = localIPv4();
  const state = !probe
    ? 'Verifico…'
    : probe.error
    ? `Non risponde: ${probe.error}`
    : `Raggiungibile (${probe.latencyMs} ms)`;

  return (
    <Page title="Server" first={first}>
      <Row ref={first} icon="refresh" label="Stato" subtitle={state} onPress={load} />
      <SectionHeader title="Collegamento" />
      <Row icon="dns" label="Server" subtitle={origin || '—'} onPress={() => {}} />
      <Row icon="wifiOff" label="Tipo" subtitle={remote ? 'Remoto (Internet)' : 'Rete locale'} onPress={() => {}} />
      {probe?.version ? (
        <Row icon="info" label="Versione Mycelium" subtitle={probe.version} onPress={() => {}} />
      ) : null}
      <SectionHeader title="Questo dispositivo" />
      {ip ? <Row icon="tv" label="Indirizzo IP" subtitle={ip} onPress={() => {}} /> : null}
      {session.deviceId ? (
        <Row icon="info" label="ID dispositivo" subtitle={session.deviceId} onPress={() => {}} />
      ) : null}
      <Row icon="info" label="Versione Pileus" subtitle={APP_VERSION} onPress={() => {}} />
      <Note text="OK su Stato per verificare di nuovo." />
    </Page>
  );
}
