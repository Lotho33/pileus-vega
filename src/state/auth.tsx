// Auth/connection flow: connect → pairing → profile → home.
// The Vega counterpart of pileus-player's AuthBloc, reduced to what the
// first screens need.

import React, {createContext, useCallback, useContext, useEffect, useState} from 'react';
import type {ProfileResponse} from '../gen/auth';
import {mycelium} from '../core/api';
import {loadLanguageMemory, setLanguageProfile} from '../core/language';
import {loadRecentSearches} from '../core/recentSearches';
import {GrpcError, GrpcStatus} from '../core/grpcWeb';
import {originFor, parseServerAddressInput} from '../core/serverAddress';
import {DeviceSession, emptySession, readSession, uuidV4, writeSession} from '../core/session';

export type Phase = 'booting' | 'connect' | 'pairing' | 'profiles' | 'home';

// Renew the 30-day device JWT when less than a week is left: a re-pair
// would wipe every PIN trust this device holds on mycelium.
const REFRESH_MARGIN_SECS = 7 * 24 * 3600;

interface AuthState {
  phase: Phase;
  session: DeviceSession;
  profile: ProfileResponse | null;
  connect(input: string): Promise<void>;
  pair(code: string): Promise<void>;
  selectProfile(p: ProfileResponse): void;
  exitProfile(): void;
  /**
   * "Dimentica questo dispositivo": drops this device's trust and session on
   * the profile, un-sets it as the default and goes back to the picker
   * (without asking for the PIN there), like AuthBloc._onForgetDevice.
   */
  forgetDevice(profileId: string): Promise<void>;
  /** The profile was deleted: leave it and un-set it as the default. */
  profileDeleted(profileId: string): Promise<void>;
  changeServer(): Promise<void>;
  /** The active profile changed server-side (rename, avatar, preferences). */
  updateProfile(p: ProfileResponse): void;
  /** Sets (or with '' clears) the device's default profile. */
  setDefaultProfile(profileId: string): Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useAuth outside AuthProvider');
  }
  return v;
}

export function errorText(e: unknown): string {
  if (e instanceof GrpcError) {
    switch (e.code) {
      case GrpcStatus.UNAVAILABLE:
      case GrpcStatus.DEADLINE_EXCEEDED:
        return 'Server non raggiungibile. Controlla indirizzo e rete.';
      case GrpcStatus.UNAUTHENTICATED:
      case GrpcStatus.PERMISSION_DENIED:
        return 'Codice non valido o scaduto. Generane uno nuovo dalla dashboard.';
      case GrpcStatus.RESOURCE_EXHAUSTED:
        return 'Troppi tentativi. Riprova tra qualche minuto.';
      default:
        return e.message;
    }
  }
  return String(e);
}

function applySession(s: DeviceSession) {
  mycelium.setOrigin(originFor(parseServerAddressInput(s.serverInput)));
  mycelium.creds.jwt = s.deviceJwt;
}

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [phase, setPhase] = useState<Phase>('booting');
  const [session, setSession] = useState<DeviceSession>(emptySession());
  const [profile, setProfile] = useState<ProfileResponse | null>(null);

  const save = useCallback(async (s: DeviceSession) => {
    setSession(s);
    await writeSession(s);
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([loadLanguageMemory(), loadRecentSearches()]);
      const s = await readSession();
      setSession(s);
      if (!s.serverInput) {
        setPhase('connect');
        return;
      }
      applySession(s);
      if (!s.deviceJwt) {
        setPhase('pairing');
        return;
      }
      const now = Date.now() / 1000;
      if (s.expiresAt > 0 && s.expiresAt <= now) {
        setPhase('pairing');
        return;
      }
      if (s.expiresAt > 0 && s.expiresAt - now < REFRESH_MARGIN_SECS) {
        try {
          const r = await mycelium.refreshToken();
          const next = {...s, deviceJwt: r.deviceJwt, expiresAt: r.expiresAt};
          applySession(next);
          await save(next);
        } catch (e) {
          if (e instanceof GrpcError && e.code === GrpcStatus.UNAUTHENTICATED) {
            setPhase('pairing');
            return;
          }
          // Offline or server down: keep the still-valid token.
        }
      }
      // Default profile: straight in, unless its PIN isn't unlocked on this
      // device (then the picker asks for it, as in pileus-player).
      if (s.defaultProfileId) {
        try {
          const list = await mycelium.listProfiles();
          const p = list.find(x => x.profileId === s.defaultProfileId);
          if (p && (!p.pinProtected || p.unlocked)) {
            mycelium.setProfile(p.profileId);
            setLanguageProfile(p.profileId);
            setProfile(p);
            setPhase('home');
            return;
          }
        } catch {
          // Unreachable server: the picker shows the error and a retry.
        }
      }
      setPhase('profiles');
    })();
  }, [save]);

  const connect = useCallback(
    async (input: string) => {
      const addr = parseServerAddressInput(input);
      if (!addr.host) {
        throw new Error('Inserisci un indirizzo');
      }
      mycelium.setOrigin(originFor(addr));
      await mycelium.probe();
      const s: DeviceSession = {
        ...emptySession(),
        // Same installation id across servers.
        deviceId: session.deviceId || uuidV4(),
        serverInput: input.trim(),
      };
      await save(s);
      setPhase('pairing');
    },
    [save, session.deviceId],
  );

  const pair = useCallback(
    async (code: string) => {
      let s = session;
      if (!s.deviceId) {
        s = {...s, deviceId: uuidV4()};
        await save(s);
      }
      const r = await mycelium.authorizeDevice(s.deviceId, code.trim());
      const next = {...s, deviceJwt: r.deviceJwt, expiresAt: r.expiresAt};
      applySession(next);
      await save(next);
      setPhase('profiles');
    },
    [save, session],
  );

  const selectProfile = useCallback(
    (p: ProfileResponse) => {
      mycelium.setProfile(p.profileId);
      setLanguageProfile(p.profileId);
      setProfile(p);
      save({...session, lastProfileId: p.profileId});
      setPhase('home');
    },
    [save, session],
  );

  const exitProfile = useCallback(() => {
    mycelium.setProfile('');
    setLanguageProfile('');
    setProfile(null);
    setPhase('profiles');
  }, []);

  const clearDefaultIf = useCallback(
    async (profileId: string) => {
      if (session.defaultProfileId === profileId) {
        await save({...session, defaultProfileId: ''});
      }
    },
    [save, session],
  );

  const forgetDevice = useCallback(
    async (profileId: string) => {
      // Best-effort, like pileus-player's AuthRepository.lockProfile: an
      // unreachable server must not keep the user inside the profile.
      mycelium.releasePlayback().catch(() => {});
      try {
        await mycelium.lockProfile(profileId, true);
      } catch {
        // Ignored on purpose — see above.
      }
      await clearDefaultIf(profileId);
      exitProfile();
    },
    [clearDefaultIf, exitProfile],
  );

  const profileDeleted = useCallback(
    async (profileId: string) => {
      await clearDefaultIf(profileId);
      exitProfile();
    },
    [clearDefaultIf, exitProfile],
  );

  const setDefaultProfile = useCallback(
    async (profileId: string) => {
      await save({...session, defaultProfileId: profileId});
    },
    [save, session],
  );

  const updateProfile = useCallback((p: ProfileResponse) => {
    setProfile(cur => (cur && cur.profileId === p.profileId ? {...cur, ...p} : cur));
  }, []);

  const changeServer = useCallback(async () => {
    // Best-effort: never block leaving a dead server.
    if (session.deviceJwt) {
      mycelium.unpairSelf().catch(() => {});
    }
    mycelium.creds.jwt = '';
    mycelium.setProfile('');
    setLanguageProfile('');
    setProfile(null);
    await save({...emptySession(), deviceId: session.deviceId});
    setPhase('connect');
  }, [save, session]);

  return (
    <Ctx.Provider
      value={{
        phase,
        session,
        profile,
        connect,
        pair,
        selectProfile,
        exitProfile,
        forgetDevice,
        profileDeleted,
        changeServer,
        updateProfile,
        setDefaultProfile,
      }}>
      {children}
    </Ctx.Provider>
  );
}
