export function RealtimeIndicator({ status }) {
  const config = {
    conectando: { label: 'Conectando...', cor: '#D97706', pulsando: true },
    conectado: { label: 'Atualização em tempo real ativa', cor: '#16A34A', pulsando: true },
    desconectado: { label: 'Desconectado', cor: '#DC2626', pulsando: false },
    erro: { label: 'Erro de conexão', cor: '#DC2626', pulsando: false },
  }

  const cfg = config[status] ?? config.conectando

  return (
    <div className="realtime-indicator">
      <span
        className={`realtime-dot ${cfg.pulsando ? 'realtime-dot--pulso' : ''}`}
        style={{ backgroundColor: cfg.cor }}
      />
      <span className="realtime-label" style={{ color: cfg.cor }}>
        {cfg.label}
      </span>
    </div>
  )
}
