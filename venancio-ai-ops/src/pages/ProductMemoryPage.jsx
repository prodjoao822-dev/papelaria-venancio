import { useState, useEffect, useCallback } from 'react'
import { productEngineService, calcularNivelConfianca } from '@/services/product-engine.service'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/contexts/AppContext'
import { formatCurrency } from '@/utils/formatters'
import {
  CONFIDENCE_CONFIG,
  DISPONIBILIDADE_CONFIG,
} from '@/utils/constants'

// ── Barra de confiança visual ─────────────────────────────────────────────────

function ConfidenceBar({ score, nivel }) {
  const cfg = CONFIDENCE_CONFIG[nivel] ?? CONFIDENCE_CONFIG.baixa
  return (
    <div className="confidence-bar-wrap" title={`Score: ${score?.toFixed(0) ?? '?'}`}>
      <div className="confidence-bar-track">
        <div
          className="confidence-bar-fill"
          style={{ width: `${Math.min(100, score ?? 0)}%`, background: cfg.cor }}
        />
      </div>
      <span className="confidence-label" style={{ color: cfg.cor }}>
        {cfg.icone} {cfg.label}
      </span>
    </div>
  )
}

// ── Modal de edição de memória ────────────────────────────────────────────────

function EditarMemoriaModal({ memoria, onSalvar, onFechar }) {
  const [form, setForm] = useState({
    disponibilidade: memoria.disponibilidade ?? 'desconhecido',
    ultimo_preco:    memoria.ultimo_preco   ?? '',
    observacoes:     memoria.observacoes    ?? '',
    confidence_score: memoria.confidence_score ?? 50,
  })
  const [salvando, setSalvando] = useState(false)
  const { toast } = useToast()

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSalvando(true)
    try {
      await onSalvar(memoria.id, {
        ...form,
        ultimo_preco:    form.ultimo_preco ? parseFloat(form.ultimo_preco) : null,
        confidence_score: parseFloat(form.confidence_score),
      })
      toast.sucesso('Memória atualizada.')
      onFechar()
    } catch (err) {
      toast.erro(err.message ?? 'Erro ao atualizar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-titulo">Editar Memória: {memoria.nome}</h2>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <div className="form-grupo">
              <label className="form-label">Disponibilidade</label>
              <select className="input" value={form.disponibilidade} onChange={(e) => set('disponibilidade', e.target.value)}>
                <option value="disponivel">Disponível</option>
                <option value="indisponivel">Indisponível</option>
                <option value="sob_consulta">Sob Consulta</option>
                <option value="desconhecido">Desconhecido</option>
              </select>
            </div>

            <div className="form-grupo">
              <label className="form-label">Último Preço (R$)</label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                value={form.ultimo_preco}
                onChange={(e) => set('ultimo_preco', e.target.value)}
                placeholder="0,00"
              />
            </div>

            <div className="form-grupo">
              <label className="form-label">Score de Confiança (0–100)</label>
              <input
                className="input"
                type="number"
                min="0"
                max="100"
                value={form.confidence_score}
                onChange={(e) => set('confidence_score', e.target.value)}
              />
            </div>

            <div className="form-grupo form-grupo--full">
              <label className="form-label">Observações</label>
              <textarea
                className="input textarea"
                rows={2}
                value={form.observacoes}
                onChange={(e) => set('observacoes', e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onFechar} disabled={salvando}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando…' : '💾 Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Card de memória ───────────────────────────────────────────────────────────

function MemoriaCard({ memoria, onEditar }) {
  const [expandido, setExpandido] = useState(false)
  const dispCfg = DISPONIBILIDADE_CONFIG[memoria.disponibilidade] ?? DISPONIBILIDADE_CONFIG.desconhecido

  const confirmacoes = memoria.confirmacoes ?? []
  const ultimaConfirmacao = memoria.ultima_confirmacao
    ? new Date(memoria.ultima_confirmacao).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
    : '—'

  const diasDesde = memoria.ultima_confirmacao
    ? Math.floor((Date.now() - new Date(memoria.ultima_confirmacao)) / 86_400_000)
    : null

  return (
    <div className={`memoria-card memoria-card--${memoria.nivel_confianca}`}>
      <div className="memoria-card-header" onClick={() => setExpandido((v) => !v)}>
        <div className="memoria-card-left">
          <span className="memoria-card-nome">{memoria.nome}</span>
          {memoria.categoria && <span className="memoria-card-cat">{memoria.categoria}</span>}
        </div>
        <div className="memoria-card-right">
          <span className="memoria-dispon" style={{ color: dispCfg.cor }}>
            {dispCfg.icone} {dispCfg.label}
          </span>
          {memoria.ultimo_preco != null && (
            <span className="memoria-preco">{formatCurrency(memoria.ultimo_preco)}</span>
          )}
          <ConfidenceBar score={memoria.confidence_score} nivel={memoria.nivel_confianca} />
          <button
            className="btn btn-xs btn-ghost"
            title="Editar"
            onClick={(e) => { e.stopPropagation(); onEditar(memoria) }}
          >
            ✏️
          </button>
          <span className="memoria-expand-icon">{expandido ? '▲' : '▼'}</span>
        </div>
      </div>

      {expandido && (
        <div className="memoria-card-body">
          <div className="memoria-detail-grid">
            <div className="memoria-detail-item">
              <span className="memoria-detail-label">Última confirmação</span>
              <span className="memoria-detail-valor">{ultimaConfirmacao}</span>
            </div>
            {diasDesde !== null && (
              <div className="memoria-detail-item">
                <span className="memoria-detail-label">Idade dos dados</span>
                <span
                  className="memoria-detail-valor"
                  style={{ color: diasDesde > 30 ? 'var(--warning)' : diasDesde > 7 ? 'var(--text-2)' : 'var(--success)' }}
                >
                  {diasDesde === 0 ? 'hoje' : `${diasDesde} dias`}
                </span>
              </div>
            )}
            <div className="memoria-detail-item">
              <span className="memoria-detail-label">Confirmado por</span>
              <span className="memoria-detail-valor">{memoria.confirmado_por ?? '—'}</span>
            </div>
            <div className="memoria-detail-item">
              <span className="memoria-detail-label">Consultas</span>
              <span className="memoria-detail-valor">{memoria.consultas_count ?? 0}</span>
            </div>
            {memoria.observacoes && (
              <div className="memoria-detail-item memoria-detail-item--full">
                <span className="memoria-detail-label">Observações</span>
                <span className="memoria-detail-valor">{memoria.observacoes}</span>
              </div>
            )}
            {memoria.produto_ref && (
              <div className="memoria-detail-item memoria-detail-item--full">
                <span className="memoria-detail-label">Produto no catálogo</span>
                <span className="memoria-detail-valor" style={{ color: 'var(--primary)' }}>
                  🔗 {memoria.produto_ref.nome} — {formatCurrency(memoria.produto_ref.preco)}
                </span>
              </div>
            )}
          </div>

          {confirmacoes.length > 0 && (
            <div className="memoria-confirmacoes">
              <p className="memoria-confirmacoes-titulo">Histórico de confirmações</p>
              <div className="memoria-confirmacoes-lista">
                {confirmacoes.slice(0, 5).map((c) => (
                  <div key={c.id} className="memoria-confirmacao-item">
                    <span className={`tag tag--sm ${c.disponibilidade === 'disponivel' ? 'tag--sucesso' : 'tag--perigo'}`}>
                      {c.disponibilidade}
                    </span>
                    {c.preco_confirmado != null && (
                      <span className="memoria-conf-preco">{formatCurrency(c.preco_confirmado)}</span>
                    )}
                    <span className="memoria-conf-operador">{c.operador ?? 'sistema'}</span>
                    <span className="memoria-conf-data">
                      {new Date(c.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export function ProductMemoryPage() {
  const [memorias, setMemorias]         = useState([])
  const [carregando, setCarregando]     = useState(true)
  const [busca, setBusca]               = useState('')
  const [filtroDispon, setFiltroDispon] = useState('')
  const [filtroConf, setFiltroConf]     = useState('')
  const [editando, setEditando]         = useState(null)
  const [usandoMock, setUsandoMock]     = useState(false)
  const { toast } = useToast()

  const MOCK_MEMORIAS = [
    {
      id: 'm1', nome: 'Caderno Universitário 10 matérias', categoria: 'Cadernos',
      disponibilidade: 'disponivel', ultimo_preco: 32.90, confidence_score: 82,
      nivel_confianca: 'alta', ultima_confirmacao: new Date(Date.now() - 2*86400000).toISOString(),
      confirmado_por: 'Ana', consultas_count: 15, observacoes: 'Tilibra ou São Domingos',
      confirmacoes: [
        { id: 'c1', disponibilidade: 'disponivel', preco_confirmado: 32.90, operador: 'Ana', created_at: new Date(Date.now() - 2*86400000).toISOString() },
      ],
    },
    {
      id: 'm2', nome: 'Mochila Capricho Rosa', categoria: 'Mochilas',
      disponibilidade: 'indisponivel', ultimo_preco: 159.90, confidence_score: 38,
      nivel_confianca: 'baixa', ultima_confirmacao: new Date(Date.now() - 45*86400000).toISOString(),
      confirmado_por: 'Carlos', consultas_count: 8, observacoes: null,
      confirmacoes: [],
    },
    {
      id: 'm3', nome: 'Caneta BIC Cristal preta', categoria: 'Canetas',
      disponibilidade: 'disponivel', ultimo_preco: 1.90, confidence_score: 61,
      nivel_confianca: 'media', ultima_confirmacao: new Date(Date.now() - 12*86400000).toISOString(),
      confirmado_por: 'Marcos', consultas_count: 22, observacoes: null,
      confirmacoes: [],
    },
  ]

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const filtros = {}
      if (filtroDispon) filtros.disponibilidade = filtroDispon
      if (filtroConf === 'alta')  filtros.confiancaMinima = 75
      if (filtroConf === 'media') filtros.confiancaMinima = 45
      if (busca) filtros.busca = busca

      const data = await productEngineService.listarMemoria(filtros)
      setMemorias(data)
      setUsandoMock(false)
    } catch {
      setMemorias(MOCK_MEMORIAS)
      setUsandoMock(true)
    } finally {
      setCarregando(false)
    }
  }, [filtroDispon, filtroConf, busca])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (usandoMock) return
    let channel = null
    try {
      channel = productEngineService.subscribe(() => carregar())
    } catch { channel = null }
    return () => { try { channel?.unsubscribe() } catch { /* ignora */ } }
  }, [carregar, usandoMock])

  async function handleSalvarEdicao(id, dados) {
    if (usandoMock) {
      setMemorias((prev) => prev.map((m) => m.id === id ? { ...m, ...dados, nivel_confianca: calcularNivelConfianca(dados.confidence_score) } : m))
      return
    }
    const atualizado = await productEngineService.atualizarMemoria(id, dados)
    setMemorias((prev) => prev.map((m) => m.id === id ? { ...atualizado, confirmacoes: m.confirmacoes } : m))
  }

  // KPIs
  const totalAlta  = memorias.filter((m) => m.nivel_confianca === 'alta').length
  const totalMedia = memorias.filter((m) => m.nivel_confianca === 'media').length
  const totalBaixa = memorias.filter((m) => m.nivel_confianca === 'baixa').length
  const disponiveis = memorias.filter((m) => m.disponibilidade === 'disponivel').length

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-info">
          <h1 className="page-titulo">Memória de Produtos — IA</h1>
          <p className="page-descricao">Produtos aprendidos por confirmações de operadores</p>
        </div>
        <div className="page-header-acoes">
          {usandoMock && <span className="badge-mock">⚡ Demo</span>}
          <button className="btn btn-ghost btn-sm" onClick={carregar}>↺ Atualizar</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="catalog-kpi-row">
        <div className="catalog-kpi">
          <span className="catalog-kpi-valor" style={{ color: '#10B981' }}>{totalAlta}</span>
          <span className="catalog-kpi-label">🟢 Alta confiança</span>
        </div>
        <div className="catalog-kpi">
          <span className="catalog-kpi-valor" style={{ color: '#F59E0B' }}>{totalMedia}</span>
          <span className="catalog-kpi-label">🟡 Média confiança</span>
        </div>
        <div className="catalog-kpi">
          <span className="catalog-kpi-valor" style={{ color: '#EF4444' }}>{totalBaixa}</span>
          <span className="catalog-kpi-label">🔴 Baixa confiança</span>
        </div>
        <div className="catalog-kpi">
          <span className="catalog-kpi-valor" style={{ color: 'var(--text-2)' }}>{disponiveis}</span>
          <span className="catalog-kpi-label">Disponíveis</span>
        </div>
      </div>

      {/* Alerta de itens com baixa confiança */}
      {totalBaixa > 0 && (
        <div className="alert-strip alert-strip--warning">
          <span className="alert-strip-icone">⚠️</span>
          <div className="alert-strip-info">
            <span className="alert-strip-titulo">{totalBaixa} produto{totalBaixa > 1 ? 's' : ''} com baixa confiança</span>
            <span className="alert-strip-desc">Dados desatualizados ou produto desconhecido. Confirme com o operador.</span>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="filtros-painel">
        <div className="filtros-linha">
          <input
            type="text"
            className="input filtros-busca-input"
            placeholder="Buscar produto na memória…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />

          <select className="input" style={{ width: 'auto', minWidth: '160px' }} value={filtroDispon} onChange={(e) => setFiltroDispon(e.target.value)}>
            <option value="">Todas disponibilidades</option>
            <option value="disponivel">Disponível</option>
            <option value="indisponivel">Indisponível</option>
            <option value="sob_consulta">Sob Consulta</option>
            <option value="desconhecido">Desconhecido</option>
          </select>

          <select className="input" style={{ width: 'auto', minWidth: '160px' }} value={filtroConf} onChange={(e) => setFiltroConf(e.target.value)}>
            <option value="">Todos os níveis</option>
            <option value="alta">Alta confiança (≥75)</option>
            <option value="media">Média confiança (≥45)</option>
          </select>
        </div>
      </div>

      {/* Lista */}
      <div className="memorias-lista">
        {carregando ? (
          <LoadingSpinner mensagem="Carregando memória da IA…" />
        ) : memorias.length === 0 ? (
          <EmptyState
            icone="🧠"
            titulo="Memória vazia"
            descricao="Responda consultas operacionais para que a IA aprenda com as respostas."
          />
        ) : (
          memorias.map((m) => (
            <MemoriaCard
              key={m.id}
              memoria={m}
              onEditar={setEditando}
            />
          ))
        )}
      </div>

      {editando && (
        <EditarMemoriaModal
          memoria={editando}
          onSalvar={handleSalvarEdicao}
          onFechar={() => setEditando(null)}
        />
      )}
    </div>
  )
}
