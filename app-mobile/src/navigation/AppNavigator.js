import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../features/auth/LoginScreen';
import PainelScreen from '../features/solicitacoes/PainelScreen';
import DetalheSolicitacaoScreen from '../features/solicitacoes/DetalheSolicitacaoScreen';
import NotificacoesScreen from '../features/notificacoes/NotificacoesScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName="Login"
        screenOptions={{
          headerStyle: { backgroundColor: '#1B5FAE' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen 
          name="Login" 
          component={LoginScreen} 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="Painel" 
          component={PainelScreen} 
          options={({ navigation }) => ({
            title: 'Solicitações',
            headerBackVisible: false,
          })}
        />
        <Stack.Screen 
          name="DetalheSolicitacao" 
          component={DetalheSolicitacaoScreen} 
          options={{ title: 'Detalhe da Solicitação' }} 
        />
        <Stack.Screen 
          name="Notificacoes" 
          component={NotificacoesScreen} 
          options={{ title: 'Notificações' }} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
