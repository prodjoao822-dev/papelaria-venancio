// Mapeamento de status de solicitacoes_entrega — mesmo formato de
// utils/statusSeparacao.js, vocabulário próprio: os 5 status reais
// ('pendente'/'em_rota'/'entregue'/'insucesso'/'cancelada').

export const STATUS_ENTREGA_CONFIG = {
  pendente: {
    label: 'Pendente',
    labelCurto: 'Pendente',
    cor: '#F0B23E',
    bg: 'rgba(240, 178, 62, 0.14)',
    borda: 'rgba(240, 178, 62, 0.30)',
    icone: '⏳',
  },
  em_rota: {
    label: 'Em Rota',
    labelCurto: 'Em Rota',
    cor: '#3B82F6',
    bg: 'rgba(59, 130, 246, 0.14)',
    borda: 'rgba(59, 130, 246, 0.30)',
    icone: '🛵',
  },
  entregue: {
    label: 'Entregue',
    labelCurto: 'Entregue',
    cor: '#2FA85A',
    bg: 'rgba(47, 168, 90, 0.14)',
    borda: 'rgba(47, 168, 90, 0.28)',
    icone: '✅',
  },
  insucesso: {
    label: 'Insucesso',
    labelCurto: 'Insucesso',
    cor: '#E5484D',
    bg: 'rgba(229, 72, 77, 0.14)',
    borda: 'rgba(229, 72, 77, 0.28)',
    icone: '⚠️',
  },
  cancelada: {
    label: 'Cancelada',
    labelCurto: 'Cancelada',
    cor: '#8A90A6',
    bg: 'rgba(138,144,166,0.14)',
    borda: 'rgba(138,144,166,0.25)',
    icone: '❌',
  },
}

export function getStatusEntregaConfig(status) {
  return STATUS_ENTREGA_CONFIG[status] ?? {
    label: status,
    labelCurto: status,
    cor: '#8A90A6',
    bg: 'rgba(138,144,166,0.14)',
    borda: 'rgba(138,144,166,0.25)',
    icone: '❓',
  }
}
