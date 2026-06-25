import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import { AccountProvider } from './src/context/AccountContext';
import { configureNotificationHandler } from './src/services/pushNotifications';

WebBrowser.maybeCompleteAuthSession();
configureNotificationHandler();

export default function App() {
  return (
    <SafeAreaProvider>
      <AccountProvider>
        <HomeScreen />
      </AccountProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
