import { supabase } from '@/supabase/client'
import { PRIORIDADE_CONFIG, BOT_API_URL } from '@/utils/constants'

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

  /** Usado pelo realtime (INSERT/UPDATE em `conversas`) pra buscar a linha
   * completa com os joins — o payload do postgres_changes só traz as colunas
   * puras, sem clientes/operadores. */
  async buscarPorId(conversaId) {
    const { data, error } = await supabase
      .from('conversas')
      .select(`*, clientes(id, nome, telefone), operadores(id, nome)`)
      .eq('id', conversaId)
      .single()

    if (error) throw error
    return normalizarConversa(data)
  },

  /** Mesma ideia de buscarPorId, mas pra uma mensagem — usado pelo realtime
   * de INSERT em `mensagens` pra trazer operadores(nome) junto. */
  async buscarMensagemPorId(mensagemId) {
    const { data, error } = await supabase
      .from('mensagens')
      .select('*, operadores(nome)')
      .eq('id', mensagemId)
      .single()

    if (error) throw error
    return normalizarMensagem(data)
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
   * operadores assumirem a mesma conversa ao mesmo tempo (.is('operador_id', null)).
   * ultima_interacao_em é atualizado junto porque é a referência que o JS Bot usa
   * pro timeout de reativação automática (reativacaoBot.garantirBotAtivo) — sem
   * isso, um cliente que mande mensagem pouco antes do timeout expirar (contado
   * desde a última mensagem dele, não desde que o operador assumiu) faz o bot se
   * reativar sozinho por cima do operador. */
  async assumirConversa(conversaId, operadorId) {
    const { data, error } = await supabase
      .from('conversas')
      .update({
        operador_id: operadorId,
        bot_ativo: false,
        status: 'aguardando_operador',
        ultima_interacao_em: new Date().toISOString(),
      })
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
      .update({
        operador_id: null,
        bot_ativo: true,
        status: 'aguardando_cliente',
        ultima_interacao_em: new Date().toISOString(),
      })
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

  /** Mesmo motivo do ultima_interacao_em em assumirConversa: pausar a IA por
   * aqui sem passar por "Assumir" tem que atualizar a referência do timeout
   * de reativação também, senão o bot pode se reativar sozinho no meio da
   * pausa manual. Religar a IA (iaAtiva=true) também limpa operador_id — mesmo
   * princípio de liberarConversa: bot_ativo=true e um operador atribuído nunca
   * deveriam coexistir, senão a etiqueta "atendido por X" fica presa depois de
   * religar a IA sem passar pelo botão "Liberar". */
  async toggleIA(conversaId, iaAtiva) {
    const payload = { bot_ativo: iaAtiva, ultima_interacao_em: new Date().toISOString() }
    if (iaAtiva) payload.operador_id = null

    const { data, error } = await supabase
      .from('conversas')
      .update(payload)
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

  /** Manda a mensagem de verdade pro WhatsApp do cliente através do JS Bot
   * (chatbot/papelaria-bot) — é ele quem tem a credencial da Evolution API e a
   * lógica de retry/dedup de eco (nunca deve viver no frontend). O bot confere
   * bot_ativo=false antes de enviar e só então grava em `mensagens` com o
   * operador_id derivado da própria sessão (não do parâmetro operadorId, que
   * fica só por compatibilidade com o call site existente). Ver
   * AUDITORIA_INTEGRACAO.md, item 1. */
  async enviarMensagem(conversaId, conteudo, _operadorId) {
    if (!BOT_API_URL) {
      throw new Error('VITE_BOT_API_URL não configurado — não é possível enviar mensagem pelo WhatsApp.')
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Sessão expirada. Faça login novamente.')

    const resposta = await fetch(`${BOT_API_URL}/operador/mensagens/enviar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ conversaId, conteudo }),
    })

    const corpo = await resposta.json().catch(() => ({}))
    if (!resposta.ok || !corpo.ok) {
      throw new Error(corpo.erro || 'Falha ao enviar a mensagem.')
    }

    return corpo.mensagem ? normalizarMensagem(corpo.mensagem) : null
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

  /** Todas as conversas com um operador atribuído agora (operador_id não nulo é
   * o mesmo critério usado por assumirConversa/liberarConversa) — usado pra
   * etiqueta "atendido por X" fora da tela de Atendimento (Pedidos, Clientes,
   * resumo do Dashboard). */
  async listarAtendimentosAtivos() {
    const { data, error } = await supabase
      .from('conversas')
      .select('cliente_id, operador_id, status, operadores (id, nome)')
      .not('operador_id', 'is', null)

    if (error) throw error
    return data ?? []
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
