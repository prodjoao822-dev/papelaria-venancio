// Provisionamento/reset de PIN do Separador — sempre pelo backend do JS Bot
// (Supabase Admin API, service key), nunca direto do dashboard. Mesmo padrão
// de fetch de atendimento.service.js#enviarMensagem: Bearer do operador
// logado, BOT_API_URL. Ver separadorAuthController.js (exige papel admin).
import { supabase } from '@/supabase/client'
import { BOT_API_URL } from '@/utils/constants'

export const separadorAdminService = {
  /** Gera um PIN de 6 dígitos aleatório — mostrado uma única vez ao admin. */
  gerarPin() {
    return String(Math.floor(100000 + Math.random() * 900000))
  },

  /** Provisiona o primeiro login ou troca o PIN de um funcionário-separador. */
  async resetarPin(funcionarioId, pin) {
    if (!BOT_API_URL) {
      throw new Error('VITE_BOT_API_URL não configurado — não é possível definir o PIN.')
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Sessão expirada. Faça login novamente.')

    const resposta = await fetch(`${BOT_API_URL}/operador/separador/${funcionarioId}/reset-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ pin }),
    })

    const corpo = await resposta.json().catch(() => ({}))
    if (!resposta.ok || !corpo.ok) {
      throw new Error(corpo.erro || 'Falha ao definir o PIN.')
    }
    return corpo
  },
}
