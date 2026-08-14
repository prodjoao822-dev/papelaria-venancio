import { supabase } from '@/supabase/client'
import { BOT_API_URL } from '@/utils/constants'

// A UI (ConsultasPage) foi construída em cima do vocabulário do dashboard
// antigo (product_name, query_type, status pending/assigned/answered/expired,
// priority, timeout_at, context, response, responded_by). Em vez de reescrever
// a página inteira, este service normaliza pra/da tabela real
// `consultas_operacionais` (produto_nome, tipo_duvida, status pendente/
// atribuida/respondida/expirada, prioridade, expira_em, contexto, resposta,
// respondido_por — os dois últimos como uuid de operador, não mais texto livre).
const STATUS_REAL_PARA_JS = { pendente: 'pending', atribuida: 'assigned', respondida: 'answered', expirada: 'expired' }
const STATUS_JS_PARA_REAL = { pending: 'pendente', assigned: 'atribuida', answered: 'respondida', expired: 'expirada' }

const SELECT_COM_CLIENTE = '*, clientes(id, nome, telefone), respondida_por_operador:operadores!respondido_por(nome)'

function normalizar(c) {
  if (!c) return c
  return {
    id: c.id,
    product_name: c.produto_nome,
    query_type: c.tipo_duvida,
    context: c.contexto,
    status: STATUS_REAL_PARA_JS[c.status] ?? c.status,
    priority: c.prioridade,
    timeout_at: c.expira_em,
    created_at: c.criado_em,
    response: c.resposta,
    responded_by: c.respondida_por_operador?.nome ?? null,
    clientes: c.clientes,
  }
}

function assertSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
}

export const operationalQueriesService = {
  async listar(filtros = {}) {
    assertSupabase()
    let query = supabase
      .from('consultas_operacionais')
      .select(SELECT_COM_CLIENTE)
      .order('prioridade', { ascending: true })
      .order('criado_em', { ascending: true })
      .limit(filtros.limite ?? 100)

    if (filtros.status && filtros.status !== 'todos') {
      query = query.eq('status', STATUS_JS_PARA_REAL[filtros.status] ?? filtros.status)
    }
    if (filtros.query_type) query = query.eq('tipo_duvida', filtros.query_type)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(normalizar)
  },

  async buscarPendentes(filtros = {}) {
    assertSupabase()
    let query = supabase
      .from('consultas_operacionais')
      .select(SELECT_COM_CLIENTE)
      .in('status', ['pendente', 'atribuida'])
      .order('prioridade', { ascending: true })
      .order('expira_em', { ascending: true })

    if (filtros.query_type) query = query.eq('tipo_duvida', filtros.query_type)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(normalizar)
  },

  async criar(dados) {
    assertSupabase()
    const { data, error } = await supabase
      .from('consultas_operacionais')
      .insert({
        cliente_id: dados.customer_id ?? null,
        conversa_id: dados.conversation_id ?? null,
        produto_nome: dados.product_name ?? null,
        contexto: dados.context ?? null,
        tipo_duvida: dados.query_type ?? 'estoque',
        prioridade: dados.priority ?? 'normal',
        expira_em: dados.timeout_at ?? undefined,
      })
      .select(SELECT_COM_CLIENTE)
      .single()

    if (error) throw error
    return normalizar(data)
  },

  async atribuir(id, operadorId) {
    assertSupabase()
    const { data, error } = await supabase
      .from('consultas_operacionais')
      .update({ atribuido_a: operadorId, status: 'atribuida' })
      .eq('id', id)
      .eq('status', 'pendente')
      .select(SELECT_COM_CLIENTE)
      .single()

    if (error) throw error
    return normalizar(data)
  },

  async responder(id, resposta, operadorId) {
    assertSupabase()
    const { data, error } = await supabase
      .from('consultas_operacionais')
      .update({ status: 'respondida', resposta, respondido_por: operadorId })
      .eq('id', id)
      .in('status', ['pendente', 'atribuida'])
      .select(SELECT_COM_CLIENTE)
      .single()

    if (error) throw error
    return normalizar(data)
  },

  /** Entrega a resposta já gravada (status 'respondida') pro WhatsApp do
   * cliente, através do JS Bot — a credencial da Evolution API fica só lá
   * (mesmo caminho de atendimento.service.js:enviarMensagem, ver
   * AUDITORIA_INTEGRACAO.md item 1). Best-effort: quem chama decide se uma
   * falha aqui desfaz ou não o status já salvo. */
  async notificarCliente(id) {
    if (!BOT_API_URL) {
      throw new Error('VITE_BOT_API_URL não configurado — não é possível notificar o cliente pelo WhatsApp.')
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Sessão expirada. Faça login novamente.')

    const resposta = await fetch(`${BOT_API_URL}/operador/consultas/${id}/notificar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    const corpo = await resposta.json().catch(() => ({}))
    if (!resposta.ok || !corpo.ok) {
      throw new Error(corpo.erro || 'Falha ao notificar o cliente pelo WhatsApp.')
    }
  },

  async expirarManual(id) {
    assertSupabase()
    const { data, error } = await supabase
      .from('consultas_operacionais')
      .update({ status: 'expirada' })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return normalizar(data)
  },

  // A policy "admin_exclusao" (extensao_dashboard.sql) já cobre esta tabela
  // — só admin consegue apagar de fato; um operador comum recebe erro do
  // próprio RLS, sem precisar validar papel aqui no client.
  async apagar(id) {
    assertSupabase()
    const { error } = await supabase.from('consultas_operacionais').delete().eq('id', id)
    if (error) throw error
  },

  async contarPendentes() {
    assertSupabase()
    const { count, error } = await supabase
      .from('consultas_operacionais')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pendente', 'atribuida'])

    if (error) throw error
    return count ?? 0
  },

  // Retorna o canal (não o resultado de .subscribe()) para cleanup seguro.
  criarCanal(callback) {
    if (!supabase) return null
    return supabase
      .channel('oq-realtime-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consultas_operacionais' }, callback)
  },

  subscribe(callback) {
    if (!supabase) return { unsubscribe: () => {} }
    const channel = this.criarCanal(callback)
    channel.subscribe()
    return channel
  },
}
