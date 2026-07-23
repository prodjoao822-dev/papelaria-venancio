import { formatCurrency } from '@/utils/formatters'

export function KpiCard({
  titulo,
  valor,
  subtitulo,
  cor,
  icone,
  tipo = 'numero',
  trend,        // { direcao: 'up'|'down', percentual: '12.5', ontem: 126, goodWhenDown: false }
  comparacao,   // texto livre debaixo: "vs ontem (126)"
}) {
  const valorFormatado = tipo === 'moeda' ? formatCurrency(valor) : (valor ?? 0)

  let trendClass = ''
  let trendLabel = ''
  if (trend) {
    const isGood = trend.goodWhenDown ? trend.direcao === 'down' : trend.direcao === 'up'
    if (trend.direcao === 'up')   trendClass = isGood ? 'kpi-card-trend--up'    : 'kpi-card-trend--down'
    if (trend.direcao === 'down') trendClass = isGood ? 'kpi-card-trend--good-down' : 'kpi-card-trend--down'
    const seta = trend.direcao === 'up' ? '↑' : '↓'
    trendLabel = `${seta}${trend.percentual}%`
  }

  return (
    <div className="kpi-card" style={{ '--kpi-cor': cor }}>
      <div className="kpi-card-header">
        <div className="kpi-card-header-left">
          <span className="kpi-card-icone">{icone}</span>
          <span className="kpi-card-titulo">{titulo}</span>
        </div>
        {trend && (
          <span className={`kpi-card-trend ${trendClass}`}>
            {trendLabel}
          </span>
        )}
      </div>

      <div className="kpi-card-valor">{valorFormatado}</div>

      <div className="kpi-card-footer">
        {subtitulo && <div className="kpi-card-sub">{subtitulo}</div>}
        {comparacao && <div className="kpi-card-comparacao">{comparacao}</div>}
      </div>
    </div>
  )
}
