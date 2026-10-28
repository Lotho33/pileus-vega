import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import {Avatar} from '../components/Avatar';
import {FocusButton} from '../components/FocusButton';
import {CenteredScreen} from '../components/Screen';
import {OnScreenKeyboard} from '../components/OnScreenKeyboard';
import {TextField} from '../components/TextField';
import {mycelium} from '../core/api';
import type {ProfileResponse} from '../gen/auth';
import {errorText, useAuth} from '../state/auth';
import {colors, font, px, scaledStyles, space} from '../theme';

function ProfileTile({
  p,
  preferred,
  onPress,
}: {
  p: ProfileResponse;
  preferred: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
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
}

export function ProfilesScreen() {
  const {session, selectProfile, changeServer} = useAuth();
  const [profiles, setProfiles] = useState<ProfileResponse[] | null>(null);
  const [error, setError] = useState('');
  const [pinFor, setPinFor] = useState<ProfileResponse | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

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

  return (
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
                p={p}
                preferred={
                  session.lastProfileId
                    ? p.profileId === session.lastProfileId
                    : i === 0
                }
                onPress={() => choose(p)}
              />
            ))}
          </View>
          <FocusButton label="Cambia server" onPress={changeServer} style={{marginTop: px(space.l)}} />
        </>
      )}
    </CenteredScreen>
  );
}

const styles = scaledStyles({
  row: {flexDirection: 'row', gap: space.l, flexWrap: 'wrap', justifyContent: 'center'},
  pin: {width: 360},
  tile: {alignItems: 'center', width: 220},
  tileFocused: {transform: [{scale: 1.08}]},
  ring: {borderRadius: 90, borderWidth: 4, borderColor: 'transparent', padding: 6},
  ringFocused: {borderColor: colors.textHigh},
  name: {color: colors.textMid, fontSize: font.body, marginTop: space.s},
  nameFocused: {color: colors.textHigh, fontWeight: '700'},
});
