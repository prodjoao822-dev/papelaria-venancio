// Lado do Operador (dashboard, cliente Supabase normal — supabase.auth já
// tem a sessão do operador via AuthContext). Mesmo padrão de pedidos.service.js:
// supabase.rpc(...) com parâmetros p_*, "if (error) throw error" cru (sem
// wrapper de erro genérico — não existe um em nenhum service do projeto).
import { supabase } from '@/supabase/client'

const SELECT_SOLICITACAO = `
  *,
  pedidos (id, protocolo, valor_total, clientes (id, nome, telefone)),
  separador:funcionarios (id, nome),
  itens:solicitacoes_separacao_itens (
    id, separado, separado_em,
    itens_pedido (id, nome_item, quantidade)
  )
`

export const separacaoService = {
  /** Todas as solicitações visíveis pro operador (RLS: eh_operador_ativo() vê tudo). */
  async listar(filtros = {}) {
    let query = supabase
      .from('solicitacoes_separacao')
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
      .from('solicitacoes_separacao')
      .select(SELECT_SOLICITACAO)
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async listarMensagens(solicitacaoId) {
    const { data, error } = await supabase
      .from('solicitacoes_separacao_mensagens')
      .select('*, autor_operador:operadores(id, nome), autor_funcionario:funcionarios(id, nome)')
      .eq('solicitacao_id', solicitacaoId)
      .order('criado_em', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async delegar({ pedidoId, separadorId, prioridade, horarioRetirada, observacao }) {
    const { data, error } = await supabase.rpc('delegar_separacao', {
      p_pedido_id: pedidoId,
      p_separador_id: separadorId,
      p_prioridade: prioridade,
      p_horario_retirada: horarioRetirada ?? null,
      p_observacao: observacao ?? null,
    })
    if (error) throw error
    return data
  },

  async separacaoRapida({ pedidoId, observacao }) {
    const { data, error } = await supabase.rpc('separacao_rapida', {
      p_pedido_id: pedidoId,
      p_observacao: observacao ?? null,
    })
    if (error) throw error
    return data
  },

  /** Operador marca item da própria Separação Rápida (tipo='rapida' — ele é o executor). */
  async marcarItem(solicitacaoItemId, separado) {
    const { data, error } = await supabase.rpc('marcar_item_separado_solicitacao', {
      p_solicitacao_item_id: solicitacaoItemId,
      p_separado: separado,
    })
    if (error) throw error
    return data
  },

  async concluir(solicitacaoId) {
    const { data, error } = await supabase.rpc('concluir_separacao', {
      p_solicitacao_id: solicitacaoId,
    })
    if (error) throw error
    return data
  },

  async cancelar(solicitacaoId, motivo) {
    const { data, error } = await supabase.rpc('cancelar_separacao', {
      p_solicitacao_id: solicitacaoId,
      p_motivo: motivo ?? null,
    })
    if (error) throw error
    return data
  },

  async enviarMensagem(solicitacaoId, texto) {
    const { data, error } = await supabase.rpc('enviar_mensagem_separacao', {
      p_solicitacao_id: solicitacaoId,
      p_texto: texto,
    })
    if (error) throw error
    return data
  },

  async marcarNotificacaoLida(id) {
    const { data, error } = await supabase.rpc('marcar_notificacao_lida', { p_id: id })
    if (error) throw error
    return data
  },

  /** Notificações internas do operador logado (destinatario_operador_id = auth.uid(), via RLS). */
  async listarNotificacoes({ apenasNaoLidas = false } = {}) {
    let query = supabase
      .from('notificacoes_internas')
      .select('*')
      .eq('destinatario_tipo', 'operador')
      .order('criado_em', { ascending: false })
      .limit(50)
    if (apenasNaoLidas) query = query.eq('lida', false)

    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },
}
