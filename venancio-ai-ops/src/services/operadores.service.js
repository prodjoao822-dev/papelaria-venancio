// Gestão de login de operador por código+PIN (01/09/2026). Listagem é leitura
// direta em `operadores` (RLS já libera pra qualquer operador ativo);
// criar/resetar PIN sempre pelo backend do JS Bot (Supabase Admin API,
// service key, nunca direto do dashboard) -- mesmo padrão de
// separadorAdmin.service.js, que é a referência de estilo aqui.
import { supabase } from '@/supabase/client'
import { BOT_API_URL } from '@/utils/constants'

async function tokenSessaoAtual() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sessão expirada. Faça login novamente.')
  return session.access_token
}

export const operadoresService = {
  /** Gera um PIN de 6 dígitos aleatório — mostrado uma única vez ao admin. */
  gerarPin() {
    return String(Math.floor(100000 + Math.random() * 900000))
  },

  async listar() {
    const { data, error } = await supabase
      .from('operadores')
      .select('id, nome, codigo, papel, ativo, criado_em')
      .order('nome')
    if (error) throw error
    return data ?? []
  },

  /** Cria um operador novo já com código+PIN definidos. Só admin (checado no backend). */
  async criarComCodigo({ nome, codigo, pin, papel = 'operador' }) {
    if (!BOT_API_URL) {
      throw new Error('VITE_BOT_API_URL não configurado — não é possível cadastrar operador.')
    }
    const token = await tokenSessaoAtual()

    const resposta = await fetch(`${BOT_API_URL}/operador/criar-com-codigo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ nome, codigo, pin, papel }),
    })

    const corpo = await resposta.json().catch(() => ({}))
    if (!resposta.ok || !corpo.ok) {
      throw new Error(corpo.erro || 'Falha ao cadastrar operador.')
    }
    return corpo.operador
  },

  /** Reseta o PIN de um operador que já tem código de login definido. Só admin. */
  async resetarPin(operadorId, pin) {
    if (!BOT_API_URL) {
      throw new Error('VITE_BOT_API_URL não configurado — não é possível definir o PIN.')
    }
    const token = await tokenSessaoAtual()

    const resposta = await fetch(`${BOT_API_URL}/operador/${operadorId}/reset-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ pin }),
    })

    const corpo = await resposta.json().catch(() => ({}))
    if (!resposta.ok || !corpo.ok) {
      throw new Error(corpo.erro || 'Falha ao definir o PIN.')
    }
    return corpo
  },

  async atualizarAtivo(operadorId, ativo) {
    const { error } = await supabase.from('operadores').update({ ativo }).eq('id', operadorId)
    if (error) throw error
  },
}
