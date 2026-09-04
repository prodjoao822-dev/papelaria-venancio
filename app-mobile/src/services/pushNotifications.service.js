// Registro de push (RF-08 / P20 do plano mestre) — best-effort, NUNCA deve
// travar nem quebrar o fluxo de login: permissão negada, dispositivo sem
// suporte a push (emulador/simulador) ou falha de rede aqui só geram log
// discreto, nunca uma exceção que suba até quem chamou.
//
// Contrato de banco: RPC `registrar_push_token(p_expo_push_token, p_plataforma)`
// — security definer, resolve o dono (funcionario) internamente a partir de
// auth.uid(). Nunca passamos funcionario_id daqui. A RPC é responsabilidade
// do agente supabase-db (T3.3 rodando em paralelo) — se ela ainda não
// existir no banco, a chamada falha com erro do Postgrest e é engolida como
// qualquer outra falha de rede/best-effort (ver catch em `registrarToken`).
//
// Client ISOLADO do Separador/Entregador (separadorSupabase) — mesmo client
// usado pelos outros services deste app, nunca um client genérico.
//
// ATENÇÃO — bug real corrigido em 04/09: `expo-notifications` não pode nem
// ser IMPORTADO no Android dentro do app genérico "Expo Go" a partir do SDK
// 53. O próprio pacote lança uma exceção no escopo do módulo, não só quando
// alguma função de push é chamada explicitamente — ver
// node_modules/expo-notifications/src/DevicePushTokenAutoRegistration.fx.ts
// (chama `addPushTokenListener` no top-level, ao ser importado) e
// node_modules/expo-notifications/src/warnOfExpoGoPushUsage.ts (faz `throw`
// no Android quando `isRunningInExpoGo()` é true). Ou seja: um
// `import * as Notifications from 'expo-notifications'` estático incondicional
// no topo do arquivo já derruba o app inteiro na inicialização, mesmo que
// `registrarAposLogin` nunca seja chamado. Por isso o módulo é carregado com
// `require` tardio (dentro de uma função, nunca no topo do arquivo) e SÓ
// fora do Expo Go — detectado com `isRunningInExpoGo()` do pacote `expo`
// (a mesma função que o próprio expo-notifications usa internamente pra essa
// checagem; é mais precisa que `Constants.executionEnvironment ===
// 'storeClient'`, que também dá match numa build de desenvolvimento própria
// com expo-dev-client — onde push funciona normalmente e não deveria ser
// pulado). Isso é uma limitação de plataforma documentada pela própria Expo,
// não um bug nosso, e só deixa de acontecer quando existir uma build própria
// gerada via `eas build` (ver app.json > extra.buildIdentity.eas.projectId,
// hoje "PENDENTE").
import { Platform } from 'react-native'
import { isRunningInExpoGo } from 'expo'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { separadorSupabase } from '../supabase/separadorClient'

// Carrega `expo-notifications` só quando é seguro fazê-lo. Retorna `null`
// dentro do Expo Go (nunca chega a executar o `require`, então o `throw`
// interno do pacote nunca dispara). Fora do Expo Go isso é equivalente a um
// `import` normal — o módulo real é usado numa build própria/EAS.
function carregarNotifications() {
  if (isRunningInExpoGo()) return null
  // eslint-disable-next-line global-require -- carregamento condicional é o objetivo
  return require('expo-notifications')
}

// Necessário no Android 13+ (API 33): o prompt de permissão do sistema só
// aparece depois de existir pelo menos um canal de notificação — e
// `setNotificationChannelAsync` precisa rodar ANTES de
// `getPermissionsAsync`/`requestPermissionsAsync`/`getExpoPushTokenAsync`
// (doc SDK 57, seção "Permissions > Android"). Em iOS essa chamada é
// ignorada silenciosamente (é uma no-op fora do Android).
async function garantirCanalAndroid(Notifications) {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Geral',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
  })
}

// EAS projectId é obrigatório pra `getExpoPushTokenAsync` funcionar de
// verdade. Hoje (ver app.json > extra.buildIdentity.eas) o projeto ainda não
// tem um projectId real do EAS ("PENDENTE") — nesse estado o token nunca vai
// ser obtido, e isso é esperado, não um bug: só passa a funcionar quando
// alguém rodar `eas init` com a conta do dono.
function obterProjectId() {
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId ?? null
  if (!projectId || projectId === 'PENDENTE') return null
  return projectId
}

export const pushNotificationsService = {
  // Pede permissão (se ainda não concedida), obtém o Expo Push Token e
  // registra via RPC. Retorna o token em caso de sucesso, ou `null` em
  // qualquer cenário de "não deu, mas tudo bem" (sem permissão, sem
  // projectId, sem dispositivo físico, Expo Go, erro de rede/RPC). Nunca
  // lança.
  async registrarAposLogin() {
    try {
      // Expo Go (SDK 53+) não suporta push remoto no Android nem oferece um
      // fluxo utilizável no iOS — ver bloco de comentário no topo do
      // arquivo. Pular aqui é o comportamento correto e esperado até existir
      // uma build própria via `eas build`; não é uma falha.
      if (isRunningInExpoGo()) {
        console.log(
          '[push] rodando no Expo Go — push remoto não é suportado pelo Expo Go desde o SDK 53. ' +
            'Isso é esperado; vai funcionar normalmente numa build própria (eas build). Pulando registro.'
        )
        return null
      }

      // Push (remoto) não funciona em emulador/simulador sem configuração
      // nativa extra — pedir permissão e tentar token nesse caso só gera
      // ruído/erro sem utilidade nenhuma pro protótipo em desenvolvimento.
      if (!Device.isDevice) {
        console.log('[push] dispositivo não físico — pulando registro de push.')
        return null
      }

      const Notifications = carregarNotifications()
      if (!Notifications) return null

      await garantirCanalAndroid(Notifications)

      const { status: statusAtual } = await Notifications.getPermissionsAsync()
      let status = statusAtual
      if (status !== 'granted') {
        const resposta = await Notifications.requestPermissionsAsync()
        status = resposta.status
      }
      if (status !== 'granted') {
        console.log('[push] permissão de notificação negada — seguindo sem push.')
        return null
      }

      const projectId = obterProjectId()
      if (!projectId) {
        console.log('[push] EAS projectId ainda não configurado — seguindo sem push.')
        return null
      }

      const { data } = await Notifications.getExpoPushTokenAsync({ projectId })
      const token = data
      if (!token) return null

      await this.registrarToken(token)
      return token
    } catch (err) {
      // Best-effort: qualquer falha aqui (permissão, rede, RPC ainda não
      // existir no banco, etc.) nunca deve impedir o login.
      console.log('[push] falha ao registrar push (ignorada, best-effort):', err?.message ?? err)
      return null
    }
  },

  // Isolado do fluxo de permissão/token acima só pra ficar testável sem
  // mockar `expo-notifications`/`expo-device` inteiros — cobre exatamente o
  // contrato com o banco (nome da RPC, nome dos parâmetros).
  async registrarToken(expoPushToken) {
    const { data, error } = await separadorSupabase.rpc('registrar_push_token', {
      p_expo_push_token: expoPushToken,
      p_plataforma: Platform.OS,
    })
    if (error) throw error
    return data
  },
}
