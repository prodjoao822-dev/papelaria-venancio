import { StatusBar } from 'expo-status-bar';
import { isRunningInExpoGo } from 'expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SeparadorAuthProvider } from './src/contexts/SeparadorAuthContext';
import { OperadorAuthProvider } from './src/contexts/OperadorAuthContext';
import AppNavigator from './src/navigation/AppNavigator';

// BUG REAL corrigido em 04/09: `expo-notifications` não pode nem ser
// IMPORTADO no Android dentro do Expo Go a partir do SDK 53 — o pacote
// lança uma exceção no escopo do próprio módulo (ver
// node_modules/expo-notifications/src/DevicePushTokenAutoRegistration.fx.ts,
// que chama `addPushTokenListener` no top-level ao ser importado, e
// warnOfExpoGoPushUsage.ts, que faz `throw` no Android quando
// `isRunningInExpoGo()` é true). Um `import * as Notifications from
// 'expo-notifications'` estático aqui — que era exatamente o que existia
// antes — já derrubava o app inteiro na inicialização, antes de qualquer
// tela renderizar e antes até de existir chance de chamar
// `pushNotificationsService`. Por isso o `require` é tardio e condicional:
// só acontece fora do Expo Go. Dentro do Expo Go isso é esperado (limitação
// de plataforma documentada pela própria Expo) e só deixa de acontecer numa
// build própria via `eas build` (ver app.json > extra.buildIdentity.eas.projectId).
if (!isRunningInExpoGo()) {
  // eslint-disable-next-line global-require -- carregamento condicional é o objetivo
  const Notifications = require('expo-notifications');
  // Define como uma notificação push recebida com o app ABERTO deve se
  // comportar. Sem isso, o comportamento padrão varia entre plataformas/SDKs.
  // Registrado no escopo do módulo (fora do componente), como recomendado
  // pela doc do expo-notifications (SDK 57) — só precisa rodar uma vez por
  // processo do app, não a cada render/remontagem.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} else {
  console.log(
    '[push] rodando no Expo Go — pulando setNotificationHandler (push remoto não é suportado pelo Expo Go desde o SDK 53; funciona normalmente numa build própria via `eas build`).'
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SeparadorAuthProvider>
        <OperadorAuthProvider>
          <AppNavigator />
        </OperadorAuthProvider>
      </SeparadorAuthProvider>
      <StatusBar style="light" backgroundColor="#1B5FAE" />
    </SafeAreaProvider>
  );
}
