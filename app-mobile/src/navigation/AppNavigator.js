import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator } from 'react-native';
import LoginScreen from '../features/auth/LoginScreen';
import HomeScreen from '../features/inicio/HomeScreen';
import PainelScreen from '../features/solicitacoes/PainelScreen';
import DetalheSolicitacaoScreen from '../features/solicitacoes/DetalheSolicitacaoScreen';
import ConfirmacaoEnvioScreen from '../features/solicitacoes/ConfirmacaoEnvioScreen';
import ChatSolicitacaoScreen from '../features/solicitacoes/ChatSolicitacaoScreen';
import NotificacoesScreen from '../features/notificacoes/NotificacoesScreen';
import PerfilScreen from '../features/perfil/PerfilScreen';
import PainelEntregasScreen from '../features/entregas/PainelEntregasScreen';
import DetalheEntregaScreen from '../features/entregas/DetalheEntregaScreen';
import { useSeparadorAuth } from '../contexts/SeparadorAuthContext';
import { colors } from '../theme/colors';
import { HomeIcon, ListaIcon, PerfilIcon, CaminhaoIcon } from '../components/icons';

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const InicioStack = createNativeStackNavigator();
const SolicitacoesStack = createNativeStackNavigator();
const EntregasStack = createNativeStackNavigator();
const PerfilStack = createNativeStackNavigator();

// Telas com cabeçalho próprio no design (Home, Painel, Detalhe,
// ConfirmacaoEnvio, ChatSolicitacao) escondem o header nativo do Stack;
// Notificações é a única que ainda não tem layout de cabeçalho customizado
// e continua usando o header nativo por ora.
const screenOptionsComHeaderNativo = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: 'bold' },
};

function InicioStackNavigator() {
  return (
    <InicioStack.Navigator screenOptions={screenOptionsComHeaderNativo}>
      <InicioStack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <InicioStack.Screen name="Notificacoes" component={NotificacoesScreen} options={{ title: 'Notificações' }} />
    </InicioStack.Navigator>
  );
}

function SolicitacoesStackNavigator() {
  return (
    <SolicitacoesStack.Navigator screenOptions={screenOptionsComHeaderNativo}>
      <SolicitacoesStack.Screen name="Painel" component={PainelScreen} options={{ headerShown: false }} />
      <SolicitacoesStack.Screen
        name="DetalheSolicitacao"
        component={DetalheSolicitacaoScreen}
        options={{ headerShown: false }}
      />
      <SolicitacoesStack.Screen
        name="ConfirmacaoEnvio"
        component={ConfirmacaoEnvioScreen}
        options={{ headerShown: false }}
      />
      <SolicitacoesStack.Screen
        name="ChatSolicitacao"
        component={ChatSolicitacaoScreen}
        options={{ headerShown: false }}
      />
    </SolicitacoesStack.Navigator>
  );
}

function EntregasStackNavigator() {
  return (
    <EntregasStack.Navigator screenOptions={screenOptionsComHeaderNativo}>
      <EntregasStack.Screen name="PainelEntregas" component={PainelEntregasScreen} options={{ headerShown: false }} />
      <EntregasStack.Screen
        name="DetalheEntrega"
        component={DetalheEntregaScreen}
        options={{ headerShown: false }}
      />
    </EntregasStack.Navigator>
  );
}

function PerfilStackNavigator() {
  return (
    <PerfilStack.Navigator screenOptions={screenOptionsComHeaderNativo}>
      <PerfilStack.Screen name="PerfilTela" component={PerfilScreen} options={{ headerShown: false }} />
    </PerfilStack.Navigator>
  );
}

// Tabs visíveis dependem de `funcionario.papeis` (array — um funcionário
// pode ter os dois papéis ao mesmo tempo, ex: loja pequena onde a mesma
// pessoa separa e entrega). Não existe tela de "escolha de papel": as tabs
// condicionais já resolvem isso — só aparece o que o funcionário pode
// operar. "Início" e "Perfil" continuam universais (não são específicas de
// papel).
function TabsAutenticadas() {
  const { funcionario } = useSeparadorAuth();
  const papeis = funcionario?.papeis ?? [];
  const ehSeparador = papeis.includes('separacao');
  const ehEntregador = papeis.includes('entrega');

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textoTerciario,
        tabBarStyle: {
          backgroundColor: colors.superficie,
          borderTopColor: colors.borda,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '700' },
      }}
    >
      <Tab.Screen
        name="Início"
        component={InicioStackNavigator}
        options={{
          tabBarIcon: ({ color, size }) => <HomeIcon size={size} color={color} />,
        }}
      />
      {ehSeparador && (
        <Tab.Screen
          name="Solicitações"
          component={SolicitacoesStackNavigator}
          options={{
            tabBarIcon: ({ color, size }) => <ListaIcon size={size} color={color} />,
          }}
        />
      )}
      {ehEntregador && (
        <Tab.Screen
          name="Entregas"
          component={EntregasStackNavigator}
          options={{
            tabBarIcon: ({ color, size }) => <CaminhaoIcon size={size} color={color} />,
          }}
        />
      )}
      <Tab.Screen
        name="Perfil"
        component={PerfilStackNavigator}
        options={{
          tabBarIcon: ({ color, size }) => <PerfilIcon size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { session, carregando } = useSeparadorAuth();

  // Enquanto a sessão é restaurada do storage (LargeSecureStore), ainda não
  // sabemos se o funcionário está logado — evita piscar a tela de Login
  // antes de decidir a rota inicial. Não bloqueia aqui esperando
  // `funcionario` (que traz `papeis`, usado pelas tabs condicionais em
  // TabsAutenticadas): entre o setSession() do login e o SELECT em
  // `funcionarios` resolver, pode haver um frame só com Início/Perfil
  // visíveis (funcionario ainda null) — preferível a travar o app inteiro
  // num spinner sem saída caso esse SELECT falhe (deixaria o usuário sem
  // conseguir nem abrir Perfil pra deslogar).
  if (carregando) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.fundo }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <RootStack.Screen name="App" component={TabsAutenticadas} />
        ) : (
          <RootStack.Screen name="Login" component={LoginScreen} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
