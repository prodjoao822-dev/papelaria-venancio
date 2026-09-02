// Progresso do checklist de separação de um pedido (seção dentro de
// PedidoModal.jsx, distinta da Separação Delegada/Rápida — ver comentário
// em ChecklistSeparacao).
//
// Bug real corrigido aqui: um pedido pode ter sido separado por um caminho
// que nunca grava em `itens_pedido.separado` — a Separação Delegada e a
// Separação Rápida (RF-05/06, separacao.service.js) marcam os itens numa
// tabela paralela (`solicitacoes_separacao_itens`) e, ao concluir, avançam
// `pedidos.status` direto pra 'pronto' sem tocar em `itens_pedido`
// (chatbot/papelaria-bot/supabase/extensao_concluir_separacao_avanca_pedido.sql,
// linhas 79-82). Sem levar o status real do pedido em conta, o checklist
// deste modal mostrava "0/N separados" pra um pedido que já estava pronto,
// e o indicador "Tudo separado" nunca aparecia.
//
// Se o status real já é 'pronto' ou 'concluido', a separação está
// confirmada por definição — tratamos o checklist como completo (só pra
// exibição; não escreve em itens_pedido nem decide status).
const STATUS_QUE_CONFIRMAM_SEPARACAO = ['pronto', 'concluido']

/**
 * @param {Array<{ separado?: boolean }>} itens
 * @param {string|null|undefined} statusRealPedido - `pedido.status_real` (enum de 5 estados)
 * @returns {{ total: number, separados: number, progresso: number, tudoSeparado: boolean, separacaoConfirmadaPeloStatus: boolean }}
 */
export function calcularProgressoChecklist(itens, statusRealPedido) {
  const lista = itens ?? []
  const total = lista.length
  const separadosReais = lista.filter((i) => i?.separado).length
  const separacaoConfirmadaPeloStatus = STATUS_QUE_CONFIRMAM_SEPARACAO.includes(statusRealPedido)
  const separados = separacaoConfirmadaPeloStatus ? total : separadosReais
  const progresso = total > 0 ? Math.round((separados / total) * 100) : 0
  const tudoSeparado = total > 0 && separados === total

  return { total, separados, progresso, tudoSeparado, separacaoConfirmadaPeloStatus }
}
