// Preferenze → "Tempi di risposta" (pileus-player's metrics_dialog.dart):
// the waits kept by core/metrics.ts, one row each (median, last, worst,
// samples), then the share of slow frames per screen. Rows are focusable so
// ↑/↓ scroll the page through them on the remote.

import React, {useState} from 'react';
import {clearMetrics, fluiditySummaries, fmtMs, metricSummaries} from '../core/metrics';
import {Note, Row, SectionHeader} from './ui';

export function MetricsSection() {
  const [, setVersion] = useState(0);
  const rows = metricSummaries();
  const smooth = fluiditySummaries();
  return (
    <>
      <SectionHeader title="Tempi di risposta" />
      {rows.length === 0 ? (
        <Note text="Nessuna misura ancora. Usa l'app normalmente: avvio, home, apertura dei titoli, Play." />
      ) : (
        rows.map(r => (
          <Row
            key={r.metric.id}
            label={r.metric.label}
            subtitle={`${r.metric.hint}  Ultimo ${fmtMs(r.last)} · peggiore ${fmtMs(r.worst)} · ${r.count} misure`}
            value={fmtMs(r.median)}
          />
        ))
      )}
      {smooth.length ? (
        <>
          <SectionHeader title="Fluidità — fotogrammi lenti per schermata" />
          {smooth.map(f => (
            <Row
              key={f.label}
              label={f.label}
              subtitle={`${f.frames} fotogrammi`}
              value={`${f.slowPct.toFixed(1)} %`}
            />
          ))}
        </>
      ) : null}
      <Row
        label="Azzera le misure"
        danger
        onPress={async () => {
          await clearMetrics();
          setVersion(v => v + 1);
        }}
      />
      <Note text="Valori mediani delle ultime 20 misure. Restano su questo dispositivo." />
    </>
  );
}
