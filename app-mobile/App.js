import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SeparadorAuthProvider } from './src/contexts/SeparadorAuthContext';
import AppNavigator from './src/navigation/AppNavigator';

// Define como uma notificação push recebida com o app ABERTO deve se
// comportar. Sem isso, o comportamento padrão varia entre plataformas/SDKs.
// Registrado no escopo do módulo (fora do componente), como recomendado
// pela doc do expo-notifications (SDK 54) — só precisa rodar uma vez por
// processo do app, não a cada render/remontagem.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
