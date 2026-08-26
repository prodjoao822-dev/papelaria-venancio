// Vocabulário de `ocorrencias.tipo` (Requisitos_Addendum_Entrega_Ocorrencia.md):
// 4 tipos operacionais (problemas durante separação/entrega) + 3 tipos de
// pós-venda (cliente retorna à loja).

export const TIPOS_OCORRENCIA = [
  { value: 'item_faltante', label: 'Item faltante', grupo: 'operacional', icone: '📦' },
  { value: 'endereco_nao_encontrado', label: 'Endereço não encontrado', grupo: 'operacional', icone: '📍' },
  { value: 'cliente_ausente', label: 'Cliente ausente', grupo: 'operacional', icone: '🚪' },
  { value: 'produto_avariado', label: 'Produto avariado', grupo: 'operacional', icone: '💥' },
  { value: 'troca', label: 'Troca', grupo: 'pos_venda', icone: '🔄' },
  { value: 'devolucao', label: 'Devolução', grupo: 'pos_venda', icone: '↩️' },
  { value: 'produto_errado', label: 'Produto errado', grupo: 'pos_venda', icone: '🚫' },
]

export const TIPO_OCORRENCIA_CONFIG = Object.fromEntries(
  TIPOS_OCORRENCIA.map((t) => [t.value, t])
)

export function getTipoOcorrenciaConfig(tipo) {
  return TIPO_OCORRENCIA_CONFIG[tipo] ?? { value: tipo, label: tipo, grupo: 'operacional', icone: '❓' }
}

export const STATUS_OCORRENCIA_CONFIG = {
  aberta: { label: 'Aberta', cor: '#E5484D', bg: 'rgba(229, 72, 77, 0.14)', borda: 'rgba(229, 72, 77, 0.28)', icone: '🔴' },
  resolvida: { label: 'Resolvida', cor: '#2FA85A', bg: 'rgba(47, 168, 90, 0.14)', borda: 'rgba(47, 168, 90, 0.28)', icone: '✅' },
}

export function getStatusOcorrenciaConfig(status) {
  return STATUS_OCORRENCIA_CONFIG[status] ?? STATUS_OCORRENCIA_CONFIG.aberta
}
