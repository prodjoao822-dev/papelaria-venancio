import { usePedidos } from '@/hooks/usePedidos'
import { STATUS, STATUS_CONFIG } from '@/utils/status'
import { StatusBadge } from '@/components/pedidos/StatusBadge'
import { formatCurrency, formatPhone } from '@/utils/formatters'

const ENTREGA_STATUSES = [STATUS.PRONTO_RETIRADA, STATUS.SAIU_ENTREGA]

export function LogisticaPage() {
  const { pedidos, carregando } = usePedidos()

  const pedidosEntrega = pedidos.filter(
    (p) =>
      ENTREGA_STATUSES.includes(p.status) ||
      p.forma_entrega !== 'retirada'
  )

  const porStatus = {
    [STATUS.PRONTO_RETIRADA]: pedidos.filter((p) => p.status === STATUS.PRONTO_RETIRADA),
    [STATUS.SAIU_ENTREGA]:    pedidos.filter((p) => p.status === STATUS.SAIU_ENTREGA),
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-info">
          <h1 className="page-titulo">Logística</h1>
          <p className="page-descricao">Retiradas pendentes e rotas de entrega</p>
        </div>
      </div>

      {/* Cards de resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        {Object.entries(porStatus).map(([status, list]) => {
          const cfg = STATUS_CONFIG[status]
          return (
            <div key={status} className="kpi-card" style={{ '--kpi-cor': cfg.cor }}>
              <div className="kpi-card-header">
                <div className="kpi-card-header-left">
                  <span className="kpi-card-icone">{cfg.icone}</span>
                  <span className="kpi-card-titulo">{cfg.labelCurto}</span>
                </div>
              </div>
              <div className="kpi-card-valor">{list.length}</div>
              <div className="kpi-card-footer">
                <div className="kpi-card-sub">{cfg.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Tabela de pedidos em logística */}
      <div className="card">
        <div style={{ padding: '16px 20px 0' }}>
          <span className="section-titulo">Pedidos em Logística</span>
        </div>

        {carregando ? (
          <div className="spinner-wrapper"><div className="spinner" /></div>
        ) : pedidosEntrega.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icone">🛵</span>
            <p className="empty-state-titulo">Nenhum pedido em logística</p>
            <p className="empty-state-desc">Pedidos prontos para retirada ou em rota aparecerão aqui.</p>
          </div>
        ) : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th className="tabela-th">#</th>
                  <th className="tabela-th">Cliente</th>
                  <th className="tabela-th">Forma</th>
                  <th className="tabela-th">Valor</th>
                  <th className="tabela-th">Status</th>
                  <th className="tabela-th"></th>
                </tr>
              </thead>
              <tbody>
                {pedidosEntrega.map((p) => (
                  <tr key={p.id} className="tabela-row">
                    <td className="tabela-cell">
                      <span className="pedido-numero">{p.protocolo}</span>
                    </td>
                    <td className="tabela-cell">
                      <div className="pedido-cliente-nome">{p.clientes?.nome ?? '—'}</div>
                      <div className="pedido-cliente-tel">{formatPhone(p.clientes?.telefone)}</div>
                    </td>
                    <td className="tabela-cell">
                      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        {{ retirada: 'Retirada', entrega_propria: 'Entrega própria', uber_flash: 'Uber Flash' }[p.forma_entrega] ?? '—'}
                      </span>
                    </td>
                    <td className="tabela-cell">
                      <span className="pedido-valor">{formatCurrency(p.valor_total)}</span>
                    </td>
                    <td className="tabela-cell">
                      <StatusBadge status={p.status} tamanho="sm" />
                    </td>
                    <td className="tabela-cell tabela-cell--acao">
                      <button className="btn btn-sm btn-ghost">Ver</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
