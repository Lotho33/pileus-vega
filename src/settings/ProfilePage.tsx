// Impostazioni › Profilo (profile_settings_screen.dart): name, avatar, PIN,
// "forget this device", switch and delete.

import React, {useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {TVFocusGuideView, useKeplerBackHandler} from '@amazon-devices/react-native-kepler';
import {Avatar, AVATAR_COUNT, avatarUrl} from '../components/Avatar';
import {ConfirmDialog} from '../components/ConfirmDialog';
import {mycelium} from '../core/api';
import {focusSoon} from '../core/focus';
import {errorText, useAuth} from '../state/auth';
import {colors, font, px, scaledStyles, space} from '../theme';
import {TextDialog} from './TextDialog';
import {Note, Page, Row, SectionHeader} from './ui';

type Dialog =
  | null
  | 'name'
  | 'avatar'
  | 'pin-new'
  | 'pin-current-change'
  | 'pin-current-remove'
  | 'forget'
  | 'switch'
  | 'delete'
  | 'default-set'
  | 'default-blocked';

function AvatarPicker({
  name,
  current,
  onPick,
  onCancel,
}: {
  name: string;
  current: string;
  onPick: (url: string) => void;
  onCancel: () => void;
}) {
  const keplerBack = useKeplerBackHandler();
  const refs = useRef(new Map<number, View>());
  const cur = Math.max(0, Array.from({length: AVATAR_COUNT}, (_, i) => avatarUrl(i)).indexOf(current));
  React.useEffect(() => focusSoon(() => refs.current.get(cur)), [cur]);
  React.useEffect(() => {
    const sub = keplerBack.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => sub.remove();
  }, [keplerBack, onCancel]);
  return (
    <View style={styles.scrim}>
      <TVFocusGuideView style={styles.card} trapFocusLeft trapFocusRight trapFocusUp trapFocusDown>
        <Text style={styles.title}>Scegli avatar</Text>
        <View style={styles.grid}>
          {Array.from({length: AVATAR_COUNT}, (_, i) => (
            <AvatarCell
              key={i}
              ref={(v: View | null) => {
                if (v) {
                  refs.current.set(i, v);
                }
              }}
              name={name}
              url={avatarUrl(i)}
              selected={avatarUrl(i) === current}
              onPress={() => onPick(avatarUrl(i))}
            />
          ))}
        </View>
      </TVFocusGuideView>
    </View>
  );
}

const AvatarCell = React.forwardRef<View, {name: string; url: string; selected: boolean; onPress: () => void}>(
  function AvatarCell({name, url, selected, onPress}, ref) {
    const [focused, setFocused] = useState(false);
    return (
      <Pressable
        ref={ref}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPress={onPress}
        style={[styles.cell, selected && styles.cellSelected, focused && styles.cellFocused]}>
        <Avatar name={name} url={url} size={px(112)} />
      </Pressable>
    );
  },
);

export function ProfilePage() {
  const {profile, exitProfile, forgetDevice, profileDeleted, updateProfile, session, setDefaultProfile} =
    useAuth();
  // Name of the profile already holding the default slot, if it still exists.
  const [otherDefault, setOtherDefault] = useState<string | null>(null);
  React.useEffect(() => {
    const id = session.defaultProfileId;
    if (!id || id === profile?.profileId) {
      setOtherDefault(null);
      return;
    }
    mycelium
      .listProfiles()
      .then(list => setOtherDefault(list.find(p => p.profileId === id)?.name ?? null))
      .catch(() => setOtherDefault(null));
  }, [session.defaultProfileId, profile?.profileId]);
  const first = useRef<View>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [focusToken, setFocusToken] = useState(0);
  const currentPin = useRef('');

  if (!profile) {
    return null;
  }
  const close = () => {
    setDialog(null);
    setError('');
    setBusy(false);
    setFocusToken(t => t + 1);
  };
  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      close();
      if (done) {
        setNote(done);
      }
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <>
      <Page title="Profilo" first={first} focusToken={focusToken}>
        <View style={styles.hero}>
          <Avatar name={profile.name} url={profile.avatarUrl} size={px(120)} />
          <Text style={styles.heroName}>{profile.name}</Text>
        </View>
        <SectionHeader title="Dati profilo" />
        <Row ref={first} icon="edit" label="Nome" value={profile.name} nav onPress={() => setDialog('name')} />
        <Row icon="person" label="Avatar" nav onPress={() => setDialog('avatar')} />
        <SectionHeader title="Avvio" />
        <Row
          label="Profilo predefinito"
          subtitle="All'avvio si entra direttamente con questo profilo"
          value={session.defaultProfileId === profile.profileId ? 'Sì' : 'No'}
          onPress={() => {
            if (session.defaultProfileId === profile.profileId) {
              setDefaultProfile('');
            } else {
              setDialog(otherDefault ? 'default-blocked' : 'default-set');
            }
          }}
        />
        <SectionHeader title="Sicurezza" />
        {profile.pinProtected ? (
          <>
            <Row icon="lock" label="Cambia PIN" nav onPress={() => setDialog('pin-current-change')} />
            <Row icon="lock" label="Rimuovi PIN" nav onPress={() => setDialog('pin-current-remove')} />
            <Row
              icon="lock"
              label="Dimentica questo dispositivo"
              subtitle="Richiederà di nuovo il PIN qui"
              onPress={() => setDialog('forget')}
            />
          </>
        ) : (
          <Row
            icon="lock"
            label="Imposta PIN"
            subtitle="Da 4 a 8 cifre, chiesto quando si sceglie questo profilo"
            nav
            onPress={() => setDialog('pin-new')}
          />
        )}
        <SectionHeader title="Sessione" />
        <Row icon="person" label="Cambia profilo" subtitle="Torna alla schermata dei profili" onPress={() => setDialog('switch')} />
        <SectionHeader title="Zona pericolosa" />
        <Row icon="delete" label="Elimina profilo" danger onPress={() => setDialog('delete')} />
        {note ? <Note text={note} /> : null}
      </Page>

      {dialog === 'name' ? (
        <TextDialog
          title="Rinomina profilo"
          initial={profile.name}
          placeholder="Nome del profilo"
          maxLength={32}
          busy={busy}
          error={error}
          onCancel={close}
          onSubmit={name =>
            run(async () => {
              updateProfile(await mycelium.updateProfile(profile.profileId, name, profile.avatarUrl));
            })
          }
        />
      ) : dialog === 'avatar' ? (
        <AvatarPicker
          name={profile.name}
          current={profile.avatarUrl}
          onCancel={close}
          onPick={url =>
            run(async () => {
              updateProfile(await mycelium.updateProfile(profile.profileId, profile.name, url));
            })
          }
        />
      ) : dialog === 'pin-current-change' || dialog === 'pin-current-remove' ? (
        <TextDialog
          title="PIN attuale"
          layout="digits"
          secure
          maxLength={8}
          confirmLabel={dialog === 'pin-current-remove' ? 'Rimuovi' : 'Avanti'}
          busy={busy}
          error={error}
          onCancel={close}
          onSubmit={pin => {
            if (dialog === 'pin-current-change') {
              currentPin.current = pin;
              setDialog('pin-new');
              return;
            }
            run(async () => {
              const r = await mycelium.setProfilePin(profile.profileId, pin, '');
              updateProfile({...profile, pinProtected: r.pinProtected});
            }, 'PIN rimosso.');
          }}
        />
      ) : dialog === 'pin-new' ? (
        <TextDialog
          title="Nuovo PIN"
          message="Da 4 a 8 cifre."
          layout="digits"
          secure
          maxLength={8}
          busy={busy}
          error={error}
          onCancel={() => {
            currentPin.current = '';
            close();
          }}
          onSubmit={pin => {
            if (pin.length < 4) {
              setError('Il PIN deve avere almeno 4 cifre.');
              return;
            }
            run(async () => {
              const r = await mycelium.setProfilePin(profile.profileId, currentPin.current, pin);
              currentPin.current = '';
              updateProfile({...profile, pinProtected: r.pinProtected});
            }, 'PIN salvato.');
          }}
        />
      ) : dialog === 'default-set' ? (
        <ConfirmDialog
          title="Impostare come predefinito?"
          message="All'avvio l'app entrerà direttamente con questo profilo, saltando la schermata di selezione."
          confirmLabel="Imposta"
          onCancel={close}
          onConfirm={() => run(() => setDefaultProfile(profile.profileId))}
        />
      ) : dialog === 'default-blocked' ? (
        <ConfirmDialog
          title="Predefinito già assegnato"
          message={`«${otherDefault}» è già impostato come profilo predefinito. Per usare questo profilo, disattiva prima il predefinito dalle impostazioni di «${otherDefault}».`}
          confirmLabel="Ho capito"
          onCancel={close}
          onConfirm={close}
        />
      ) : dialog === 'forget' ? (
        <ConfirmDialog
          title="Dimenticare questo dispositivo?"
          message="Uscirai dal profilo, che non sarà più quello predefinito: per rientrare su questo dispositivo servirà di nuovo il PIN."
          confirmLabel="Dimentica"
          onCancel={close}
          onConfirm={() => run(() => forgetDevice(profile.profileId))}
        />
      ) : dialog === 'switch' ? (
        <ConfirmDialog
          title="Cambiare profilo?"
          message="Tornerai alla schermata dei profili."
          confirmLabel="Cambia profilo"
          onCancel={close}
          onConfirm={exitProfile}
        />
      ) : dialog === 'delete' ? (
        <ConfirmDialog
          title="Eliminare questo profilo?"
          message={`«${profile.name}» verrà eliminato con i suoi progressi e le sue preferenze. Non si può annullare.`}
          confirmLabel="Elimina"
          destructive
          onCancel={close}
          onConfirm={() =>
            run(async () => {
              await mycelium.deleteProfile(profile.profileId);
              await profileDeleted(profile.profileId);
            })
          }
        />
      ) : null}
      {error && (dialog === 'forget' || dialog === 'delete') ? <Note text={error} /> : null}
    </>
  );
}

const styles = scaledStyles({
  hero: {flexDirection: 'row', alignItems: 'center', gap: space.m, marginTop: space.s},
  heroName: {color: colors.textHigh, fontSize: font.title, fontWeight: '700'},
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    padding: space.l,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {color: colors.textHigh, fontSize: font.title * 0.8, fontWeight: '700', marginBottom: space.m},
  grid: {flexDirection: 'row', flexWrap: 'wrap', width: 5 * 140, gap: 0},
  cell: {width: 140, height: 140, alignItems: 'center', justifyContent: 'center', borderRadius: 70, borderWidth: 4, borderColor: 'transparent'},
  cellSelected: {borderColor: 'rgba(124,106,247,0.6)'},
  cellFocused: {borderColor: colors.textHigh},
});
