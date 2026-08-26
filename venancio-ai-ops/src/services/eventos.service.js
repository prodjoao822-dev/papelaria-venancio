// Leitura da timeline unificada (tabela `eventos`, alimentada por triggers —
// ver chatbot/papelaria-bot/supabase/extensao_dashboard.sql seção L e
// extensao_entrega_ocorrencia.sql seção H). Só leitura: a escrita é toda
// feita pelos triggers no banco, nunca pelo client.
//
// Pegadinha (já verificada ao vivo): eventos de pedido/entrega/ocorrência
// guardam `pedido_id` dentro de `payload` (jsonb), não como coluna própria
// nem como `entidade_id` (que aponta pra linha de origem, ex: a linha do
// histórico). Eventos de orçamento guardam `orcamento_id` no payload em vez
// de `pedido_id`, porque nascem antes do pedido existir. Como todo pedido
// tem orcamento_id (NOT NULL), filtrar pelos dois cobre a timeline inteira.
// Diferente do bug já corrigido em pedidosService/orcamentosService: aqui
// `payload->>chave` é coluna da própria tabela `eventos`, não de uma tabela
// embutida — o PostgREST aceita normalmente dentro de `.or()`.
import { supabase } from '@/supabase/client'

const SELECT_EVENTO = `
  id, tipo_evento, entidade_tipo, entidade_id, ator_tipo, ator_id, ator_funcionario_id,
  descricao, payload, criado_em,
  operadores:operadores!ator_id (id, nome),
  funcionarios:funcionarios!ator_funcionario_id (id, nome)
`

export const eventosService = {
  /**
   * Timeline completa de um pedido: eventos que guardam esse pedido_id no
   * payload (status, entrega, ocorrência) + eventos do orçamento de origem
   * (que guardam orcamento_id, não pedido_id, pois nascem antes do pedido).
   */
  async buscarPorPedido(pedidoId, orcamentoId = null) {
    if (!pedidoId) return []

    const filtro = orcamentoId
      ? `payload->>pedido_id.eq.${pedidoId},payload->>orcamento_id.eq.${orcamentoId}`
      : `payload->>pedido_id.eq.${pedidoId}`

    const { data, error } = await supabase
      .from('eventos')
      .select(SELECT_EVENTO)
      .or(filtro)
      .order('criado_em', { ascending: true })

    if (error) throw error
    return data ?? []
  },
}
