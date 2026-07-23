// Espelha, no lado do dashboard, o mapeamento SQL documentado em
// chatbot/papelaria-bot/supabase/extensao_dashboard.sql (seção G):
// os 8 status "de vitrine" do dashboard são derivados do enum real de 5
// estados (status_pedido) + forma_entrega + as duas datas de logística —
// nunca um campo próprio. Isso evita re-desenhar a máquina de transição
// já validada em produção (atualizar_status_pedido).

const STATUS_REAL_SIMPLES = {
  confirmado: 'NOVO_PEDIDO',
  em_separacao: 'EM_SEPARACAO',
  concluido: 'FINALIZADO',
  cancelado: 'CANCELADO',
}

/** Status "de vitrine" (8 valores) a partir de uma linha real de `pedidos`. */
export function derivarStatusDashboard(pedido) {
  if (!pedido) return null
  if (pedido.status === 'pronto') {
    if (pedido.forma_entrega === 'retirada' && pedido.pronto_para_retirada_em) {
      return 'PRONTO_RETIRADA'
    }
    if (pedido.forma_entrega !== 'retirada' && pedido.saiu_para_entrega_em) {
      return 'SAIU_ENTREGA'
    }
    return 'SEPARADO'
  }
  return STATUS_REAL_SIMPLES[pedido.status] ?? pedido.status
}

/**
 * Versão simplificada usada só pro histórico (pedidos_status_historico não
 * guarda forma_entrega/datas de logística por linha — 'pronto' vira sempre
 * "Separado" ali, sem distinguir retirada/entrega retroativamente).
 */
export function mapStatusRealParaDashboard(statusReal) {
  if (statusReal === 'pronto') return 'SEPARADO'
  return STATUS_REAL_SIMPLES[statusReal] ?? statusReal
}

/** Aplica no query builder do Supabase o filtro equivalente a um status de vitrine. */
export function aplicarFiltroStatusDashboard(query, statusDashboard) {
  switch (statusDashboard) {
    case 'NOVO_PEDIDO':
    case 'AGUARDANDO_CONFIRMACAO':
      return query.eq('status', 'confirmado')
    case 'EM_SEPARACAO':
      return query.eq('status', 'em_separacao')
    case 'SEPARADO':
      return query.eq('status', 'pronto').is('pronto_para_retirada_em', null).is('saiu_para_entrega_em', null)
    case 'PRONTO_RETIRADA':
      return query.eq('status', 'pronto').eq('forma_entrega', 'retirada').not('pronto_para_retirada_em', 'is', null)
    case 'SAIU_ENTREGA':
      return query
        .eq('status', 'pronto')
        .in('forma_entrega', ['entrega_propria', 'uber_flash'])
        .not('saiu_para_entrega_em', 'is', null)
    case 'FINALIZADO':
      return query.eq('status', 'concluido')
    case 'CANCELADO':
      return query.eq('status', 'cancelado')
    default:
      return query
  }
}

/** O enum real (status_pedido) que uma ação de vitrine deve gravar via RPC. */
export const STATUS_DASHBOARD_PARA_REAL = {
  EM_SEPARACAO: 'em_separacao',
  SEPARADO: 'pronto',
  FINALIZADO: 'concluido',
  CANCELADO: 'cancelado',
}
