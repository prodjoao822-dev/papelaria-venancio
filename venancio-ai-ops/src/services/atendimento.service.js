import { supabase } from '@/supabase/client'
import { PRIORIDADE_CONFIG } from '@/utils/constants'

// A UI (AtendimentoPage) foi construída em cima do vocabulário do dashboard
// antigo (nome_cliente, ia_ativa, operador_nome, ultima_mensagem, ultima_msg_at,
// remetente 'ia'/'operador'). Em vez de reescrever a página inteira, essas
// funções normalizam as linhas reais (bot_ativo, operador_id -> operadores.nome,
// ultima_mensagem_preview, ultima_interacao_em, remetente 'bot'/'humano') pro
// mesmo formato — só os pontos de escrita (que agora exigem operador_id, um
// uuid real, no lugar de um nome solto) precisam de ajuste na página.
function normalizarConversa(c) {
  if (!c) return c
  return {
    ...c,
    nome_cliente: c.clientes?.nome ?? null,
    telefone: c.clientes?.telefone ?? null,
    ia_ativa: c.bot_ativo,
    operador_nome: c.operadores?.nome ?? null,
    ultima_mensagem: c.ultima_mensagem_preview,
    ultima_msg_at: c.ultima_interacao_em,
  }
}

function normalizarMensagem(m) {
  if (!m) return m
  const remetente = { bot: 'ia', humano: 'operador' }[m.remetente] ?? m.remetente
  return { ...m, remetente, operador_nome: m.operadores?.nome ?? null, created_at: m.enviado_em }
}

export const atendimentoService = {
  async listar() {
    const { data, error } = await supabase
      .from('conversas')
      .select(`*, clientes(id, nome, telefone), operadores(id, nome)`)
      .order('prioridade_score', { ascending: false })
      .order('ultima_interacao_em', { ascending: false, nullsFirst: false })
      .limit(100)

    if (error) throw error
    return (data ?? []).map(normalizarConversa)
  },

  async buscarMensagens(conversaId) {
    const { data, error } = await supabase
      .from('mensagens')
      .select('*, operadores(nome)')
      .eq('conversa_id', conversaId)
      .order('enviado_em', { ascending: true })
      .limit(200)

    if (error) throw error
    return (data ?? []).map(normalizarMensagem)
  },

  /** operadorId é o uuid do operador logado (auth.users.id) — previne dois
   * operadores assumirem a mesma conversa ao mesmo tempo (.is('operador_id', null)). */
  async assumirConversa(conversaId, operadorId) {
    const { data, error } = await supabase
      .from('conversas')
      .update({ operador_id: operadorId, bot_ativo: false, status: 'aguardando_operador' })
      .eq('id', conversaId)
      .is('operador_id', null)
      .select(`*, clientes(id, nome, telefone), operadores(id, nome)`)
      .single()

    if (error) throw error
    if (!data) throw new Error('Conversa já foi assumida por outro operador.')
    return normalizarConversa(data)
  },

  async liberarConversa(conversaId) {
    const { data, error } = await supabase
      .from('conversas')
      .update({ operador_id: null, bot_ativo: true, status: 'aguardando_cliente' })
      .eq('id', conversaId)
      .select(`*, clientes(id, nome, telefone), operadores(id, nome)`)
      .single()

    if (error) throw error
    return normalizarConversa(data)
  },

  async atualizarStatus(conversaId, novoStatus) {
    const { data, error } = await supabase
      .from('conversas')
      .update({ status: novoStatus })
      .eq('id', conversaId)
      .select(`*, clientes(id, nome, telefone), operadores(id, nome)`)
      .single()

    if (error) throw error
    return normalizarConversa(data)
  },

  async toggleIA(conversaId, iaAtiva) {
    const { data, error } = await supabase
      .from('conversas')
      .update({ bot_ativo: iaAtiva })
      .eq('id', conversaId)
      .select(`*, clientes(id, nome, telefone), operadores(id, nome)`)
      .single()

    if (error) throw error
    return normalizarConversa(data)
  },

  async atualizarPrioridade(conversaId, prioridade) {
    const cfg = PRIORIDADE_CONFIG[prioridade]
    const { data, error } = await supabase
      .from('conversas')
      .update({ prioridade, prioridade_score: cfg?.score ?? 50 })
      .eq('id', conversaId)
      .select(`*, clientes(id, nome, telefone), operadores(id, nome)`)
      .single()

    if (error) throw error
    return normalizarConversa(data)
  },

  /** Grava a mensagem no histórico do dashboard. Não envia pelo WhatsApp de
   * verdade (não há integração com a Evolution API neste projeto ainda —
   * ver VITE_EVOLUTION_API_URL em .env.example, "preparado para o futuro").
   * conversas.ultima_mensagem_preview é atualizado sozinho por trigger. */
  async enviarMensagem(conversaId, conteudo, operadorId) {
    const { data, error } = await supabase
      .from('mensagens')
      .insert({
        conversa_id: conversaId,
        tipo: 'texto',
        conteudo,
        remetente: 'humano',
        operador_id: operadorId,
      })
      .select('*, operadores(nome)')
      .single()

    if (error) throw error
    return normalizarMensagem(data)
  },

  async adicionarTag(conversaId, tag, tagsAtuais) {
    const novasTags = [...new Set([...(tagsAtuais ?? []), tag])]
    const { data, error } = await supabase
      .from('conversas')
      .update({ tags: novasTags })
      .eq('id', conversaId)
      .select(`*, clientes(id, nome, telefone), operadores(id, nome)`)
      .single()

    if (error) throw error
    return normalizarConversa(data)
  },

  async removerTag(conversaId, tag, tagsAtuais) {
    const novasTags = (tagsAtuais ?? []).filter((t) => t !== tag)
    const { data, error } = await supabase
      .from('conversas')
      .update({ tags: novasTags })
      .eq('id', conversaId)
      .select(`*, clientes(id, nome, telefone), operadores(id, nome)`)
      .single()

    if (error) throw error
    return normalizarConversa(data)
  },

  subscribeConversas(callback) {
    return supabase
      .channel('conversas-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, callback)
      .subscribe()
  },

  subscribeMensagens(conversaId, callback) {
    return supabase
      .channel(`mensagens-${conversaId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `conversa_id=eq.${conversaId}` },
        callback
      )
      .subscribe()
  },
}
