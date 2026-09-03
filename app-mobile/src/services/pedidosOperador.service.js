// Lado do Operador — usa o cliente ISOLADO (operadorSupabase), nunca um
// client genérico. Espelha o SELECT de
// venancio-ai-ops/src/services/pedidos.service.js (`listar()`/`buscarPorId()`),
// trocando só o client Supabase. v1 é deliberadamente só-leitura: sem
// filtros de busca/status/paginação avançada, sem criar pedido, sem mudar
// status, sem atribuir responsável — essas ações continuam exclusivas do
// dashboard web (ver plano de tarefas desta sessão).
import { operadorSupabase } from '../supabase/operadorClient'
import { derivarStatusDashboard } from '../utils/statusPedido'

const PEDIDOS_POR_PAGINA = 50

const SELECT_PEDIDO_COMPLETO = `
  *,
  clientes (id, nome, telefone, observacoes),
  operadores (id, nome),
  responsavel_separacao:funcionarios!responsavel_separacao_id (id, nome),
  responsavel_entrega:funcionarios!responsavel_entrega_id (id, nome),
  listas_modelo (id, ano, escolas (id, nome)),
  itens_pedido (
    id, nome_item, quantidade, valor_unitario, valor_total, separado, produto_id,
    tipo_observacao, observacao,
    produtos (id, nome, sku, imagem_url)
  )
`

/** Anexa o status "de vitrine" (8 valores) derivado das colunas reais. */
function normalizarPedido(pedido) {
  if (!pedido) return pedido
  return { ...pedido, status_real: pedido.status, status: derivarStatusDashboard(pedido) }
}

export const pedidosOperadorService = {
  async listar() {
    const { data, error } = await operadorSupabase
      .from('pedidos')
      .select(SELECT_PEDIDO_COMPLETO)
      .order('criado_em', { ascending: false })
      .limit(PEDIDOS_POR_PAGINA)

    if (error) throw error
    return (data ?? []).map(normalizarPedido)
  },

  async buscarPorId(id) {
    const { data, error } = await operadorSupabase
      .from('pedidos')
      .select(`
        ${SELECT_PEDIDO_COMPLETO},
        pedidos_status_historico (
          id, status_anterior, status_novo, origem, observacao, criado_em,
          operadores (id, nome)
        )
      `)
      .eq('id', id)
      .order('criado_em', { referencedTable: 'pedidos_status_historico', ascending: true })
      .single()

    if (error) throw error
    return normalizarPedido(data)
  },
}
