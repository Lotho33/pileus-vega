// "Chi sta guardando?": the server's profiles, PIN entry, and "Nuovo
// profilo" (profile_selection_screen.dart): a name typed on the on-screen
// keyboard, then "Avatar di <nome>" — the initial (preselected) or one of the
// built-in avatars. OK on a tile creates the profile; Back or "Annulla" at
// either step drops the whole creation.

import React, {forwardRef, useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Dimensions, Image, Pressable, StyleSheet, View} from 'react-native';
import {Text} from '../components/Text';
import {Avatar} from '../components/Avatar';
import {AvatarPicker} from '../components/AvatarPicker';
import {Icon} from '../components/Icon';
import {captionFont} from '../home/layout';
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

// profile_selection_screen.dart, in units of its 540-tall TV canvas (k):
// a 110-unit square, radius 16 (13 for the picture inside a 3-unit border in
// the profile's accent color), 14 units to the name, focus scale 1.07.
const ACCENTS = ['#7C6AF7', '#4FC3F7', '#E040FB', '#26A69A', '#EF5350'];
function accentFor(name: string): string {
  let h = 0;
  for (const ch of name) {
    h = (h * 31 + (ch.codePointAt(0) ?? 0)) | 0;
  }
  return ACCENTS[Math.abs(h) % ACCENTS.length];
}

const ProfileTile = forwardRef<View, {p: ProfileResponse; k: number; preferred: boolean; onPress: () => void}>(
  function ProfileTile({p, k, preferred, onPress}, ref) {
    const [focused, setFocused] = useState(false);
    const size = 110 * k;
    return (
      <Pressable
        ref={ref}
        testID={`profile-${p.profileId}`}
        accessibilityLabel={p.name}
        hasTVPreferredFocus={preferred}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPress={onPress}
        style={[styles.tile, {width: size + 6 * k}, focused && styles.tileFocused]}>
        <View>
          <View
            style={{
              borderRadius: 16 * k,
              borderWidth: 3 * k,
              borderColor: focused ? accentFor(p.name) : 'transparent',
            }}>
            <Avatar name={p.name} url={p.avatarUrl} size={size} radius={13 * k} />
          </View>
          {p.pinProtected && !p.unlocked ? (
            <View style={[styles.lock, {right: -4 * k, bottom: -4 * k, padding: 5 * k, borderWidth: 1.5 * k}]}>
              <Icon name="lock" size={16 * k} color="rgba(255,255,255,0.7)" />
            </View>
          ) : null}
        </View>
        <Text
          style={[styles.name, {marginTop: 14 * k, fontSize: captionFont(L_H())}, focused && styles.nameFocused]}
          numberOfLines={1}>
          {p.name}
        </Text>
      </Pressable>
    );
  },
);

const AddProfileTile = forwardRef<View, {k: number; onPress: () => void; preferred?: boolean}>(function AddProfileTile(
  {k, onPress, preferred},
  ref,
) {
  const [focused, setFocused] = useState(false);
  const size = 110 * k;
  return (
    <Pressable
      ref={ref}
      hasTVPreferredFocus={preferred}
      accessibilityLabel="Aggiungi profilo"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[styles.tile, {width: size + 6 * k}, focused && styles.tileFocused]}>
      <View
        style={[
          styles.add,
          {width: size + 6 * k, height: size + 6 * k, borderRadius: 16 * k, borderWidth: 3 * k},
          focused && styles.addFocused,
        ]}>
        <Icon name="add" size={size * 0.35} color={focused ? '#fff' : 'rgba(255,255,255,0.38)'} />
      </View>
      <Text style={[styles.addLabel, {marginTop: 14 * k, fontSize: captionFont(L_H())}, focused && styles.addLabelOn]}>
        Aggiungi profilo
      </Text>
    </Pressable>
  );
});

/** "Cambia server": a plain text link under the tiles. */
const TextLink = forwardRef<View, {label: string; onPress: () => void}>(function TextLink({label, onPress}, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      ref={ref}
      accessibilityLabel={label}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={styles.link}>
      <Text style={[styles.linkText, {fontSize: captionFont(L_H())}, focused && styles.linkOn]}>{label}</Text>
    </Pressable>
  );
});

const L_H = () => Dimensions.get('window').height;

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
  // profile_selection_screen.dart: a violet radial glow above the middle,
  // the title (sh·0.030, w700), 64.8/1080 to the tiles, 32/1080 to
  // "Cambia server" as a text link.
  const H = L_H();
  const k = H / 540;
  return (
    <View style={styles.fill}>
      <View style={styles.screen}>
        {/* Explicit size: absoluteFill alone left the Image at its natural
            size on Vega. */}
        <Image
          source={GLOW}
          style={[StyleSheet.absoluteFill, {width: Dimensions.get('window').width, height: H}]}
          resizeMode="stretch"
        />
        <Text style={[styles.title, {fontSize: H * 0.03}]}>Chi sta guardando?</Text>
        <View style={{height: (H * 64.8) / 1080}} />
        {profiles === null ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : profiles.length === 0 && error ? (
          // The list couldn't be read. With none on the server (a new
          // install, or the last one deleted) the row below still offers
          // "Aggiungi profilo", as _ProfileRow always does in pileus-player:
          // without it there was no way past this screen.
          <View style={styles.row}>
            <FocusButton label="Riprova" primary onPress={load} hasTVPreferredFocus />
            <FocusButton label="Cambia server" onPress={changeServer} />
          </View>
        ) : (
          <>
            <View style={[styles.row, {gap: (H * 40) / 1080}]}>
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
                  k={k}
                  preferred={session.lastProfileId ? p.profileId === session.lastProfileId : i === 0}
                  onPress={() => choose(p)}
                />
              ))}
              <AddProfileTile
                ref={addRef}
                k={k}
                preferred={profiles.length === 0}
                onPress={() => setCreating({step: 'name'})}
              />
            </View>
            <View style={{height: (H * 32) / 1080}} />
            <TextLink label="Cambia server" onPress={changeServer} />
          </>
        )}
        {error && profiles?.length ? <Text style={styles.error}>{error}</Text> : null}
      </View>
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

const GLOW = require('../../assets/image/profile_glow.png');

const styles = scaledStyles({
  fill: {flex: 1},
  screen: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg},
  title: {color: '#fff', fontWeight: '700', letterSpacing: -1},
  row: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center'},
  pin: {width: 360},
  tile: {alignItems: 'center'},
  tileFocused: {transform: [{scale: 1.07}]},
  name: {color: 'rgba(255,255,255,0.7)', fontWeight: '500', textAlign: 'center'},
  nameFocused: {color: '#fff', fontWeight: '700'},
  lock: {
    position: 'absolute',
    borderRadius: 40,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: '#1C1C2E',
  },
  add: {
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  addFocused: {borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.08)'},
  addLabel: {color: 'rgba(255,255,255,0.38)'},
  addLabelOn: {color: '#fff'},
  link: {paddingHorizontal: 16, paddingVertical: 8},
  linkText: {color: 'rgba(255,255,255,0.38)'},
  linkOn: {color: '#fff'},
  error: {color: colors.error, fontSize: font.body, marginTop: space.m, textAlign: 'center'},
});
