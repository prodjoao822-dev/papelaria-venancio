// Porta mínima, só-leitura, de venancio-ai-ops/src/utils/statusDerivado.js —
// traz apenas `derivarStatusDashboard` (a função que o app-mobile realmente
// precisa para exibir status em PainelPedidosScreen/DetalhePedidoScreen).
// Não copia `aplicarFiltroStatusDashboard` nem `STATUS_DASHBOARD_PARA_REAL`
// (mudam o query builder ou servem só para escrita) porque o Operador no
// app-mobile v1 é 100% leitura (decisão do escopo desta v1 — sem filtro de
// lista nem troca de status pelo celular).
//
// Mesma regra documentada em chatbot/papelaria-bot/supabase/
// extensao_dashboard.sql (seção G): os 8 status "de vitrine" derivam do
// enum real de 5 estados (status_pedido) + forma_entrega + as duas datas de
// logística — nunca um campo próprio. Se essa regra mudar no banco, replique
// a mudança aqui e em statusDerivado.js (dashboard) juntas.
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

/** Rótulo em português de balcão para cada status de vitrine. */
export const LABEL_STATUS_PEDIDO = {
  NOVO_PEDIDO: 'Novo pedido',
  EM_SEPARACAO: 'Em separação',
  SEPARADO: 'Separado',
  PRONTO_RETIRADA: 'Pronto p/ retirada',
  SAIU_ENTREGA: 'Saiu p/ entrega',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
}
