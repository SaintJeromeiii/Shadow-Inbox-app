import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import { AccountProvider } from './src/context/AccountContext';
import NotificationBootstrap from './src/components/NotificationBootstrap';

WebBrowser.maybeCompleteAuthSession();

export default function App() {
  return (
    <SafeAreaProvider>
      <AccountProvider>
        <NotificationBootstrap />
        <HomeScreen />
      </AccountProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
