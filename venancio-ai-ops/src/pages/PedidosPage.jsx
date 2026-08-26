import { useState, useCallback, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FiltrosPedidos } from '@/components/pedidos/FiltrosPedidos'
import { PedidoRow } from '@/components/pedidos/PedidoRow'
import { PedidoModal } from '@/components/pedidos/PedidoModal'
import { RetiradasAgendadas } from '@/components/pedidos/RetiradasAgendadas'
import { RealtimeIndicator } from '@/components/dashboard/RealtimeIndicator'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { usePedidos } from '@/hooks/usePedidos'
import { useAtendimentoAtivo } from '@/hooks/useAtendimentoAtivo'

export function PedidosPage() {
  const [filtros, setFiltros] = useState({})
  const [pedidoSelecionado, setPedidoSelecionado] = useState(null)
  const location = useLocation()
  const navigate = useNavigate()

  const { pedidos, carregando, realtimeStatus, carregar } = usePedidos(filtros)
  const { mapa: mapaAtendimento } = useAtendimentoAtivo()

  // Aberto via busca global do Header (navigate('/pedidos', { state: { abrirPedidoId } })).
  useEffect(() => {
    if (location.state?.abrirPedidoId) {
      setPedidoSelecionado(location.state.abrirPedidoId)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state, location.pathname, navigate])

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

      {/* Painel de retiradas agendadas — aparece automaticamente quando houver pedidos com horário previsto */}
      <RetiradasAgendadas onAbrirPedido={(id) => setPedidoSelecionado(id)} />

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
                  <th className="tabela-th">Sequência</th>
                  <th className="tabela-th">Cliente</th>
                  <th className="tabela-th">Itens</th>
                  <th className="tabela-th">Valor</th>
                  <th className="tabela-th">Entrega</th>
                  <th className="tabela-th">Status</th>
                  <th className="tabela-th">Data/Hora</th>
                  <th className="tabela-th">Responsável</th>
                  <th className="tabela-th"></th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((pedido) => (
                  <PedidoRow
                    key={pedido.id}
                    pedido={pedido}
                    onClick={(p) => setPedidoSelecionado(p.id)}
                    nomeAtendente={mapaAtendimento[pedido.clientes?.id]}
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
