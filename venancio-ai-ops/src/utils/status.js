export const STATUS = {
  NOVO_PEDIDO:             'NOVO_PEDIDO',
  AGUARDANDO_CONFIRMACAO:  'AGUARDANDO_CONFIRMACAO',
  EM_SEPARACAO:            'EM_SEPARACAO',
  SEPARADO:                'SEPARADO',
  PRONTO_RETIRADA:         'PRONTO_RETIRADA',
  SAIU_ENTREGA:            'SAIU_ENTREGA',
  FINALIZADO:              'FINALIZADO',
  CANCELADO:               'CANCELADO',
}

export const STATUS_CONFIG = {
  NOVO_PEDIDO: {
    label:      'Novo Pedido',
    labelCurto: 'Novo',
    cor:   '#60A5FA',
    bg:    'rgba(59, 130, 246, 0.12)',
    borda: 'rgba(59, 130, 246, 0.30)',
    icone: '🆕',
    proximosStatus: ['AGUARDANDO_CONFIRMACAO', 'EM_SEPARACAO', 'CANCELADO'],
    acoes: [
      { status: 'AGUARDANDO_CONFIRMACAO', label: 'Aguardar Confirmação' },
      { status: 'EM_SEPARACAO', label: 'Iniciar Separação' },
      { status: 'CANCELADO', label: 'Cancelar', perigo: true },
    ],
  },
  AGUARDANDO_CONFIRMACAO: {
    label:      'Aguardando Confirmação',
    labelCurto: 'Aguardando',
    cor:   '#FCD34D',
    bg:    'rgba(245, 158, 11, 0.12)',
    borda: 'rgba(245, 158, 11, 0.30)',
    icone: '⏳',
    proximosStatus: ['EM_SEPARACAO', 'CANCELADO'],
    acoes: [
      { status: 'EM_SEPARACAO', label: 'Iniciar Separação' },
      { status: 'CANCELADO', label: 'Cancelar', perigo: true },
    ],
  },
  EM_SEPARACAO: {
    label:      'Em Separação',
    labelCurto: 'Em Sep.',
    cor:   '#FB923C',
    bg:    'rgba(234, 88, 12, 0.12)',
    borda: 'rgba(234, 88, 12, 0.30)',
    icone: '📦',
    proximosStatus: ['SEPARADO', 'CANCELADO'],
    acoes: [
      { status: 'SEPARADO', label: 'Marcar Separado' },
      { status: 'CANCELADO', label: 'Cancelar', perigo: true },
    ],
  },
  SEPARADO: {
    label:      'Separado',
    labelCurto: 'Separado',
    cor:   '#22D3EE',
    bg:    'rgba(6, 182, 212, 0.10)',
    borda: 'rgba(6, 182, 212, 0.25)',
    icone: '✅',
    proximosStatus: ['PRONTO_RETIRADA', 'SAIU_ENTREGA'],
    acoes: [
      { status: 'PRONTO_RETIRADA', label: 'Pronto p/ Retirada' },
      { status: 'SAIU_ENTREGA', label: 'Saiu para Entrega' },
    ],
  },
  PRONTO_RETIRADA: {
    label:      'Pronto para Retirada',
    labelCurto: 'Pronto',
    cor:   '#34D399',
    bg:    'rgba(16, 185, 129, 0.10)',
    borda: 'rgba(16, 185, 129, 0.25)',
    icone: '🏪',
    proximosStatus: ['FINALIZADO', 'CANCELADO'],
    acoes: [
      { status: 'FINALIZADO', label: 'Finalizar Pedido' },
      { status: 'CANCELADO', label: 'Cancelar', perigo: true },
    ],
  },
  SAIU_ENTREGA: {
    label:      'Saiu para Entrega',
    labelCurto: 'Em Entrega',
    cor:   '#A78BFA',
    bg:    'rgba(124, 58, 237, 0.12)',
    borda: 'rgba(124, 58, 237, 0.30)',
    icone: '🛵',
    proximosStatus: ['FINALIZADO', 'CANCELADO'],
    acoes: [
      { status: 'FINALIZADO', label: 'Finalizar Pedido' },
      { status: 'CANCELADO', label: 'Cancelar', perigo: true },
    ],
  },
  FINALIZADO: {
    label:      'Finalizado',
    labelCurto: 'Finalizado',
    cor:   '#6B7280',
    bg:    'rgba(107, 114, 128, 0.10)',
    borda: 'rgba(107, 114, 128, 0.20)',
    icone: '🎉',
    proximosStatus: [],
    acoes: [],
  },
  CANCELADO: {
    label:      'Cancelado',
    labelCurto: 'Cancelado',
    cor:   '#F87171',
    bg:    'rgba(239, 68, 68, 0.10)',
    borda: 'rgba(239, 68, 68, 0.25)',
    icone: '❌',
    proximosStatus: [],
    acoes: [],
  },
}

export const STATUS_ORDER = [
  'NOVO_PEDIDO',
  'AGUARDANDO_CONFIRMACAO',
  'EM_SEPARACAO',
  'SEPARADO',
  'PRONTO_RETIRADA',
  'SAIU_ENTREGA',
  'FINALIZADO',
  'CANCELADO',
]

export const STATUS_ATIVOS = [
  'NOVO_PEDIDO',
  'AGUARDANDO_CONFIRMACAO',
  'EM_SEPARACAO',
  'SEPARADO',
  'PRONTO_RETIRADA',
  'SAIU_ENTREGA',
]

export function getStatusConfig(status) {
  return STATUS_CONFIG[status] ?? {
    label:      status,
    labelCurto: status,
    cor:   '#6B7280',
    bg:    'rgba(107,114,128,0.10)',
    borda: 'rgba(107,114,128,0.20)',
    icone: '❓',
    proximosStatus: [],
    acoes: [],
  }
}

export function podeTransicionar(statusAtual, novoStatus) {
  const config = getStatusConfig(statusAtual)
  return config.proximosStatus.includes(novoStatus)
}
