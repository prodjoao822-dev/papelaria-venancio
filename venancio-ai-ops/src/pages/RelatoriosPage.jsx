import { useState, useEffect } from 'react'
import { useMetricas } from '@/hooks/useMetricas'
import { metricasService } from '@/services/metricas.service'
import { formatCurrency } from '@/utils/formatters'
import { STATUS_CONFIG } from '@/utils/status'
import { useKpis } from '@/hooks/usePedidos'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

// ─────────────────────────────────────────────────────────────────────────────
// GRÁFICO DE BARRAS CSS — Faturamento 7 dias
// ─────────────────────────────────────────────────────────────────────────────

function GraficoSemanal({ dados }) {
  if (!dados || dados.length === 0) return null

  const maximo = Math.max(...dados.map((d) => d.valor), 1)
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  return (
    <div className="grafico-barras">
      {dados.map((d, i) => {
        const altura = Math.max((d.valor / maximo) * 100, d.valor > 0 ? 4 : 0)
        const isHoje = new Date(d.dia).toDateString() === hoje.toDateString()
        return (
          <div key={i} className="grafico-barra-col">
            <span className="grafico-barra-valor">
              {d.valor > 0 ? formatCurrency(d.valor) : ''}
            </span>
            <div
              className={`grafico-barra ${isHoje ? 'grafico-barra--hoje' : ''}`}
              style={{ height: `${altura}%` }}
              title={`${d.label}: ${formatCurrency(d.valor)}`}
            />
            <span className={`grafico-barra-label ${isHoje ? 'grafico-barra-label--hoje' : ''}`}>
              {d.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI CARD FINANCEIRO
// ─────────────────────────────────────────────────────────────────────────────

function FinKpiCard({ titulo, valor, subtitulo, cor, icone, tipo, trend }) {
  const formatado =
    tipo === 'moeda'
      ? formatCurrency(valor ?? 0)
      : tipo === 'pct'
      ? `${valor ?? 0}%`
      : (valor ?? 0).toLocaleString('pt-BR')

  const trendPos = trend?.valor > 0
  const trendLabel = trend ? `${trendPos ? '▲' : '▼'} ${Math.abs(trend.valor)}%` : null

  return (
    <div className="fin-kpi-card" style={{ '--fin-cor': cor }}>
      <div className="fin-kpi-icone">{icone}</div>
      <div className="fin-kpi-body">
        <p className="fin-kpi-titulo">{titulo}</p>
        <p className="fin-kpi-valor">{formatado}</p>
        <div className="fin-kpi-rodape">
          <span className="fin-kpi-subtitulo">{subtitulo}</span>
          {trendLabel && (
            <span
              className="fin-kpi-trend"
              style={{ color: trendPos ? '#10B981' : '#EF4444' }}
            >
              {trendLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MINI GAUGE — Taxa de conversão visual
// ─────────────────────────────────────────────────────────────────────────────

function MiniGauge({ pct, cor }) {
  const safe = Math.min(Math.max(pct ?? 0, 0), 100)
  return (
    <div className="mini-gauge">
      <div className="mini-gauge-track">
        <div
          className="mini-gauge-fill"
          style={{ width: `${safe}%`, background: cor ?? '#3B82F6' }}
        />
      </div>
      <span className="mini-gauge-pct" style={{ color: cor }}>{safe}%</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function RelatoriosPage() {
  const { metricas, carregando } = useMetricas(120000)
  const { kpis } = useKpis()
  const [historico, setHistorico] = useState(null)
  const [historicoErro, setHistoricoErro] = useState(false)
  const [periodoFiltro, setPeriodoFiltro] = useState('hoje')
  const [capacidade, setCapacidade] = useState(null)
  const [capacidadeErro, setCapacidadeErro] = useState(false)

  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  function carregarHistorico() {
    setHistoricoErro(false)
    metricasService
      .buscarHistorico7Dias()
      .then((d) => setHistorico(d))
      .catch(() => setHistoricoErro(true))
  }

  function carregarCapacidade() {
    setCapacidadeErro(false)
    Promise.all([
      metricasService.getTaxaResolucaoIA('semana'),
      metricasService.getTempoMedioAtendimento(),
      metricasService.getTempoMedioSeparacao(),
      metricasService.getVolumePeriodo(),
    ])
      .then(([taxaResolucaoIA, tempoAtendimento, tempoSeparacao, volume]) =>
        setCapacidade({ taxaResolucaoIA, tempoAtendimento, tempoSeparacao, volume })
      )
      .catch(() => setCapacidadeErro(true))
  }

  useEffect(() => {
    carregarHistorico()
    carregarCapacidade()
  }, [])

  // Trend vs ontem
  function trendVsOntem(hoje_, ontem) {
    if (!ontem || ontem === 0) return null
    const pct = Math.round(((hoje_ - ontem) / ontem) * 100)
    return { valor: pct }
  }

  const m = metricas ?? {}
  const fatHoje = m.fat_hoje ?? 0
  const fatOntem = m.fat_ontem ?? 0
  const fatMes = m.fat_mes ?? 0
  const pedidosHoje = m.pedidos_hoje ?? 0
  const pedidosOntem = m.pedidos_ontem ?? 0
  const ticketMedio = m.ticket_medio ?? 0
  const conversaoRate = m.conversao_rate ?? 0
  const clientesAtivos = m.clientes_ativos ?? 0
  const orcamentosHoje = m.orcamentos_hoje ?? 0
  const finalizadosHoje = m.finalizados_hoje ?? 0
  const canceladosHoje = m.cancelados_hoje ?? 0

  // Faturamento semanal (soma do histórico exceto hoje)
  const fatSemana = (historico ?? []).reduce((acc, d) => {
    const isHoje = new Date(d.dia).toDateString() === new Date().toDateString()
    return acc + (isHoje ? 0 : d.valor)
  }, 0)

  const kpiCards = [
    {
      titulo: 'Faturamento Hoje',
      valor: fatHoje,
      subtitulo: `${finalizadosHoje} pedidos finalizados`,
      cor: '#10B981',
      icone: '💰',
      tipo: 'moeda',
      trend: trendVsOntem(fatHoje, fatOntem),
    },
    {
      titulo: 'Faturamento da Semana',
      valor: fatSemana,
      subtitulo: 'últimos 6 dias',
      cor: '#3B82F6',
      icone: '📅',
      tipo: 'moeda',
    },
    {
      titulo: 'Faturamento do Mês',
      valor: fatMes,
      subtitulo: new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      cor: '#7C3AED',
      icone: '📊',
      tipo: 'moeda',
    },
    {
      titulo: 'Pedidos Hoje',
      valor: pedidosHoje,
      subtitulo: `${canceladosHoje} cancelados`,
      cor: '#F59E0B',
      icone: '📦',
      trend: trendVsOntem(pedidosHoje, pedidosOntem),
    },
    {
      titulo: 'Ticket Médio',
      valor: ticketMedio,
      subtitulo: 'pedidos finalizados',
      cor: '#06B6D4',
      icone: '🎯',
      tipo: 'moeda',
    },
    {
      titulo: 'Clientes Ativos',
      valor: clientesAtivos,
      subtitulo: 'compraram ao menos 1x',
      cor: '#EC4899',
      icone: '👥',
    },
  ]

  function handleExportarCsv() {
    const linhas = [
      ['Métrica', 'Valor'],
      ...kpiCards.map((c) => [c.titulo, c.tipo === 'moeda' ? formatCurrency(c.valor) : String(c.valor)]),
      [],
      ['Dia', 'Faturamento'],
      ...(historico ?? []).map((d) => [d.label, formatCurrency(d.valor)]),
    ]
    const csv = linhas.map((linha) => linha.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-venancio-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page">

      {/* Header */}
      <div className="page-header">
        <div className="page-header-info">
          <h1 className="page-titulo">Relatórios & Financeiro</h1>
          <p className="page-descricao">{hoje}</p>
        </div>
        <div className="page-header-acoes">
          <button className="btn btn-ghost btn-sm" onClick={handleExportarCsv}>📤 Exportar CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>🖨️ Imprimir</button>
        </div>
      </div>

      {/* KPI grid 3x2 */}
      {carregando ? (
        <div className="card">
          <LoadingSpinner mensagem="Carregando métricas comerciais..." />
        </div>
      ) : (
        <div className="fin-kpi-grid">
          {kpiCards.map((card) => (
            <FinKpiCard key={card.titulo} {...card} />
          ))}
        </div>
      )}

      {/* Gráfico semanal + Conversão */}
      <div className="relatorio-row-2col">

        {/* Gráfico de barras */}
        <div className="card">
          <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p className="card-titulo" style={{ padding: 0, margin: 0 }}>Faturamento — Últimos 7 dias</p>
            <span className="section-contagem">
              {historico ? formatCurrency(historico.reduce((a, d) => a + d.valor, 0)) : '—'}
            </span>
          </div>
          <div style={{ padding: '16px 20px 20px' }}>
            {historicoErro ? (
              <ErrorState
                titulo="Não foi possível carregar o faturamento dos últimos 7 dias"
                detalhe="Verifique a conexão com o Supabase."
                onRetry={carregarHistorico}
                compacto
              />
            ) : historico ? (
              <GraficoSemanal dados={historico} />
            ) : (
              <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
                Carregando...
              </div>
            )}
          </div>
        </div>

        {/* Conversão + métricas rápidas */}
        <div className="card">
          <p className="card-titulo">Desempenho</p>
          <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div className="relatorio-metrica-item">
              <div className="relatorio-metrica-info">
                <span className="relatorio-metrica-titulo">Taxa de Conversão</span>
                <span className="relatorio-metrica-sub">orçamentos → pedidos (mês)</span>
              </div>
              <MiniGauge pct={conversaoRate} cor="#10B981" />
            </div>

            <div className="relatorio-metrica-item">
              <div className="relatorio-metrica-info">
                <span className="relatorio-metrica-titulo">Orçamentos Hoje</span>
                <span className="relatorio-metrica-sub">criados no dia</span>
              </div>
              <span className="relatorio-metrica-valor" style={{ color: '#3B82F6' }}>
                {orcamentosHoje}
              </span>
            </div>

            <div className="relatorio-metrica-item">
              <div className="relatorio-metrica-info">
                <span className="relatorio-metrica-titulo">Pedidos do Mês</span>
                <span className="relatorio-metrica-sub">total em {new Date().toLocaleDateString('pt-BR', { month: 'long' })}</span>
              </div>
              <span className="relatorio-metrica-valor" style={{ color: '#F59E0B' }}>
                {m.pedidos_mes ?? 0}
              </span>
            </div>

            <div className="relatorio-metrica-item">
              <div className="relatorio-metrica-info">
                <span className="relatorio-metrica-titulo">Cancelados Hoje</span>
                <span className="relatorio-metrica-sub">pedidos cancelados</span>
              </div>
              <span className="relatorio-metrica-valor" style={{ color: canceladosHoje > 0 ? '#EF4444' : '#10B981' }}>
                {canceladosHoje}
              </span>
            </div>

          </div>
        </div>
      </div>

      {/* Breakdown por status */}
      <div className="card">
        <p className="card-titulo">Pedidos de Hoje por Status</p>
        <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
            const count = kpis?.contadores?.[status] ?? 0
            if (count === 0) return null
            const total = Object.values(kpis?.contadores ?? {}).reduce((a, v) => a + v, 0)
            const pct = total > 0 ? Math.round((count / total) * 100) : 0
            return (
              <div key={status} className="relatorio-status-row">
                <span className="relatorio-status-icone">{cfg.icone}</span>
                <span className="relatorio-status-label">{cfg.label}</span>
                <div className="relatorio-status-barra-wrap">
                  <div
                    className="relatorio-status-barra"
                    style={{ width: `${pct}%`, background: cfg.cor }}
                  />
                </div>
                <span className="relatorio-status-count" style={{ color: cfg.cor }}>
                  {count}
                </span>
              </div>
            )
          })}
          {Object.values(kpis?.contadores ?? {}).every((v) => v === 0) && (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <span className="empty-state-icone">📊</span>
              <p className="empty-state-titulo">Nenhum pedido hoje ainda</p>
            </div>
          )}
        </div>
      </div>

      {/* Capacidade operacional (PROMPT-01, Entrega 1) */}
      <div className="card">
        <p className="card-titulo">Capacidade Operacional — últimos 7 dias</p>
        {capacidadeErro ? (
          <div style={{ padding: '0 20px 20px' }}>
            <ErrorState
              titulo="Não foi possível carregar as métricas de capacidade"
              detalhe="Verifique a conexão com o Supabase."
              onRetry={carregarCapacidade}
              compacto
            />
          </div>
        ) : !capacidade ? (
          <div style={{ padding: '0 20px 20px', color: 'var(--text-3)' }}>Carregando...</div>
        ) : (
          <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div className="relatorio-metrica-item">
              <div className="relatorio-metrica-info">
                <span className="relatorio-metrica-titulo">Taxa de Resolução por IA</span>
                <span className="relatorio-metrica-sub">
                  {capacidade.taxaResolucaoIA.resolvidas_ia} de {capacidade.taxaResolucaoIA.total} conversas sem intervenção humana
                </span>
              </div>
              <MiniGauge pct={capacidade.taxaResolucaoIA.taxa} cor="#8B5CF6" />
            </div>

            <div className="relatorio-metrica-item">
              <div className="relatorio-metrica-info">
                <span className="relatorio-metrica-titulo">Tempo Médio de Separação</span>
                <span className="relatorio-metrica-sub">
                  {capacidade.tempoSeparacao.total_separacoes} separações concluídas
                </span>
              </div>
              <span className="relatorio-metrica-valor" style={{ color: '#FB923C' }}>
                {capacidade.tempoSeparacao.total_separacoes > 0
                  ? `${capacidade.tempoSeparacao.tempo_medio_min} min`
                  : '—'}
              </span>
            </div>

            {capacidade.tempoAtendimento.length > 0 && (
              <div>
                <span className="relatorio-metrica-titulo">Tempo Médio de Atendimento por Operador</span>
                <div className="tabela-wrapper" style={{ marginTop: 8 }}>
                  <table className="tabela">
                    <thead>
                      <tr>
                        <th className="tabela-th">Operador</th>
                        <th className="tabela-th">Pedidos</th>
                        <th className="tabela-th">Tempo Médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {capacidade.tempoAtendimento.map((op) => (
                        <tr key={op.operador_nome} className="tabela-tr">
                          <td className="tabela-td">{op.operador_nome}</td>
                          <td className="tabela-td">{op.total_pedidos}</td>
                          <td className="tabela-td">{op.tempo_medio_min} min</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <span className="relatorio-metrica-titulo">Volume por Dia</span>
              <div className="tabela-wrapper" style={{ marginTop: 8 }}>
                <table className="tabela">
                  <thead>
                    <tr>
                      <th className="tabela-th">Dia</th>
                      <th className="tabela-th">Conversas</th>
                      <th className="tabela-th">Pedidos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {capacidade.volume.map((v) => (
                      <tr key={v.dia} className="tabela-tr">
                        <td className="tabela-td">{v.label}</td>
                        <td className="tabela-td">{v.conversas}</td>
                        <td className="tabela-td">{v.pedidos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Resumo financeiro tabular */}
      <div className="card">
        <p className="card-titulo">Resumo Financeiro</p>
        <div className="tabela-wrapper">
          <table className="tabela">
            <thead>
              <tr>
                <th className="tabela-th">Período</th>
                <th className="tabela-th">Pedidos</th>
                <th className="tabela-th">Faturamento</th>
                <th className="tabela-th">Ticket Médio</th>
              </tr>
            </thead>
            <tbody>
              <tr className="tabela-tr">
                <td className="tabela-td" style={{ fontWeight: 600 }}>Hoje</td>
                <td className="tabela-td">{pedidosHoje}</td>
                <td className="tabela-td" style={{ color: 'var(--success)', fontWeight: 600 }}>
                  {formatCurrency(fatHoje)}
                </td>
                <td className="tabela-td">
                  {pedidosHoje > 0 ? formatCurrency(fatHoje / pedidosHoje) : '—'}
                </td>
              </tr>
              <tr className="tabela-tr">
                <td className="tabela-td" style={{ fontWeight: 600 }}>Ontem</td>
                <td className="tabela-td">{pedidosOntem}</td>
                <td className="tabela-td" style={{ color: 'var(--text-2)' }}>
                  {formatCurrency(fatOntem)}
                </td>
                <td className="tabela-td">
                  {pedidosOntem > 0 ? formatCurrency(fatOntem / pedidosOntem) : '—'}
                </td>
              </tr>
              <tr className="tabela-tr">
                <td className="tabela-td" style={{ fontWeight: 600 }}>
                  {new Date().toLocaleDateString('pt-BR', { month: 'long' })}
                </td>
                <td className="tabela-td">{m.pedidos_mes ?? 0}</td>
                <td className="tabela-td" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                  {formatCurrency(fatMes)}
                </td>
                <td className="tabela-td">
                  {(m.pedidos_mes ?? 0) > 0 ? formatCurrency(fatMes / m.pedidos_mes) : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
