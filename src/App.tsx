import React, {useState} from 'react';
import {useTVEventHandler} from '@amazon-devices/react-native-kepler';
import * as perf from './core/perf';
import {AuthProvider, useAuth} from './state/auth';
import {ConnectScreen} from './screens/ConnectScreen';
import {HomeScreen} from './screens/HomeScreen';
import {PairingScreen} from './screens/PairingScreen';
import {ProfilesScreen} from './screens/ProfilesScreen';
import {BootSplash} from './screens/BootSplash';

function Root() {
  const {phase} = useAuth();
  // Any key keeps the frame monitor (fluidity, core/perf) running.
  useTVEventHandler(() => perf.activity());
  // The start-up screen, as the Android TV app's: until the app knows where
  // to go and the logo has come in.
  const [splash, setSplash] = useState(true);
  if (splash) {
    return <BootSplash ready={phase !== 'booting'} onDone={() => setSplash(false)} />;
  }
  switch (phase) {
    case 'booting':
      return <BootSplash ready={false} onDone={() => {}} />;
    case 'connect':
      return <ConnectScreen />;
    case 'pairing':
      return <PairingScreen />;
    case 'profiles':
      return <ProfilesScreen />;
    case 'home':
      return <HomeScreen />;
  }
}

export const App = () => (
  <AuthProvider>
    <Root />
  </AuthProvider>
);
