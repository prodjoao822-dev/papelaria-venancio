// Mesmo padrão de separacao.service.js/entrega.service.js: supabase.rpc(...)
// com parâmetros p_*, "if (error) throw error" cru. abrir_ocorrencia/
// resolver_ocorrencia resolvem o ator (operador ou funcionário) internamente
// via auth.uid()/funcionario_atual_id() — nunca client-supplied.
import { supabase } from '@/supabase/client'

const SELECT_OCORRENCIA = `
  *,
  pedidos (id, protocolo, valor_total, clientes (id, nome, telefone)),
  criado_por_operador:operadores!criado_por_operador_id (id, nome),
  criado_por_funcionario:funcionarios!criado_por_funcionario_id (id, nome),
  resolvido_por_operador:operadores!resolvido_por_operador_id (id, nome),
  resolvido_por_funcionario:funcionarios!resolvido_por_funcionario_id (id, nome)
`

export const ocorrenciasService = {
  /** Todas as ocorrências visíveis pro operador (RLS: operador vê tudo). */
  async listar(filtros = {}) {
    let query = supabase
      .from('ocorrencias')
      .select(SELECT_OCORRENCIA)
      .order('criado_em', { ascending: false })

    if (filtros.status) query = query.eq('status', filtros.status)
    if (filtros.tipo) query = query.eq('tipo', filtros.tipo)

    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  async listarAbertas() {
    return ocorrenciasService.listar({ status: 'aberta' })
  },

  async buscarPorPedido(pedidoId) {
    const { data, error } = await supabase
      .from('ocorrencias')
      .select(SELECT_OCORRENCIA)
      .eq('pedido_id', pedidoId)
      .order('criado_em', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async buscarPorId(id) {
    const { data, error } = await supabase
      .from('ocorrencias')
      .select(SELECT_OCORRENCIA)
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  /**
   * tipo: um dos 7 valores de `ocorrencias.tipo` (operacionais: item_faltante,
   * endereco_nao_encontrado, cliente_ausente, produto_avariado; pós-venda:
   * troca, devolucao, produto_errado). solicitacaoSeparacaoId/solicitacaoEntregaId
   * são opcionais — usados quando a ocorrência nasce de dentro de uma
   * separação/entrega em andamento, não do fluxo de pós-venda.
   */
  async abrir({ pedidoId, tipo, descricao, solicitacaoSeparacaoId = null, solicitacaoEntregaId = null }) {
    const { data, error } = await supabase.rpc('abrir_ocorrencia', {
      p_pedido_id: pedidoId,
      p_tipo: tipo,
      p_descricao: descricao,
      p_solicitacao_separacao_id: solicitacaoSeparacaoId,
      p_solicitacao_entrega_id: solicitacaoEntregaId,
    })
    if (error) throw error
    return data
  },

  async resolver(ocorrenciaId, resolucaoTexto) {
    const { data, error } = await supabase.rpc('resolver_ocorrencia', {
      p_ocorrencia_id: ocorrenciaId,
      p_resolucao_texto: resolucaoTexto,
    })
    if (error) throw error
    return data
  },

  async contarAbertas() {
    const { count, error } = await supabase
      .from('ocorrencias')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'aberta')
    if (error) throw error
    return count ?? 0
  },

  // Retorna o canal (não o resultado de .subscribe()) para cleanup seguro —
  // mesmo padrão de operational-queries.service.js.
  criarCanal(callback) {
    if (!supabase) return null
    return supabase
      .channel('ocorrencias-realtime-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ocorrencias' }, callback)
  },

  subscribe(callback) {
    if (!supabase) return { unsubscribe: () => {} }
    const channel = this.criarCanal(callback)
    channel.subscribe()
    return channel
  },
}
