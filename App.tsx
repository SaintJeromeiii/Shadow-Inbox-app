import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import PressStartScreen from './src/screens/PressStartScreen';
import CharacterSelectScreen from './src/screens/CharacterSelectScreen';
import QuantumRealmTransitionScreen from './src/screens/QuantumRealmTransitionScreen';
import AppShell from './src/screens/AppShell';
import { AccountProvider } from './src/context/AccountContext';
import { CharacterProvider, useCharacter } from './src/context/CharacterContext';
import { RetroFeedbackProvider, preloadRetroSounds } from './src/context/RetroFeedbackContext';
import NotificationBootstrap from './src/components/NotificationBootstrap';
import ArcadeGridBackground from './src/components/ArcadeGridBackground';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { arcadeColors } from './src/theme/arcadeTheme';
import { shouldEnterQuantumRealm } from './src/utils/characterTransition';

WebBrowser.maybeCompleteAuthSession();

function AppSession() {
  const [sessionStarted, setSessionStarted] = useState(false);
  const [fighterConfirmed, setFighterConfirmed] = useState(false);
  const [showQuantumTransition, setShowQuantumTransition] = useState(false);
  const { characterId, ready: characterReady, selectCharacter } = useCharacter();

  if (!characterReady) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={arcadeColors.neonCyan} size="large" />
      </View>
    );
  }

  if (!sessionStarted) {
    return <PressStartScreen onStart={() => setSessionStarted(true)} />;
  }

  if (!fighterConfirmed) {
    if (showQuantumTransition) {
      return (
        <QuantumRealmTransitionScreen
          onComplete={() => {
            setShowQuantumTransition(false);
            setFighterConfirmed(true);
          }}
        />
      );
    }

    return (
      <CharacterSelectScreen
        variant="intro"
        initialCharacterId={characterId}
        onConfirm={(nextCharacterId) => {
          void selectCharacter(nextCharacterId).then(() => {
            if (shouldEnterQuantumRealm(nextCharacterId)) {
              setShowQuantumTransition(true);
            } else {
              setFighterConfirmed(true);
            }
          });
        }}
      />
    );
  }

  return (
    <RetroFeedbackProvider>
      <NotificationBootstrap />
      <AppShell />
    </RetroFeedbackProvider>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ PressStart2P_400Regular });
  const [soundsReady, setSoundsReady] = useState(false);

  useEffect(() => {
    void preloadRetroSounds().finally(() => setSoundsReady(true));
  }, []);

  if (!fontsLoaded || !soundsReady) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={arcadeColors.neonCyan} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <CharacterProvider>
        <AccountProvider>
          <ArcadeGridBackground>
            <AppSession />
          </ArcadeGridBackground>
        </AccountProvider>
      </CharacterProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: arcadeColors.bgDeep,
  },
});
