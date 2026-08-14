import { useState, useMemo } from 'react'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { RealtimeIndicator } from '@/components/dashboard/RealtimeIndicator'
import { MetricasComerciais } from '@/components/dashboard/MetricasComerciais'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { PedidoRow } from '@/components/pedidos/PedidoRow'
import { PedidoModal } from '@/components/pedidos/PedidoModal'
import { NovoPedidoModal } from '@/components/pedidos/NovoPedidoModal'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { usePedidos, useKpis } from '@/hooks/usePedidos'
import { useAtendimentoAtivo } from '@/hooks/useAtendimentoAtivo'
import { ResumoAtendimentoOperadores } from '@/components/atendimento/ResumoAtendimentoOperadores'
import { STATUS } from '@/utils/status'

const ABAS = [
  { id: 'TODOS',        label: 'Todos',         statuses: null },
  { id: 'NOVOS',        label: 'Novos',         statuses: [STATUS.NOVO_PEDIDO, STATUS.AGUARDANDO_CONFIRMACAO] },
  { id: 'SEPARACAO',    label: 'Em Separação',  statuses: [STATUS.EM_SEPARACAO, STATUS.SEPARADO] },
  { id: 'PRONTOS',      label: 'Prontos',       statuses: [STATUS.PRONTO_RETIRADA, STATUS.SAIU_ENTREGA] },
  { id: 'CONCLUIDOS',   label: 'Concluídos',    statuses: [STATUS.FINALIZADO] },
]

function minutosEmStatus(createdAt) {
  if (!createdAt) return 0
  return Math.floor((Date.now() - new Date(createdAt)) / 60000)
}

export function DashboardPage() {
  const { pedidos, carregando, realtimeStatus, atualizarStatus } = usePedidos()
  const { kpis } = useKpis()
  const { mapa: mapaAtendimento, linhas: linhasAtendimento, carregando: carregandoAtendimento } = useAtendimentoAtivo()
  const [pedidoSelecionado, setPedidoSelecionado] = useState(null)
  const [novoPedidoAberto, setNovoPedidoAberto] = useState(false)
  const [abaAtiva, setAbaAtiva] = useState('TODOS')

  const pedidosAtivos = useMemo(
    () => pedidos.filter((p) => p.status !== STATUS.CANCELADO),
    [pedidos]
  )

  const pedidosFiltrados = useMemo(() => {
    const aba = ABAS.find((a) => a.id === abaAtiva)
    if (!aba || !aba.statuses) return pedidosAtivos
    return pedidosAtivos.filter((p) => aba.statuses.includes(p.status))
  }, [pedidosAtivos, abaAtiva])

  const pedidosAtrasados = useMemo(
    () =>
      pedidosAtivos.filter(
        (p) =>
          [STATUS.NOVO_PEDIDO, STATUS.AGUARDANDO_CONFIRMACAO, STATUS.EM_SEPARACAO].includes(p.status) &&
          minutosEmStatus(p.criado_em) > 30
      ),
    [pedidosAtivos]
  )

  function contagemAba(aba) {
    if (!aba.statuses) return pedidosAtivos.length
    return pedidosAtivos.filter((p) => aba.statuses.includes(p.status)).length
  }

  const totalHoje =
    Object.values(kpis?.contadores ?? {}).reduce((a, v) => a + v, 0)

  const kpiCards = [
    {
      titulo: 'Pedidos do Dia',
      valor: totalHoje,
      subtitulo: 'pedidos hoje',
      cor: '#3B82F6',
      icone: '📦',
      trend: totalHoje > 0 ? { direcao: 'up', percentual: '—', goodWhenDown: false } : null,
    },
    {
      titulo: 'Faturamento',
      valor: kpis?.faturamentoHoje ?? 0,
      subtitulo: 'pedidos finalizados',
      cor: '#10B981',
      icone: '💰',
      tipo: 'moeda',
      trend: (kpis?.faturamentoHoje ?? 0) > 0 ? { direcao: 'up', percentual: '—', goodWhenDown: false } : null,
    },
    {
      titulo: 'Em Produção',
      valor:
        (kpis?.contadores?.[STATUS.EM_SEPARACAO] ?? 0) +
        (kpis?.contadores?.[STATUS.SEPARADO] ?? 0),
      subtitulo: 'em separação/separados',
      cor: '#F59E0B',
      icone: '⚡',
    },
    {
      titulo: 'Alertas',
      valor: pedidosAtrasados.length,
      subtitulo: 'pedidos em atraso (>30min)',
      cor: pedidosAtrasados.length > 0 ? '#EF4444' : '#10B981',
      icone: pedidosAtrasados.length > 0 ? '⚠️' : '✅',
      trend:
        pedidosAtrasados.length > 0
          ? { direcao: 'up', percentual: pedidosAtrasados.length, goodWhenDown: true }
          : null,
    },
  ]

  return (
    <div className="page">

      {/* Cabeçalho da página */}
      <div className="page-header">
        <div className="page-header-info">
          <h1 className="page-titulo">Dashboard de Operações</h1>
          <p className="page-descricao">Visão em tempo real dos pedidos e produção</p>
        </div>
        <div className="page-header-acoes">
          <button className="btn btn-ghost btn-sm">
            📤 Exportar Relatório
          </button>
          <button className="btn btn-purple" onClick={() => setNovoPedidoAberto(true)}>
            ＋ Novo Pedido Manual
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        {kpiCards.map((card) => (
          <KpiCard key={card.titulo} {...card} />
        ))}
      </div>

      {/* Alertas de atraso */}
      {pedidosAtrasados.length > 0 && (
        <div
          className="alert-strip alert-strip--danger"
          role="alert"
        >
          <span className="alert-strip-icone">🚨</span>
          <div className="alert-strip-info">
            <span className="alert-strip-titulo">
              {pedidosAtrasados.length} pedido{pedidosAtrasados.length > 1 ? 's' : ''} em atraso
            </span>
            <span className="alert-strip-desc">
              Aguardando há mais de 30 minutos sem atualização de status
            </span>
          </div>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setAbaAtiva('NOVOS')}
          >
            Ver pedidos
          </button>
        </div>
      )}

      {/* Fila de Produção */}
      <div className="card">
        {/* Header da fila */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px 0',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="section-titulo">Fila de Produção</span>
            <RealtimeIndicator status={realtimeStatus} />
          </div>
          <span className="section-contagem">
            {pedidosFiltrados.length} {pedidosFiltrados.length === 1 ? 'pedido' : 'pedidos'}
          </span>
        </div>

        {/* Abas */}
        <div className="abas" style={{ marginTop: '12px' }}>
          {ABAS.map((aba) => {
            const count = contagemAba(aba)
            return (
              <button
                key={aba.id}
                className={`aba-btn ${abaAtiva === aba.id ? 'aba-btn--ativa' : ''}`}
                onClick={() => setAbaAtiva(aba.id)}
              >
                {aba.label}
                <span className="aba-count">{count}</span>
              </button>
            )
          })}
        </div>

        {/* Conteúdo */}
        {carregando ? (
          <LoadingSpinner mensagem="Carregando pedidos..." />
        ) : pedidosFiltrados.length === 0 ? (
          <EmptyState
            icone="📭"
            titulo="Nenhum pedido nesta fila"
            descricao="Pedidos novos aparecem aqui em tempo real."
          />
        ) : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th className="tabela-th">#</th>
                  <th className="tabela-th">Sequência</th>
                  <th className="tabela-th">Cliente</th>
                  <th className="tabela-th tabela-cell--itens">Itens</th>
                  <th className="tabela-th">Valor</th>
                  <th className="tabela-th">Entrega</th>
                  <th className="tabela-th">Status</th>
                  <th className="tabela-th">Tempo</th>
                  <th className="tabela-th">Responsável</th>
                  <th className="tabela-th"></th>
                </tr>
              </thead>
              <tbody>
                {pedidosFiltrados.map((pedido) => (
                  <PedidoRow
                    key={pedido.id}
                    pedido={pedido}
                    atrasado={pedidosAtrasados.some((a) => a.id === pedido.id)}
                    onClick={(p) => setPedidoSelecionado(p.id)}
                    nomeAtendente={mapaAtendimento[pedido.clientes?.id]}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Métricas comerciais + Feed de atividade lado a lado */}
      <div className="dashboard-bottom-grid">
        <div className="dashboard-bottom-main">
          <MetricasComerciais />
        </div>
        <div className="dashboard-bottom-side">
          <ResumoAtendimentoOperadores linhas={linhasAtendimento} carregando={carregandoAtendimento} />
          <ActivityFeed limite={15} />
        </div>
      </div>

      {/* Modal detalhe pedido */}
      {pedidoSelecionado && (
        <PedidoModal
          pedidoId={pedidoSelecionado}
          onFechar={() => setPedidoSelecionado(null)}
          onStatusAtualizado={() => {}}
        />
      )}

      {/* Modal novo pedido manual */}
      {novoPedidoAberto && (
        <NovoPedidoModal onFechar={() => setNovoPedidoAberto(false)} />
      )}
    </div>
  )
}
