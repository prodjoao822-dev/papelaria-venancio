import { getStatusConfig } from '@/utils/status'

export function StatusBadge({ status, tamanho = 'md' }) {
  const config = getStatusConfig(status)

  return (
    <span
      className={`status-badge status-badge--${tamanho}`}
      style={{
        color: config.cor,
        backgroundColor: config.bg,
        borderColor: config.borda,
      }}
    >
      <span className="status-badge-icone">{config.icone}</span>
      <span className="status-badge-label">
        {tamanho === 'sm' ? config.labelCurto : config.label}
      </span>
    </span>
  )
}
