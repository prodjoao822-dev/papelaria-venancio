import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SeparadorAuthProvider } from './src/contexts/SeparadorAuthContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <SeparadorAuthProvider>
        <AppNavigator />
      </SeparadorAuthProvider>
      <StatusBar style="light" backgroundColor="#1B5FAE" />
    </SafeAreaProvider>
  );
}
