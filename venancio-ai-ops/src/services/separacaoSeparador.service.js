// Lado do Separador — usa o cliente ISOLADO (separadorSupabase), nunca o
// cliente do Operador. RLS já restringe SELECT às próprias solicitações
// (separador_id = funcionario_atual_id()), então as queries daqui não
// precisam (nem devem) filtrar por funcionário manualmente — a policy faz
// isso. Mesmo padrão de chamada de RPC / "if (error) throw error" cru dos
// outros services do projeto.
import { separadorSupabase } from '@/supabase/separadorClient'

const SELECT_SOLICITACAO = `
  *,
  pedidos (id, protocolo, valor_total, clientes (id, nome, telefone)),
  itens:solicitacoes_separacao_itens (
    id, separado, separado_em,
    itens_pedido (id, nome_item, quantidade)
  )
`

export const separacaoSeparadorService = {
  async listarMinhas(filtros = {}) {
    // Ordenação por prioridade (imediata primeiro) é feita na tela, não aqui
    // — client-side é mais simples que replicar a regra num CASE WHEN do SQL.
    let query = separadorSupabase
      .from('solicitacoes_separacao')
      .select(SELECT_SOLICITACAO)
      .order('criado_em', { ascending: false })

    if (filtros.statusIn) query = query.in('status', filtros.statusIn)

    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  async buscarPorId(id) {
    const { data, error } = await separadorSupabase
      .from('solicitacoes_separacao')
      .select(SELECT_SOLICITACAO)
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async listarMensagens(solicitacaoId) {
    const { data, error } = await separadorSupabase
      .from('solicitacoes_separacao_mensagens')
      .select('*, autor_operador:operadores(id, nome), autor_funcionario:funcionarios(id, nome)')
      .eq('solicitacao_id', solicitacaoId)
      .order('criado_em', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async assumir(solicitacaoId) {
    const { data, error } = await separadorSupabase.rpc('assumir_separacao', {
      p_solicitacao_id: solicitacaoId,
    })
    if (error) throw error
    return data
  },

  async marcarItem(solicitacaoItemId, separado) {
    const { data, error } = await separadorSupabase.rpc('marcar_item_separado_solicitacao', {
      p_solicitacao_item_id: solicitacaoItemId,
      p_separado: separado,
    })
    if (error) throw error
    return data
  },

  async concluir(solicitacaoId) {
    const { data, error } = await separadorSupabase.rpc('concluir_separacao', {
      p_solicitacao_id: solicitacaoId,
    })
    if (error) throw error
    return data
  },

  async cancelar(solicitacaoId, motivo) {
    const { data, error } = await separadorSupabase.rpc('cancelar_separacao', {
      p_solicitacao_id: solicitacaoId,
      p_motivo: motivo ?? null,
    })
    if (error) throw error
    return data
  },

  async enviarMensagem(solicitacaoId, texto) {
    const { data, error } = await separadorSupabase.rpc('enviar_mensagem_separacao', {
      p_solicitacao_id: solicitacaoId,
      p_texto: texto,
    })
    if (error) throw error
    return data
  },

  async listarNotificacoes({ apenasNaoLidas = false } = {}) {
    let query = separadorSupabase
      .from('notificacoes_internas')
      .select('*')
      .eq('destinatario_tipo', 'separador')
      .order('criado_em', { ascending: false })
      .limit(50)
    if (apenasNaoLidas) query = query.eq('lida', false)

    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  async marcarNotificacaoLida(id) {
    const { data, error } = await separadorSupabase.rpc('marcar_notificacao_lida', { p_id: id })
    if (error) throw error
    return data
  },
}
