// Impostazioni › Preferenze (preferences_screen.dart), the part that applies
// to Vega: subtitle style (profile blob, synced with the other apps), and the
// player's quality cap and playback reserve (per device). The Android-only
// switches (software decoding, compatible rendering, modest hardware) have
// no counterpart here.

import React, {useEffect, useRef, useState} from 'react';
import {Text, View} from 'react-native';
import {
  DevicePrefs,
  LIVE_BUFFER,
  loadDevicePrefs,
  MAX_HEIGHT_OPTIONS,
  saveDevicePrefs,
  VOD_BUFFER,
} from '../core/devicePrefs';
import {mycelium} from '../core/api';
import {
  argbToCss,
  parseSubtitleStyle,
  SUBTITLE_COLORS,
  SUBTITLE_PADDING,
  SUBTITLE_SIZE,
  SubtitleStyle,
  writeSubtitleStyle,
} from '../core/prefs';
import {parsePreferredLanguage, PreferredLanguage, writePreferredLanguage} from '../core/language';
import {useAuth} from '../state/auth';
import {scaledStyles} from '../theme';
import {Note, Page, Row, SectionHeader, StepperRow} from './ui';

const SAVE_AFTER_MS = 700;

const heightLabel = (h: number) => (h === 0 ? 'Automatica' : `${h}p`);

function step(v: number, r: {min: number; max: number; step: number}, dir: -1 | 1) {
  return Math.min(r.max, Math.max(r.min, v + dir * r.step));
}

export function PreferencesPage() {
  const first = useRef<View>(null);
  const [prefs, setPrefs] = useState<DevicePrefs | null>(null);
  const {profile, updateProfile} = useAuth();
  const [sub, setSub] = useState<SubtitleStyle>(() => parseSubtitleStyle(profile?.preferencesJson ?? ''));
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [subNote, setSubNote] = useState('');

  // Steppers fire on every ←/→: save once the value settles.
  const updateSub = (next: SubtitleStyle) => {
    setSub(next);
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(async () => {
      if (!profile) {
        return;
      }
      try {
        const r = await mycelium.setProfilePreferences(
          profile.profileId,
          writeSubtitleStyle(profile.preferencesJson, next),
        );
        updateProfile(r);
        setSubNote('');
      } catch {
        setSubNote('Impossibile salvare lo stile dei sottotitoli.');
      }
    }, SAVE_AFTER_MS);
  };
  const stepNum = (v: number, r: {min: number; max: number; step: number}, dir: -1 | 1) =>
    Math.min(r.max, Math.max(r.min, v + dir * r.step));
  const colorIdx = Math.max(0, SUBTITLE_COLORS.findIndex(c => c.argb === sub.colorArgb));

  // "Lingua preferita" (preferences_screen.dart _PreferredLanguagePrefRow):
  // which language version a Play picks, synced with the profile.
  const [lang, setLang] = useState<PreferredLanguage>(() => parsePreferredLanguage(profile?.preferencesJson ?? ''));
  const [langNote, setLangNote] = useState('');
  const toggleLang = async () => {
    if (!profile) {
      return;
    }
    const next: PreferredLanguage = lang === 'original' ? 'it' : 'original';
    setLang(next);
    try {
      const r = await mycelium.setProfilePreferences(profile.profileId, writePreferredLanguage(profile.preferencesJson, next));
      updateProfile(r);
      setLangNote('');
    } catch {
      setLang(lang);
      setLangNote('Impossibile salvare la lingua preferita.');
    }
  };

  useEffect(() => {
    loadDevicePrefs().then(setPrefs);
  }, []);

  const update = (p: DevicePrefs) => {
    setPrefs(p);
    saveDevicePrefs(p);
  };

  return (
    <Page title="Preferenze" first={first} focusToken={prefs ? 1 : 0}>
      <SectionHeader title="Lingua" />
      <Row
        ref={first}
        label="Preferisci la versione originale sottotitolata"
        value={lang === 'original' ? 'Sì' : 'No'}
        onPress={toggleLang}
      />
      <Note
        text={
          langNote ||
          "Spenta: italiano. Al Play parte questa versione quando c'è; si può sempre scegliere l'altra dalla scheda del titolo."
        }
      />
      <SectionHeader title="Sottotitoli" />
      <View style={styles.preview}>
        <Text
          style={[
            styles.sample,
            {fontSize: sub.fontSize, lineHeight: sub.fontSize * 1.4, color: argbToCss(sub.colorArgb)},
            sub.bgEnabled ? styles.sampleBg : styles.sampleShadow,
          ]}>
          Così appariranno i sottotitoli
        </Text>
      </View>
      <StepperRow
        label="Dimensione"
        value={`${sub.fontSize}px`}
        onStep={dir => updateSub({...sub, fontSize: stepNum(sub.fontSize, SUBTITLE_SIZE, dir)})}
      />
      <StepperRow
        label="Colore testo"
        value={SUBTITLE_COLORS[colorIdx].label}
        onStep={dir => {
          const n = SUBTITLE_COLORS.length;
          updateSub({...sub, colorArgb: SUBTITLE_COLORS[(colorIdx + dir + n) % n].argb});
        }}
      />
      <Row label="Sfondo sottotitoli" value={sub.bgEnabled ? 'Sì' : 'No'} onPress={() => updateSub({...sub, bgEnabled: !sub.bgEnabled})} />
      <StepperRow
        label="Posizione verticale"
        subtitle="Distanza dal bordo inferiore"
        value={`${sub.bottomPadding}px`}
        onStep={dir => updateSub({...sub, bottomPadding: stepNum(sub.bottomPadding, SUBTITLE_PADDING, dir)})}
      />
      {subNote ? <Note text={subNote} /> : <Note text="Valgono per il profilo, su tutti i dispositivi." />}
      <SectionHeader title="Player" />
      {prefs ? (
        <>
          <StepperRow
            label="Qualità video massima"
            subtitle="Tetto alla risoluzione scelta in automatico"
            value={heightLabel(prefs.maxVideoHeight)}
            onStep={dir => {
              const i = MAX_HEIGHT_OPTIONS.indexOf(prefs.maxVideoHeight);
              const n = MAX_HEIGHT_OPTIONS.length;
              update({...prefs, maxVideoHeight: MAX_HEIGHT_OPTIONS[(i + dir + n) % n]});
            }}
          />
          <StepperRow
            label="Riserva di riproduzione"
            subtitle="Secondi di video caricati in anticipo"
            value={`${prefs.vodBufferSec} s`}
            onStep={dir => update({...prefs, vodBufferSec: step(prefs.vodBufferSec, VOD_BUFFER, dir)})}
          />
          <StepperRow
            label="Riserva di riproduzione (live)"
            subtitle="Più alta regge meglio una rete instabile, ma resta più indietro"
            value={`${prefs.liveBufferSec} s`}
            onStep={dir => update({...prefs, liveBufferSec: step(prefs.liveBufferSec, LIVE_BUFFER, dir)})}
          />
          <Note text="Valgono per questo dispositivo, dalla prossima riproduzione. ← e → cambiano il valore." />
        </>
      ) : null}
    </Page>
  );
}

const styles = scaledStyles({
  preview: {
    height: 180,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    backgroundColor: '#2a3340',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 24,
    overflow: 'hidden',
  },
  // fontSize comes from the profile in dp (inline), not 1080p pixels.
  sample: {fontWeight: '500', paddingHorizontal: 12},
  sampleBg: {backgroundColor: 'rgba(0,0,0,0.667)'},
  sampleShadow: {textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 6},
});
