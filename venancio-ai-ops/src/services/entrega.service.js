// Lado do Operador (dashboard). Mesmo padrão de separacao.service.js:
// supabase.rpc(...) com parâmetros p_*, "if (error) throw error" cru — nenhum
// wrapper de erro genérico, nenhuma RPC recebe id de ator do client (todas
// resolvem o ator internamente via auth.uid()/funcionario_atual_id()).
import { supabase } from '@/supabase/client'

const SELECT_SOLICITACAO = `
  *,
  pedidos (id, protocolo, valor_total, forma_entrega, endereco_entrega, clientes (id, nome, telefone)),
  entregador:funcionarios!entregador_id (id, nome),
  delegado_por:operadores!delegado_por_id (id, nome)
`

export const entregaService = {
  /** Todas as solicitações visíveis pro operador (RLS: operador vê tudo). */
  async listar(filtros = {}) {
    let query = supabase
      .from('solicitacoes_entrega')
      .select(SELECT_SOLICITACAO)
      .order('criado_em', { ascending: false })

    if (filtros.status) query = query.eq('status', filtros.status)
    if (filtros.statusIn) query = query.in('status', filtros.statusIn)

    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  async buscarPorId(id) {
    const { data, error } = await supabase
      .from('solicitacoes_entrega')
      .select(SELECT_SOLICITACAO)
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async buscarPorPedido(pedidoId) {
    const { data, error } = await supabase
      .from('solicitacoes_entrega')
      .select(SELECT_SOLICITACAO)
      .eq('pedido_id', pedidoId)
      .order('criado_em', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  /** Operador delega a entrega de um pedido (forma_entrega deve ser 'entrega_propria' — a RPC rejeita os outros valores). */
  async delegar({ pedidoId, entregadorId, horarioPrevisto }) {
    const { data, error } = await supabase.rpc('delegar_entrega', {
      p_pedido_id: pedidoId,
      p_entregador_id: entregadorId,
      p_horario_previsto: horarioPrevisto ?? null,
    })
    if (error) throw error
    return data
  },

  /** Entregador assume a solicitação (uso previsto: app mobile do Entregador — Fase C). */
  async assumir(solicitacaoId) {
    const { data, error } = await supabase.rpc('assumir_entrega', {
      p_solicitacao_id: solicitacaoId,
    })
    if (error) throw error
    return data
  },

  /** Entregador inicia a rota (uso previsto: app mobile do Entregador — Fase C). */
  async iniciarRota(solicitacaoId) {
    const { data, error } = await supabase.rpc('iniciar_rota', {
      p_solicitacao_id: solicitacaoId,
    })
    if (error) throw error
    return data
  },

  /** Entregador conclui a entrega (uso previsto: app mobile do Entregador — Fase C). */
  async concluir(solicitacaoId) {
    const { data, error } = await supabase.rpc('concluir_entrega', {
      p_solicitacao_id: solicitacaoId,
    })
    if (error) throw error
    return data
  },

  async registrarInsucesso(solicitacaoId, motivo) {
    const { data, error } = await supabase.rpc('registrar_insucesso_entrega', {
      p_solicitacao_id: solicitacaoId,
      p_motivo: motivo,
    })
    if (error) throw error
    return data
  },

  async cancelar(solicitacaoId, motivo) {
    const { data, error } = await supabase.rpc('cancelar_entrega', {
      p_solicitacao_id: solicitacaoId,
      p_motivo: motivo ?? null,
    })
    if (error) throw error
    return data
  },
}
