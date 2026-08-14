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
    cor:   '#7C93F0',
    bg:    'rgba(108, 142, 239, 0.14)',
    borda: 'rgba(108, 142, 239, 0.30)',
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
    cor:   '#F0B23E',
    bg:    'rgba(240, 178, 62, 0.14)',
    borda: 'rgba(240, 178, 62, 0.30)',
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
    bg:    'rgba(251, 146, 60, 0.14)',
    borda: 'rgba(251, 146, 60, 0.30)',
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
    bg:    'rgba(34, 211, 238, 0.12)',
    borda: 'rgba(34, 211, 238, 0.28)',
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
    cor:   '#2FA85A',
    bg:    'rgba(47, 168, 90, 0.14)',
    borda: 'rgba(47, 168, 90, 0.28)',
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
    bg:    'rgba(167, 139, 250, 0.14)',
    borda: 'rgba(167, 139, 250, 0.30)',
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
    cor:   '#8A90A6',
    bg:    'rgba(138, 144, 166, 0.14)',
    borda: 'rgba(138, 144, 166, 0.25)',
    icone: '🎉',
    proximosStatus: [],
    acoes: [],
  },
  CANCELADO: {
    label:      'Cancelado',
    labelCurto: 'Cancelado',
    cor:   '#E5484D',
    bg:    'rgba(229, 72, 77, 0.14)',
    borda: 'rgba(229, 72, 77, 0.28)',
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
    cor:   '#8A90A6',
    bg:    'rgba(138,144,166,0.14)',
    borda: 'rgba(138,144,166,0.25)',
    icone: '❓',
    proximosStatus: [],
    acoes: [],
  }
}

export function podeTransicionar(statusAtual, novoStatus) {
  const config = getStatusConfig(statusAtual)
  return config.proximosStatus.includes(novoStatus)
}
