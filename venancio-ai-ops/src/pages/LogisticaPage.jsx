import { useState } from 'react'
import { usePedidos } from '@/hooks/usePedidos'
import { STATUS } from '@/utils/status'
import { formatPhone, formatTimeAgo } from '@/utils/formatters'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'

export function LogisticaPage() {
  const { pedidos, carregando, carregar, atualizarStatus } = usePedidos()
  const [finalizando, setFinalizando] = useState(null)

  const prontoRetirada = pedidos.filter((p) => p.status === STATUS.PRONTO_RETIRADA)
  const emEntrega = pedidos.filter((p) => p.status === STATUS.SAIU_ENTREGA)

  async function handleMarcarEntregue(pedido) {
    setFinalizando(pedido.id)
    try {
      await atualizarStatus(pedido.id, STATUS.FINALIZADO)
    } catch {
      // erro já reportado via toast dentro de usePedidos
    } finally {
      setFinalizando(null)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-info">
          <h1 className="page-titulo">Logística</h1>
          <p className="page-descricao">Retiradas pendentes e rotas de entrega</p>
        </div>
        <div className="page-header-acoes">
          <button className="btn btn-ghost btn-sm" onClick={() => carregar()}>↺ Atualizar</button>
        </div>
      </div>

      {carregando ? (
        <div className="card"><LoadingSpinner mensagem="Carregando logística..." /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 20 }}>

          {/* Pronto para Retirada */}
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.7px', textTransform: 'uppercase', marginBottom: 14, color: 'var(--text-3)' }}>
              Pronto para Retirada
            </div>
            {prontoRetirada.length === 0 ? (
              <EmptyState icone="🏪" titulo="Nada pra retirar" descricao="Pedidos prontos para retirada aparecem aqui." />
            ) : (
              prontoRetirada.map((p) => (
                <div key={p.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{p.clientes?.nome ?? '—'}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>
                    {p.sequencia || p.protocolo} · {formatPhone(p.clientes?.telefone)} · desde {formatTimeAgo(p.pronto_para_retirada_em)}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Em Entrega */}
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.7px', textTransform: 'uppercase', marginBottom: 14, color: 'var(--text-3)' }}>
              Em Entrega
            </div>
            {emEntrega.length === 0 ? (
              <EmptyState icone="🛵" titulo="Nenhuma entrega em rota" descricao="Pedidos saídos para entrega aparecem aqui." />
            ) : (
              emEntrega.map((p) => {
                const terceirizada = p.forma_entrega === 'uber_flash'
                const responsavelLabel = terceirizada
                  ? (p.entrega_terceirizada_obs || 'Terceirizada')
                  : (p.responsavel_entrega?.nome ?? '— sem responsável —')

                return (
                  <div
                    key={p.id}
                    style={{
                      padding: '14px 0', borderBottom: '1px solid var(--border)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{p.clientes?.nome ?? '—'}</span>
                        <span
                          style={{
                            fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                            background: terceirizada ? 'var(--bg-hover)' : 'var(--primary-bg)',
                            color: terceirizada ? 'var(--text-2)' : 'var(--primary)',
                          }}
                        >
                          {terceirizada ? 'Terceirizada' : 'Interna'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
                        {p.endereco_entrega || 'Endereço não informado'}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>
                        {p.sequencia || p.protocolo} · Resp.: {responsavelLabel}
                      </div>
                    </div>
                    <button
                      className="btn btn-sm btn-primary"
                      style={{ whiteSpace: 'nowrap' }}
                      onClick={() => handleMarcarEntregue(p)}
                      disabled={finalizando === p.id}
                    >
                      {finalizando === p.id ? '...' : 'Marcar como Entregue'}
                    </button>
                  </div>
                )
              })
            )}
          </div>

        </div>
      )}
    </div>
  )
}
