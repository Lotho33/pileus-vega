import React from 'react';
import {ActivityIndicator, View} from 'react-native';
import {useTVEventHandler} from '@amazon-devices/react-native-kepler';
import * as perf from './core/perf';
import {AuthProvider, useAuth} from './state/auth';
import {ConnectScreen} from './screens/ConnectScreen';
import {HomeScreen} from './screens/HomeScreen';
import {PairingScreen} from './screens/PairingScreen';
import {ProfilesScreen} from './screens/ProfilesScreen';
import {colors, scaledStyles} from './theme';

function Root() {
  const {phase} = useAuth();
  // Any key keeps the frame monitor (fluidity, core/perf) running.
  useTVEventHandler(() => perf.activity());
  switch (phase) {
    case 'booting':
      return (
        <View style={styles.boot}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
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

const styles = scaledStyles({
  boot: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
