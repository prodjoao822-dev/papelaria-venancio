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
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { separadorSupabase } from '../supabase/separadorClient'

// Necessário no Android 13+ (API 33): o prompt de permissão do sistema só
// aparece depois de existir pelo menos um canal de notificação — e
// `setNotificationChannelAsync` precisa rodar ANTES de
// `getPermissionsAsync`/`requestPermissionsAsync`/`getExpoPushTokenAsync`
// (doc SDK 54, seção "Permissions > Android"). Em iOS essa chamada é
// ignorada silenciosamente (é uma no-op fora do Android).
async function garantirCanalAndroid() {
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
  // projectId, sem dispositivo físico, erro de rede/RPC). Nunca lança.
  async registrarAposLogin() {
    try {
      // Push (remoto) não funciona em emulador/simulador sem configuração
      // nativa extra — pedir permissão e tentar token nesse caso só gera
      // ruído/erro sem utilidade nenhuma pro protótipo em desenvolvimento.
      if (!Device.isDevice) {
        console.log('[push] dispositivo não físico — pulando registro de push.')
        return null
      }

      await garantirCanalAndroid()

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
