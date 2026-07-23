import { STATUS_ORCAMENTO_CONFIG } from '@/utils/constants'

export function StatusOrcBadge({ status, tamanho = 'md' }) {
  const cfg = STATUS_ORCAMENTO_CONFIG[status] ?? {
    label: status, cor: '#6B7280', bg: 'rgba(107,114,128,0.1)', borda: 'rgba(107,114,128,0.2)', icone: '❓',
  }

  const pad = tamanho === 'sm' ? '2px 7px' : tamanho === 'lg' ? '5px 12px' : '3px 9px'
  const fs  = tamanho === 'sm' ? '10px' : tamanho === 'lg' ? '13px' : '11px'

  return (
    <span
      className="status-orc-badge"
      style={{ color: cfg.cor, backgroundColor: cfg.bg, borderColor: cfg.borda, padding: pad, fontSize: fs }}
    >
      {cfg.icone} {cfg.label}
    </span>
  )
}
