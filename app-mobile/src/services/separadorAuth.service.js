// Login do Separador — chama o backend do JS Bot (rate-limited, valida
// código+PIN, ver separadorAuthController.js), nunca signInWithPassword
// direto do app: é o bot quem decide se o PIN bate e quem controla o
// bloqueio por tentativas. O bot devolve um access_token/refresh_token de
// uma sessão Supabase Auth já válida, que aplicamos no client ISOLADO
// (separadorSupabase, ver ../supabase/separadorClient.js) via setSession().
import { separadorSupabase } from '../supabase/separadorClient'

const BOT_API_URL = process.env.EXPO_PUBLIC_BOT_API_URL ?? null

export const separadorAuthService = {
  async login(codigoFuncionario, pin) {
    if (!BOT_API_URL) {
      throw new Error('EXPO_PUBLIC_BOT_API_URL não configurado — login indisponível.')
    }

    const resposta = await fetch(`${BOT_API_URL}/operador/separador/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo_funcionario: codigoFuncionario, pin }),
    })

    const corpo = await resposta.json().catch(() => ({}))
    if (!resposta.ok || !corpo.ok) {
      throw new Error(corpo.erro || 'Falha no login.')
    }

    const { error } = await separadorSupabase.auth.setSession({
      access_token: corpo.sessao.access_token,
      refresh_token: corpo.sessao.refresh_token,
    })
    if (error) throw error

    return corpo.funcionario
  },

  async logout() {
    await separadorSupabase.auth.signOut()
  },
}
