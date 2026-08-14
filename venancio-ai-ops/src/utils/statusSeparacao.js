// Mapeamento de status de solicitacoes_separacao — mesmo formato de
// utils/status.js (STATUS_CONFIG/getStatusConfig), mas vocabulário próprio:
// os 4 status reais de solicitacoes_separacao ('pendente'/'em_andamento'/
// 'pronta'/'cancelada'), não os 8 status "de vitrine" de pedidos. Não dá
// pra reaproveitar o de pedidos — são domínios diferentes (uma solicitação
// de separação não é um pedido).

export const STATUS_SEPARACAO_CONFIG = {
  pendente: {
    label: 'Pendente',
    labelCurto: 'Pendente',
    cor: '#F0B23E',
    bg: 'rgba(240, 178, 62, 0.14)',
    borda: 'rgba(240, 178, 62, 0.30)',
    icone: '⏳',
  },
  em_andamento: {
    label: 'Em Andamento',
    labelCurto: 'Em And.',
    cor: '#FB923C',
    bg: 'rgba(251, 146, 60, 0.14)',
    borda: 'rgba(251, 146, 60, 0.30)',
    icone: '📦',
  },
  pronta: {
    label: 'Pronta',
    labelCurto: 'Pronta',
    cor: '#2FA85A',
    bg: 'rgba(47, 168, 90, 0.14)',
    borda: 'rgba(47, 168, 90, 0.28)',
    icone: '✅',
  },
  cancelada: {
    label: 'Cancelada',
    labelCurto: 'Cancelada',
    cor: '#E5484D',
    bg: 'rgba(229, 72, 77, 0.14)',
    borda: 'rgba(229, 72, 77, 0.28)',
    icone: '❌',
  },
}

export function getStatusSeparacaoConfig(status) {
  return STATUS_SEPARACAO_CONFIG[status] ?? {
    label: status,
    labelCurto: status,
    cor: '#8A90A6',
    bg: 'rgba(138,144,166,0.14)',
    borda: 'rgba(138,144,166,0.25)',
    icone: '❓',
  }
}

// Prioridade — distinção visual imediata/agendada (RN-02 do PRD).
export const PRIORIDADE_SEPARACAO_CONFIG = {
  imediata: { label: 'Imediata', cor: '#E5484D', bg: 'rgba(229, 72, 77, 0.12)', icone: '⚡' },
  agendada: { label: 'Agendada', cor: '#5B7596', bg: 'rgba(91, 117, 150, 0.14)', icone: '🗓️' },
}

export function getPrioridadeSeparacaoConfig(prioridade) {
  return PRIORIDADE_SEPARACAO_CONFIG[prioridade] ?? PRIORIDADE_SEPARACAO_CONFIG.imediata
}
