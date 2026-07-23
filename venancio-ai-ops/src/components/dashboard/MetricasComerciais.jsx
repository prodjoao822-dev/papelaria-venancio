import { formatCurrency } from '@/utils/formatters'
import { useMetricas } from '@/hooks/useMetricas'

function calcTrend(atual, anterior) {
  if (!anterior || anterior === 0) return null
  const diff = ((atual - anterior) / anterior) * 100
  return { direcao: diff >= 0 ? 'up' : 'down', percentual: Math.abs(diff).toFixed(1) }
}

function MetricaCard({ titulo, valor, sub, cor, icone, trend, goodWhenDown = false }) {
  let trendClass = 'metrica-trend--neutro'
  if (trend) {
    const isGood = goodWhenDown ? trend.direcao === 'down' : trend.direcao === 'up'
    trendClass = isGood ? 'metrica-trend--up' : 'metrica-trend--down'
  }

  return (
    <div className="metrica-card" style={{ '--mc-cor': cor }}>
      <div className="metrica-card-titulo">{icone} {titulo}</div>
      <div className="metrica-card-valor">{valor}</div>
      <div className="metrica-card-rodape">
        <span className="metrica-card-sub">{sub}</span>
        {trend && (
          <span className={`metrica-trend ${trendClass}`}>
            {trend.direcao === 'up' ? '↑' : '↓'}{trend.percentual}%
          </span>
        )}
      </div>
    </div>
  )
}

export function MetricasComerciais() {
  const { metricas, carregando } = useMetricas(90000)

  if (carregando || !metricas) {
    return (
      <div className="metricas-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="metrica-card" style={{ '--mc-cor': '#3B82F6' }}>
            <div className="metrica-card-titulo">Carregando...</div>
            <div className="metrica-card-valor" style={{ color: 'var(--text-3)' }}>—</div>
          </div>
        ))}
      </div>
    )
  }

  const trendPedidos = calcTrend(metricas.pedidos_hoje, metricas.pedidos_ontem)
  const trendFat     = calcTrend(metricas.fat_hoje,     metricas.fat_ontem)

  // Barra de progresso do mês vs hoje
  const progMes = metricas.pedidos_mes > 0
    ? Math.min(100, Math.round((metricas.pedidos_hoje / metricas.pedidos_mes) * 100 * 30))
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="section-header">
        <div className="section-header-esquerda">
          <span className="section-titulo">Métricas Comerciais</span>
          <span className="section-contagem">atualiza a cada 90s</span>
        </div>
      </div>

      <div className="metricas-grid">
        <MetricaCard
          titulo="Pedidos Hoje"
          valor={metricas.pedidos_hoje ?? 0}
          sub={`vs ontem: ${metricas.pedidos_ontem ?? 0}`}
          cor="#3B82F6"
          icone="📦"
          trend={trendPedidos}
        />
        <MetricaCard
          titulo="Faturamento Hoje"
          valor={formatCurrency(metricas.fat_hoje ?? 0)}
          sub={`vs ontem: ${formatCurrency(metricas.fat_ontem ?? 0)}`}
          cor="#10B981"
          icone="💰"
          trend={trendFat}
        />
        <MetricaCard
          titulo="Ticket Médio"
          valor={formatCurrency(metricas.ticket_medio ?? 0)}
          sub="pedidos finalizados (mês)"
          cor="#F59E0B"
          icone="🎯"
        />
        <MetricaCard
          titulo="Taxa de Conversão"
          valor={`${metricas.conversao_rate ?? 0}%`}
          sub="orçamentos → pedidos (mês)"
          cor="#7C3AED"
          icone="🔄"
        />
        <MetricaCard
          titulo="Faturamento Mensal"
          valor={formatCurrency(metricas.fat_mes ?? 0)}
          sub={`${metricas.pedidos_mes ?? 0} pedidos no mês`}
          cor="#06B6D4"
          icone="📈"
        />
        <MetricaCard
          titulo="Clientes Ativos"
          valor={metricas.clientes_ativos ?? 0}
          sub="com pedidos finalizados"
          cor="#8B5CF6"
          icone="👥"
        />
        <MetricaCard
          titulo="Finalizados Hoje"
          valor={metricas.finalizados_hoje ?? 0}
          sub={`cancelados: ${metricas.cancelados_hoje ?? 0}`}
          cor="#10B981"
          icone="✅"
        />
        <MetricaCard
          titulo="Cancelados Hoje"
          valor={metricas.cancelados_hoje ?? 0}
          sub="cancelamentos do dia"
          cor="#EF4444"
          icone="❌"
          goodWhenDown
        />
      </div>
    </div>
  )
}
