import { useState, useEffect, useCallback } from 'react'
import { demandIntelligenceService } from '@/services/demand-intelligence.service'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { useToast } from '@/contexts/AppContext'
import { formatCurrency } from '@/utils/formatters'
import { DEMAND_ALERT_STATUS_CONFIG, DEMO_MODE } from '@/utils/constants'

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_TOP = [
  { produto_nome: 'Caderno Universitário 10 matérias', produto_id: null, total_consultas: 28, sem_estoque_pct: 10, converteu_pct: 71 },
  { produto_nome: 'Caneta BIC Cristal preta', produto_id: null, total_consultas: 22, sem_estoque_pct: 0, converteu_pct: 82 },
  { produto_nome: 'Mochila Capricho Rosa', produto_id: null, total_consultas: 17, sem_estoque_pct: 100, converteu_pct: 0 },
  { produto_nome: 'Papel A4 Chamex 500 folhas', produto_id: null, total_consultas: 14, sem_estoque_pct: 7, converteu_pct: 64 },
  { produto_nome: 'Lápis de cor 24 cores', produto_id: null, total_consultas: 9, sem_estoque_pct: 33, converteu_pct: 44 },
]

const MOCK_OPORTUNIDADES = [
  { produto_nome: 'Mochila Capricho Rosa',          total_consultas: 17, receita_estimada: 2718.30 },
  { produto_nome: 'Estojo Rebecca Bonbon',          total_consultas: 11, receita_estimada: 659.00  },
  { produto_nome: 'Régua flexível 30cm transparente', total_consultas: 8, receita_estimada: 48.00  },
]

const MOCK_ALERTAS = [
  { id: 'a1', produto_nome: 'Mochila Capricho Rosa',   total_consultas: 17, sem_estoque: true,  status: 'novo',  created_at: new Date(Date.now() - 2*3600000).toISOString() },
  { id: 'a2', produto_nome: 'Caderno 10 matérias', total_consultas: 28, sem_estoque: false, status: 'visto', created_at: new Date(Date.now() - 6*3600000).toISOString() },
]

const MOCK_RESUMO = { total: 98, respondidos: 41, consultados: 22, nao_encontrados: 18, sem_estoque: 17, convertidos: 54 }

// ── Barra de progresso simples ────────────────────────────────────────────────

function MiniBar({ valor, max, cor }) {
  const pct = max > 0 ? Math.min(100, (valor / max) * 100) : 0
  return (
    <div className="demand-mini-bar-track">
      <div className="demand-mini-bar-fill" style={{ width: `${pct}%`, background: cor }} />
    </div>
  )
}

// ── Linha de produto no ranking ───────────────────────────────────────────────

function DemandRow({ item, rank, maxConsultas }) {
  const semEstoqueAlto = item.sem_estoque_pct >= 50

  return (
    <div className="demand-row">
      <span className="demand-row-rank" style={{ color: rank <= 3 ? 'var(--warning)' : 'var(--text-3)' }}>
        #{rank}
      </span>
      <div className="demand-row-info">
        <span className="demand-row-nome">{item.produto_nome}</span>
        <MiniBar valor={item.total_consultas} max={maxConsultas} cor="var(--primary)" />
      </div>
      <div className="demand-row-stats">
        <span className="demand-stat">{item.total_consultas} consultas</span>
        <span className={`demand-stat ${semEstoqueAlto ? 'demand-stat--danger' : ''}`}>
          {item.sem_estoque_pct}% sem estoque
        </span>
        <span className="demand-stat demand-stat--success">{item.converteu_pct}% converte</span>
      </div>
    </div>
  )
}

// ── Card de oportunidade perdida ──────────────────────────────────────────────

function OportunidadeCard({ item, rank }) {
  return (
    <div className="oportunidade-card">
      <div className="oportunidade-card-header">
        <span className="oportunidade-rank">#{rank}</span>
        <span className="oportunidade-nome">{item.produto_nome}</span>
      </div>
      <div className="oportunidade-stats">
        <div className="oportunidade-stat">
          <span className="oportunidade-stat-valor" style={{ color: 'var(--danger)' }}>{item.total_consultas}</span>
          <span className="oportunidade-stat-label">consultas sem atendimento</span>
        </div>
        {item.receita_estimada > 0 && (
          <div className="oportunidade-stat">
            <span className="oportunidade-stat-valor" style={{ color: 'var(--warning)' }}>
              {formatCurrency(item.receita_estimada)}
            </span>
            <span className="oportunidade-stat-label">receita estimada perdida</span>
          </div>
        )}
      </div>
      <p className="oportunidade-hint">💡 Considere adicionar ao catálogo ou verificar estoque</p>
    </div>
  )
}

// ── Card de alerta ────────────────────────────────────────────────────────────

function AlertaCard({ alerta, onMarcarVisto, onMarcarResolvido }) {
  const cfg = DEMAND_ALERT_STATUS_CONFIG[alerta.status] ?? DEMAND_ALERT_STATUS_CONFIG.novo
  const criado = new Date(alerta.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className={`alerta-card alerta-card--${alerta.status}`}>
      <div className="alerta-card-left">
        <span className="alerta-card-icone" style={{ color: cfg.cor }}>{cfg.icone}</span>
        <div className="alerta-card-info">
          <span className="alerta-card-nome">{alerta.produto_nome}</span>
          <span className="alerta-card-desc">
            {alerta.total_consultas} consultas
            {alerta.sem_estoque ? ' · produto sem estoque/não cadastrado' : ''}
          </span>
          <span className="alerta-card-data">{criado}</span>
        </div>
      </div>
      <div className="alerta-card-actions">
        <span className="tag" style={{ background: cfg.bg, color: cfg.cor }}>{cfg.label}</span>
        {alerta.status === 'novo' && (
          <button className="btn btn-xs btn-ghost" onClick={() => onMarcarVisto(alerta.id)}>
            👁 Ver
          </button>
        )}
        {alerta.status !== 'resolvido' && (
          <button className="btn btn-xs btn-ghost" onClick={() => onMarcarResolvido(alerta.id)}>
            ✅ Resolver
          </button>
        )}
      </div>
    </div>
  )
}

// ── Painel de configuração de alertas ────────────────────────────────────────

function ConfigAlertas({ config, onSalvar }) {
  const [form, setForm] = useState({
    limite_consultas: config?.limite_consultas ?? 10,
    janela_horas:     config?.janela_horas     ?? 24,
    canal_alerta:     config?.canal_alerta     ?? 'dashboard',
  })
  const [salvando, setSalvando] = useState(false)
  const { toast } = useToast()

  async function handleSalvar(e) {
    e.preventDefault()
    setSalvando(true)
    try {
      await onSalvar(form)
      toast.sucesso('Configuração de alertas salva.')
    } catch (err) {
      toast.erro(err.message ?? 'Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="config-alertas-form" onSubmit={handleSalvar}>
      <div className="form-grid-2">
        <div className="form-grupo">
          <label className="form-label">Limite de consultas</label>
          <input
            className="input"
            type="number"
            min="1"
            value={form.limite_consultas}
            onChange={(e) => setForm((f) => ({ ...f, limite_consultas: parseInt(e.target.value) }))}
          />
          <p className="form-hint">Gerar alerta quando produto atingir este número de consultas</p>
        </div>
        <div className="form-grupo">
          <label className="form-label">Janela de tempo (horas)</label>
          <input
            className="input"
            type="number"
            min="1"
            value={form.janela_horas}
            onChange={(e) => setForm((f) => ({ ...f, janela_horas: parseInt(e.target.value) }))}
          />
        </div>
        <div className="form-grupo">
          <label className="form-label">Canal de alerta</label>
          <select className="input" value={form.canal_alerta} onChange={(e) => setForm((f) => ({ ...f, canal_alerta: e.target.value }))}>
            <option value="dashboard">Dashboard</option>
            <option value="email">E-mail</option>
            <option value="whatsapp">WhatsApp gerencial</option>
            <option value="todos">Todos os canais</option>
          </select>
        </div>
      </div>
      <button type="submit" className="btn btn-primary btn-sm" disabled={salvando}>
        {salvando ? 'Salvando…' : '💾 Salvar configuração'}
      </button>
    </form>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

const ABAS = [
  { id: 'ranking',      label: '📊 Mais Procurados' },
  { id: 'oportunidades', label: '💰 Oportunidades Perdidas' },
  { id: 'alertas',      label: '🔔 Alertas' },
  { id: 'config',       label: '⚙️ Configurações' },
]

export function DemandPage() {
  const { toast } = useToast()
  const [abaAtiva, setAbaAtiva]     = useState('ranking')
  const [topDemanda, setTopDemanda] = useState([])
  const [oportunidades, setOportunidades] = useState([])
  const [alertas, setAlertas]       = useState([])
  const [resumo, setResumo]         = useState(null)
  const [config, setConfig]         = useState(null)
  const [diasRanking, setDiasRanking] = useState(7)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    if (DEMO_MODE) {
      setTopDemanda(MOCK_TOP)
      setOportunidades(MOCK_OPORTUNIDADES)
      setAlertas(MOCK_ALERTAS)
      setResumo(MOCK_RESUMO)
      setConfig({ limite_consultas: 10, janela_horas: 24, canal_alerta: 'dashboard' })
      setErro(null)
      setCarregando(false)
      return
    }
    try {
      const [top, opor, alert, res, cfg] = await Promise.all([
        demandIntelligenceService.topDemanda(diasRanking, 10),
        demandIntelligenceService.oportunidadesPerdidas(30, 10),
        demandIntelligenceService.listarAlertas('todos'),
        demandIntelligenceService.resumo(diasRanking),
        demandIntelligenceService.buscarConfig(),
      ])
      setTopDemanda(top)
      setOportunidades(opor)
      setAlertas(alert)
      setResumo(res)
      setConfig(cfg)
      setErro(null)
    } catch (err) {
      setErro(err.message)
    } finally {
      setCarregando(false)
    }
  }, [diasRanking])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (DEMO_MODE) return
    let channel = null
    try {
      channel = demandIntelligenceService.subscribeAlertas(() => carregar())
    } catch { channel = null }
    return () => { try { channel?.unsubscribe() } catch { /* ignora */ } }
  }, [carregar])

  async function handleMarcarVisto(id) {
    try {
      if (!DEMO_MODE) await demandIntelligenceService.marcarVisto(id)
      setAlertas((prev) => prev.map((a) => a.id === id ? { ...a, status: 'visto' } : a))
    } catch (err) { toast.erro(err.message) }
  }

  async function handleMarcarResolvido(id) {
    try {
      if (!DEMO_MODE) await demandIntelligenceService.marcarResolvido(id)
      setAlertas((prev) => prev.map((a) => a.id === id ? { ...a, status: 'resolvido' } : a))
    } catch (err) { toast.erro(err.message) }
  }

  async function handleSalvarConfig(dados) {
    await demandIntelligenceService.atualizarConfig(dados)
    setConfig((c) => ({ ...c, ...dados }))
  }

  const alertasNovos = alertas.filter((a) => a.status === 'novo').length
  const maxConsultas = topDemanda[0]?.total_consultas ?? 1

  const res = resumo ?? { total: 0, respondidos: 0, consultados: 0, nao_encontrados: 0, sem_estoque: 0, convertidos: 0 }
  const taxaResposta = res.total > 0 ? Math.round(((res.respondidos + res.consultados) / res.total) * 100) : 0

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-info">
          <h1 className="page-titulo">Inteligência de Demanda</h1>
          <p className="page-descricao">Análise de interesse em produtos e oportunidades comerciais</p>
        </div>
        <div className="page-header-acoes">
          {DEMO_MODE && <span className="badge-mock">⚡ Demo</span>}
          <button className="btn btn-ghost btn-sm" onClick={carregar}>↺ Atualizar</button>
        </div>
      </div>

      {/* KPIs de demanda */}
      <div className="catalog-kpi-row">
        <div className="catalog-kpi">
          <span className="catalog-kpi-valor" style={{ color: 'var(--primary)' }}>{res.total}</span>
          <span className="catalog-kpi-label">Consultas ({diasRanking}d)</span>
        </div>
        <div className="catalog-kpi">
          <span className="catalog-kpi-valor" style={{ color: 'var(--success)' }}>{res.convertidos}</span>
          <span className="catalog-kpi-label">Converteram</span>
        </div>
        <div className="catalog-kpi">
          <span className="catalog-kpi-valor" style={{ color: 'var(--danger)' }}>{res.sem_estoque + res.nao_encontrados}</span>
          <span className="catalog-kpi-label">Perdidos</span>
        </div>
        <div className="catalog-kpi">
          <span className="catalog-kpi-valor" style={{ color: alertasNovos > 0 ? 'var(--warning)' : 'var(--text-2)' }}>
            {alertasNovos}
          </span>
          <span className="catalog-kpi-label">🔔 Alertas novos</span>
        </div>
      </div>

      {/* Alerta de novos alertas */}
      {alertasNovos > 0 && (
        <div className="alert-strip alert-strip--warning" style={{ cursor: 'pointer' }} onClick={() => setAbaAtiva('alertas')}>
          <span className="alert-strip-icone">🔔</span>
          <div className="alert-strip-info">
            <span className="alert-strip-titulo">{alertasNovos} alerta{alertasNovos > 1 ? 's' : ''} de demanda pendente{alertasNovos > 1 ? 's' : ''}</span>
            <span className="alert-strip-desc">Produtos com alta procura que precisam de atenção</span>
          </div>
          <button className="btn btn-sm btn-ghost">Ver alertas</button>
        </div>
      )}

      {/* Abas */}
      <div className="abas" style={{ marginBottom: '16px' }}>
        {ABAS.map((aba) => (
          <button
            key={aba.id}
            className={`aba-btn ${abaAtiva === aba.id ? 'aba-btn--ativa' : ''}`}
            onClick={() => setAbaAtiva(aba.id)}
          >
            {aba.label}
            {aba.id === 'alertas' && alertasNovos > 0 && (
              <span className="aba-count" style={{ background: 'var(--warning)', color: '#000' }}>{alertasNovos}</span>
            )}
          </button>
        ))}
      </div>

      {carregando ? (
        <LoadingSpinner mensagem="Carregando dados de demanda…" />
      ) : erro ? (
        <ErrorState
          titulo="Não foi possível carregar a inteligência de demanda"
          detalhe={`Verifique a conexão com o Supabase. (${erro})`}
          onRetry={carregar}
        />
      ) : (
        <>
          {/* Ranking */}
          {abaAtiva === 'ranking' && (
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 className="section-titulo">Produtos mais procurados</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[7, 14, 30].map((d) => (
                    <button
                      key={d}
                      className={`btn btn-xs ${diasRanking === d ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setDiasRanking(d)}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
              {topDemanda.length === 0 ? (
                <EmptyState icone="📊" titulo="Sem dados de demanda" descricao="As consultas de produtos serão registradas aqui." />
              ) : (
                <div className="demand-ranking-lista">
                  {topDemanda.map((item, i) => (
                    <DemandRow key={item.produto_nome} item={item} rank={i + 1} maxConsultas={maxConsultas} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Oportunidades perdidas */}
          {abaAtiva === 'oportunidades' && (
            <div>
              <div className="card" style={{ padding: '16px 20px', marginBottom: '16px' }}>
                <p style={{ color: 'var(--text-2)', fontSize: '13px' }}>
                  Produtos muito procurados nos últimos 30 dias mas sem disponibilidade ou não cadastrados no sistema.
                  Cada linha representa uma oportunidade de venda perdida.
                </p>
              </div>
              {oportunidades.length === 0 ? (
                <EmptyState icone="💰" titulo="Sem oportunidades perdidas" descricao="Ótimo! Todos os produtos procurados estão disponíveis." />
              ) : (
                <div className="oportunidades-grid">
                  {oportunidades.map((item, i) => (
                    <OportunidadeCard key={item.produto_nome} item={item} rank={i + 1} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Alertas */}
          {abaAtiva === 'alertas' && (
            <div>
              {alertas.length === 0 ? (
                <EmptyState icone="🔔" titulo="Nenhum alerta" descricao="Configure o limiar para gerar alertas automáticos." />
              ) : (
                <div className="alertas-lista">
                  {alertas.map((alerta) => (
                    <AlertaCard
                      key={alerta.id}
                      alerta={alerta}
                      onMarcarVisto={handleMarcarVisto}
                      onMarcarResolvido={handleMarcarResolvido}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Configurações */}
          {abaAtiva === 'config' && (
            <div className="card" style={{ padding: '24px' }}>
              <h3 className="section-titulo" style={{ marginBottom: '16px' }}>Configuração de alertas automáticos</h3>
              <p style={{ color: 'var(--text-2)', fontSize: '13px', marginBottom: '20px' }}>
                Quando um produto atingir o número de consultas configurado dentro da janela de tempo,
                um alerta será gerado automaticamente.
              </p>
              {config && (
                <ConfigAlertas config={config} onSalvar={handleSalvarConfig} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
