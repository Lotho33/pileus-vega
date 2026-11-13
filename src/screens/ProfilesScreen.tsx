// "Chi sta guardando?": the server's profiles, PIN entry, and "Nuovo
// profilo" (profile_selection_screen.dart): a name typed on the on-screen
// keyboard, then "Avatar di <nome>" — the initial (preselected) or one of the
// built-in avatars. OK on a tile creates the profile; Back or "Annulla" at
// either step drops the whole creation.

import React, {forwardRef, useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import {Avatar} from '../components/Avatar';
import {AvatarPicker} from '../components/AvatarPicker';
import {FocusButton} from '../components/FocusButton';
import {CenteredScreen} from '../components/Screen';
import {OnScreenKeyboard} from '../components/OnScreenKeyboard';
import {TextField} from '../components/TextField';
import {mycelium} from '../core/api';
import {focusSoon} from '../core/focus';
import {TextDialog} from '../settings/TextDialog';
import type {ProfileResponse} from '../gen/auth';
import {errorText, useAuth} from '../state/auth';
import {colors, font, px, scaledStyles, space} from '../theme';

const ProfileTile = forwardRef<View, {p: ProfileResponse; preferred: boolean; onPress: () => void}>(
  function ProfileTile({p, preferred, onPress}, ref) {
    const [focused, setFocused] = useState(false);
    return (
      <Pressable
        ref={ref}
        testID={`profile-${p.profileId}`}
        accessibilityLabel={p.name}
        hasTVPreferredFocus={preferred}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPress={onPress}
        style={[styles.tile, focused && styles.tileFocused]}>
        <View style={[styles.ring, focused && styles.ringFocused]}>
          <Avatar name={p.name} url={p.avatarUrl} size={px(160)} />
        </View>
        <Text style={[styles.name, focused && styles.nameFocused]} numberOfLines={1}>
          {p.name}
          {p.pinProtected && !p.unlocked ? '  🔒' : ''}
        </Text>
      </Pressable>
    );
  },
);

const AddProfileTile = forwardRef<View, {onPress: () => void}>(function AddProfileTile({onPress}, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      ref={ref}
      accessibilityLabel="Nuovo profilo"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[styles.tile, focused && styles.tileFocused]}>
      <View style={[styles.ring, focused && styles.ringFocused]}>
        <View style={styles.add}>
          <Text style={[styles.plus, focused && styles.nameFocused]}>+</Text>
        </View>
      </View>
      <Text style={[styles.name, focused && styles.nameFocused]} numberOfLines={1}>
        Nuovo profilo
      </Text>
    </Pressable>
  );
});

export function ProfilesScreen() {
  const {session, selectProfile, changeServer} = useAuth();
  const [profiles, setProfiles] = useState<ProfileResponse[] | null>(null);
  const [error, setError] = useState('');
  const [pinFor, setPinFor] = useState<ProfileResponse | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  // Profile creation: the name step, then the avatar step for that name.
  const [creating, setCreating] = useState<null | {step: 'name'} | {step: 'avatar'; name: string}>(null);
  const tiles = useRef(new Map<string, View>());
  const addRef = useRef<View>(null);

  const load = useCallback(async () => {
    setError('');
    setProfiles(null);
    try {
      setProfiles(await mycelium.listProfiles());
    } catch (e) {
      setError(errorText(e));
      setProfiles([]);
    }
  }, []);

  // Where focus goes once the creation steps are gone.
  const focusAfter = (profileId: string) =>
    focusSoon(() => (profileId ? tiles.current.get(profileId) : null) ?? addRef.current);

  const cancelCreate = () => {
    setCreating(null);
    focusAfter('');
  };

  const create = async (name: string, avatar: string) => {
    setBusy(true);
    setError('');
    try {
      const p = await mycelium.createProfile(name, avatar);
      setCreating(null);
      setProfiles(await mycelium.listProfiles());
      focusAfter(p.profileId);
    } catch (e) {
      setCreating(null);
      setError(errorText(e));
      focusAfter('');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const choose = (p: ProfileResponse) => {
    if (p.pinProtected && !p.unlocked) {
      setPin('');
      setError('');
      setPinFor(p);
      return;
    }
    selectProfile(p);
  };

  const unlock = async (remember: boolean) => {
    if (!pinFor || !pin) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      // The session token must be bound to this profile before the call.
      mycelium.setProfile(pinFor.profileId);
      await mycelium.unlockProfile(pinFor.profileId, pin, remember);
      selectProfile(pinFor);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (pinFor) {
    return (
      <CenteredScreen title={pinFor.name} subtitle="Inserisci il PIN del profilo" error={error}>
        <TextField value={pin} placeholder="PIN" secure center style={styles.pin} />
        <OnScreenKeyboard
          value={pin}
          onChange={setPin}
          layout="digits"
          onSubmit={() => unlock(false)}
          maxLength={8}
          width={px(360)}
          takeFocus
        />
        <View style={styles.row}>
          <FocusButton label="Solo questa volta" primary busy={busy} onPress={() => unlock(false)} />
          <FocusButton label="Ricorda dispositivo" busy={busy} onPress={() => unlock(true)} />
          <FocusButton label="Annulla" onPress={() => setPinFor(null)} />
        </View>
      </CenteredScreen>
    );
  }

  // The creation steps are full-screen overlays, outside the centered column.
  return (
    <View style={styles.fill}>
      <CenteredScreen title="Chi sta guardando?" error={error}>
        {profiles === null ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : profiles.length === 0 ? (
          <View style={styles.row}>
            <FocusButton label="Riprova" primary onPress={load} hasTVPreferredFocus />
            <FocusButton label="Cambia server" onPress={changeServer} />
          </View>
        ) : (
          <>
            <View style={styles.row}>
              {profiles.map((p, i) => (
                <ProfileTile
                  key={p.profileId}
                  ref={(v: View | null) => {
                    if (v) {
                      tiles.current.set(p.profileId, v);
                    } else {
                      tiles.current.delete(p.profileId);
                    }
                  }}
                  p={p}
                  preferred={session.lastProfileId ? p.profileId === session.lastProfileId : i === 0}
                  onPress={() => choose(p)}
                />
              ))}
              <AddProfileTile ref={addRef} onPress={() => setCreating({step: 'name'})} />
            </View>
            <FocusButton label="Cambia server" onPress={changeServer} style={{marginTop: px(space.l)}} />
          </>
        )}
      </CenteredScreen>
      {creating?.step === 'name' ? (
        <TextDialog
          title="Nuovo profilo"
          placeholder="Nome"
          maxLength={32}
          confirmLabel="Avanti"
          onCancel={cancelCreate}
          onSubmit={name => setCreating({step: 'avatar', name})}
        />
      ) : creating?.step === 'avatar' ? (
        <AvatarPicker
          title={`Avatar di ${creating.name}`}
          name={creating.name}
          current=""
          offerInitial
          onCancel={cancelCreate}
          onPick={url => !busy && create(creating.name, url)}
        />
      ) : null}
    </View>
  );
}

const styles = scaledStyles({
  fill: {flex: 1},
  row: {flexDirection: 'row', gap: space.l, flexWrap: 'wrap', justifyContent: 'center'},
  pin: {width: 360},
  tile: {alignItems: 'center', width: 220},
  tileFocused: {transform: [{scale: 1.08}]},
  ring: {borderRadius: 90, borderWidth: 4, borderColor: 'transparent', padding: 6},
  ringFocused: {borderColor: colors.textHigh},
  name: {color: colors.textMid, fontSize: font.body, marginTop: space.s},
  nameFocused: {color: colors.textHigh, fontWeight: '700'},
  add: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  plus: {color: colors.textMid, fontSize: 72, fontWeight: '300'},
});
