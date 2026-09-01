import { supabase } from '@/supabase/client'

// RF-03: tarefas internas com prazo e responsável (funcionário), atribuídas
// por um operador. As RPCs resolvem o ator (criado_por/responsável de
// reatribuição) internamente via auth.uid() — nunca client-supplied (ver
// achado B1 do plano mestre). Fundação de banco: extensao_tarefas_e_lista_
// espera (RF-03/04), sem job de notificação automática ainda.
const SELECT_TAREFA = `
  id, descricao, data_execucao, status, concluido_em, criado_em,
  pedido_id, responsavel_id,
  responsavel:funcionarios!responsavel_id (id, nome),
  pedidos (id, protocolo),
  criado_por_operador:operadores!criado_por (id, nome)
`

export const tarefasService = {
  async listar(filtros = {}) {
    let query = supabase
      .from('tarefas')
      .select(SELECT_TAREFA)
      .order('data_execucao', { ascending: true })

    if (filtros.status) query = query.eq('status', filtros.status)
    if (filtros.responsavelId) query = query.eq('responsavel_id', filtros.responsavelId)
    if (filtros.pedidoId) query = query.eq('pedido_id', filtros.pedidoId)

    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  async listarPendentes() {
    return tarefasService.listar({ status: 'pendente' })
  },

  /** pedidoId é opcional — null para tarefa interna não amarrada a um pedido. */
  async criar({ responsavelId, descricao, dataExecucao, pedidoId = null }) {
    const { data, error } = await supabase.rpc('criar_tarefa', {
      p_responsavel_id: responsavelId,
      p_descricao: descricao,
      p_data_execucao: dataExecucao,
      p_pedido_id: pedidoId,
    })
    if (error) throw error
    return data
  },

  async concluir(tarefaId) {
    const { data, error } = await supabase.rpc('concluir_tarefa', {
      p_tarefa_id: tarefaId,
    })
    if (error) throw error
    return data
  },

  async reatribuir(tarefaId, novoResponsavelId) {
    const { data, error } = await supabase.rpc('reatribuir_tarefa', {
      p_tarefa_id: tarefaId,
      p_novo_responsavel_id: novoResponsavelId,
    })
    if (error) throw error
    return data
  },

  async contarPendentes() {
    const { count, error } = await supabase
      .from('tarefas')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pendente')
    if (error) throw error
    return count ?? 0
  },

  // Mesmo padrão de ocorrencias.service.js/operational-queries.service.js:
  // devolve o canal (não o resultado de .subscribe()) pra cleanup seguro.
  criarCanal(callback) {
    if (!supabase) return null
    return supabase
      .channel('tarefas-realtime-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas' }, callback)
  },

  subscribe(callback) {
    if (!supabase) return { unsubscribe: () => {} }
    const channel = this.criarCanal(callback)
    channel.subscribe()
    return channel
  },
}
