import { useState, useCallback } from 'react'
import { FiltrosPedidos } from '@/components/pedidos/FiltrosPedidos'
import { PedidoRow } from '@/components/pedidos/PedidoRow'
import { PedidoModal } from '@/components/pedidos/PedidoModal'
import { RealtimeIndicator } from '@/components/dashboard/RealtimeIndicator'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { usePedidos } from '@/hooks/usePedidos'

export function PedidosPage() {
  const [filtros, setFiltros] = useState({})
  const [pedidoSelecionado, setPedidoSelecionado] = useState(null)

  const { pedidos, carregando, realtimeStatus, carregar } = usePedidos(filtros)

  const handleFiltroChange = useCallback(
    (novosFiltros) => {
      setFiltros(novosFiltros)
      carregar(novosFiltros)
    },
    [carregar]
  )

  return (
    <div className="page">
      <div className="section-header">
        <div className="section-header-esquerda">
          <RealtimeIndicator status={realtimeStatus} />
        </div>
        <div className="section-header-direita">
          <span className="section-contagem">{pedidos.length} pedido(s)</span>
          <button className="btn btn-ghost btn-sm" onClick={() => carregar(filtros)}>
            ↺ Recarregar
          </button>
        </div>
      </div>

      <FiltrosPedidos filtros={filtros} onChange={handleFiltroChange} />

      <div className="card">
        {carregando ? (
          <LoadingSpinner mensagem="Carregando pedidos..." />
        ) : pedidos.length === 0 ? (
          <EmptyState
            icone="🔍"
            titulo="Nenhum pedido encontrado"
            descricao="Tente ajustar os filtros ou aguarde novos pedidos."
            acao={{ label: 'Limpar filtros', onClick: () => handleFiltroChange({}) }}
          />
        ) : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th className="tabela-th">#</th>
                  <th className="tabela-th">Cliente</th>
                  <th className="tabela-th">Itens</th>
                  <th className="tabela-th">Valor</th>
                  <th className="tabela-th">Entrega</th>
                  <th className="tabela-th">Status</th>
                  <th className="tabela-th">Data/Hora</th>
                  <th className="tabela-th"></th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((pedido) => (
                  <PedidoRow
                    key={pedido.id}
                    pedido={pedido}
                    onClick={(p) => setPedidoSelecionado(p.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pedidoSelecionado && (
        <PedidoModal
          pedidoId={pedidoSelecionado}
          onFechar={() => setPedidoSelecionado(null)}
          onStatusAtualizado={() => carregar(filtros)}
        />
      )}
    </div>
  )
}
