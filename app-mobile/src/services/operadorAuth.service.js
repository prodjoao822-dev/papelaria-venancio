// Login do Operador — chama o backend do JS Bot (rate-limited, valida
// código+PIN, ver operadorAuthController.js), nunca signInWithPassword
// direto do app: é o bot quem decide se o PIN bate e quem controla o
// bloqueio por tentativas. O bot devolve um access_token/refresh_token de
// uma sessão Supabase Auth já válida, que aplicamos no client ISOLADO
// (operadorSupabase, ver ../supabase/operadorClient.js) via setSession().
// Mesmo espírito de separadorAuth.service.js, mas o corpo da requisição usa
// `codigo` (4 dígitos, não `codigo_funcionario`) e o endpoint é
// /operador/login-codigo — mesmo contrato usado por
// venancio-ai-ops/src/contexts/AuthContext.jsx (loginComCodigo).
import { operadorSupabase } from '../supabase/operadorClient'

const BOT_API_URL = process.env.EXPO_PUBLIC_BOT_API_URL ?? null

export const operadorAuthService = {
  async login(codigo, pin) {
    if (!BOT_API_URL) {
      throw new Error('EXPO_PUBLIC_BOT_API_URL não configurado — login indisponível.')
    }

    const resposta = await fetch(`${BOT_API_URL}/operador/login-codigo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, pin }),
    })

    const corpo = await resposta.json().catch(() => ({}))
    if (!resposta.ok || !corpo.ok) {
      throw new Error(corpo.erro || 'Falha no login.')
    }

    const { error } = await operadorSupabase.auth.setSession({
      access_token: corpo.sessao.access_token,
      refresh_token: corpo.sessao.refresh_token,
    })
    if (error) throw error

    return corpo.operador
  },

  async logout() {
    await operadorSupabase.auth.signOut()
  },
}
