import { useState, useEffect, useCallback, useRef } from 'react'
import { operationalQueriesService } from '@/services/operational-queries.service'
import { productEngineService, extrairPrecoDeTexto, extrairDisponibilidadeDeTexto } from '@/services/product-engine.service'
import {
  QUERY_TYPE_CONFIG,
  QUERY_STATUS_CONFIG,
  QUERY_STATUS,
  PRIORIDADE_CONFIG,
  DEMO_MODE,
} from '@/utils/constants'
import { useToast } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/utils/formatters'
import { ErrorState } from '@/components/ui/ErrorState'

// ── Helpers ───────────────────────────────────────────────────────────────────

function minutosRestantes(timeoutAt) {
  if (!timeoutAt) return null
  const diff = new Date(timeoutAt) - Date.now()
  return Math.max(0, Math.floor(diff / 60000))
}

function formatarTimeout(timeoutAt) {
  const mins = minutosRestantes(timeoutAt)
  if (mins === null) return '—'
  if (mins === 0)    return 'Expirado'
  if (mins < 60)     return `${mins}min`
  return `${Math.floor(mins / 60)}h${mins % 60 > 0 ? ` ${mins % 60}min` : ''}`
}

function classTimeout(timeoutAt) {
  const mins = minutosRestantes(timeoutAt)
  if (mins === null) return ''
  if (mins === 0)    return 'timeout--expirado'
  if (mins <= 5)     return 'timeout--critico'
  if (mins <= 15)    return 'timeout--alerta'
  return 'timeout--ok'
}

// ── Timer de timeout ──────────────────────────────────────────────────────────

function TimeoutTimer({ timeoutAt, status }) {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    if (status !== QUERY_STATUS.PENDING && status !== QUERY_STATUS.ASSIGNED) return
    const interval = setInterval(() => forceUpdate((n) => n + 1), 30_000)
    return () => clearInterval(interval)
  }, [status])

  if (status === QUERY_STATUS.ANSWERED) return <span className="consulta-timer timeout--ok">✅ Respondida</span>
  if (status === QUERY_STATUS.EXPIRED)  return <span className="consulta-timer timeout--expirado">⌛ Expirada</span>

  return (
    <span className={`consulta-timer ${classTimeout(timeoutAt)}`}>
      ⏱ {formatarTimeout(timeoutAt)}
    </span>
  )
}

// ── Preview de aprendizado ────────────────────────────────────────────────────

function AprendizadoPreview({ resposta, produtoNome }) {
  if (!resposta.trim()) return null

  const preco = extrairPrecoDeTexto(resposta)
  const dispon = extrairDisponibilidadeDeTexto(resposta)

  if (!preco && !dispon) return null

  return (
    <div className="aprendizado-preview">
      <span className="aprendizado-preview-titulo">🧠 A IA vai aprender:</span>
      <div className="aprendizado-preview-itens">
        <span className="aprendizado-preview-produto">{produtoNome}</span>
        {dispon && (
          <span className={`aprendizado-preview-badge ${dispon === 'disponivel' ? 'aprendizado-preview-badge--ok' : 'aprendizado-preview-badge--no'}`}>
            {dispon === 'disponivel' ? '✅ Disponível' : '❌ Indisponível'}
          </span>
        )}
        {preco && (
          <span className="aprendizado-preview-badge aprendizado-preview-badge--price">
            💰 {formatCurrency(preco)}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_CONSULTAS = [
  {
    id: 'q1', product_name: 'Caderno Universitário 10 matérias', query_type: 'estoque',
    context: 'Cliente quer 30 unidades para escola particular. Perguntar se temos o da marca Tilibra.',
    status: 'pending', priority: 'critica',
    timeout_at: new Date(Date.now() + 8 * 60_000).toISOString(),
    created_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    clientes: { nome: 'Colégio São Paulo', telefone: '11 99001-1234' },
  },
  {
    id: 'q2', product_name: 'Caneta BIC Cristal preta', query_type: 'preco',
    context: 'Cliente quer preço para 200 unidades. É compra de empresa.',
    status: 'pending', priority: 'alta',
    timeout_at: new Date(Date.now() + 22 * 60_000).toISOString(),
    created_at: new Date(Date.now() - 8 * 60_000).toISOString(),
    clientes: { nome: 'TechSolutions Ltda', telefone: '11 3300-4455' },
  },
  {
    id: 'q3', product_name: 'Papel A4 Chamex 500 folhas', query_type: 'disponibilidade',
    context: 'Cliente perguntou disponibilidade para retirada hoje.',
    status: 'assigned', priority: 'normal',
    timeout_at: new Date(Date.now() + 14 * 60_000).toISOString(),
    created_at: new Date(Date.now() - 16 * 60_000).toISOString(),
    clientes: { nome: 'Maria Silva', telefone: '11 98765-4321' },
  },
  {
    id: 'q4', product_name: 'Mochila Escolar Grande', query_type: 'prazo',
    context: 'Quando chega o próximo lote? Cliente aguarda para decidir compra.',
    status: 'answered', priority: 'normal',
    timeout_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    created_at: new Date(Date.now() - 45 * 60_000).toISOString(),
    clientes: { nome: 'João Ferreira', telefone: '11 97654-3210' },
    response: 'Previsão: 3 dias úteis. Próximo lote chega quinta-feira.',
    responded_by: 'Ana',
  },
]

const FILTROS_STATUS = [
  { value: 'ativos',   label: 'Pendentes', icone: '⏳' },
  { value: 'answered', label: 'Respondidas', icone: '✅' },
  { value: 'expired',  label: 'Expiradas', icone: '⌛' },
  { value: 'todos',    label: 'Todas', icone: '◈' },
]

// ── Card de consulta ──────────────────────────────────────────────────────────

function ConsultaCard({ consulta, onResponder, onApagar }) {
  const [expandido, setExpandido]       = useState(false)
  const [respondendo, setRespondendo]   = useState(false)
  const [resposta, setResposta]         = useState('')
  const [aprender, setAprender]         = useState(true)
  const [loading, setLoading]           = useState(false)
  const [aprendeuOk, setAprendeuOk]     = useState(false)
  const [apagando, setApagando]         = useState(false)
  const textareaRef = useRef(null)

  const prioridadeCfg = PRIORIDADE_CONFIG[consulta.priority] ?? PRIORIDADE_CONFIG.normal
  const typeCfg       = QUERY_TYPE_CONFIG[consulta.query_type] ?? QUERY_TYPE_CONFIG.outro
  const statusCfg     = QUERY_STATUS_CONFIG[consulta.status]   ?? QUERY_STATUS_CONFIG.pending

  const isPendente   = consulta.status === QUERY_STATUS.PENDING || consulta.status === QUERY_STATUS.ASSIGNED
  const isRespondida = consulta.status === QUERY_STATUS.ANSWERED

  function abrirResposta() {
    setRespondendo(true)
    setExpandido(true)
    setTimeout(() => textareaRef.current?.focus(), 100)
  }

  async function enviarResposta() {
    if (!resposta.trim()) return
    setLoading(true)
    try {
      await onResponder(consulta.id, resposta.trim(), aprender, consulta.product_name)
      if (aprender) {
        const preco = extrairPrecoDeTexto(resposta)
        const dispon = extrairDisponibilidadeDeTexto(resposta)
        if (preco || dispon) setAprendeuOk(true)
      }
      setRespondendo(false)
      setResposta('')
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviarResposta()
    if (e.key === 'Escape') { setRespondendo(false); setResposta('') }
  }

  async function handleApagar() {
    if (!window.confirm('Apagar esta consulta já respondida? Não pode ser desfeito.')) return
    setApagando(true)
    try {
      await onApagar(consulta.id)
    } finally {
      setApagando(false)
    }
  }

  return (
    <div
      className={`consulta-card consulta-card--${consulta.status} consulta-card--prio-${consulta.priority}`}
      data-status={consulta.status}
    >
      {/* Header */}
      <div className="consulta-card-header" onClick={() => setExpandido((v) => !v)}>
        <div className="consulta-card-meta">
          <span className="consulta-badge-prio" style={{ background: prioridadeCfg.bg, color: prioridadeCfg.cor, border: `1px solid ${prioridadeCfg.borda}` }}>
            {prioridadeCfg.icone} {prioridadeCfg.label}
          </span>
          <span className="consulta-badge-type" style={{ color: typeCfg.cor }}>
            {typeCfg.icone} {typeCfg.label}
          </span>
          <span className="consulta-badge-status" style={{ background: statusCfg.bg, color: statusCfg.cor }}>
            {statusCfg.icone} {statusCfg.label}
          </span>
        </div>
        <TimeoutTimer timeoutAt={consulta.timeout_at} status={consulta.status} />
      </div>

      {/* Produto + cliente */}
      <div className="consulta-card-produto">
        <strong className="consulta-produto-nome">{consulta.product_name ?? '—'}</strong>
        {consulta.clientes && (
          <span className="consulta-cliente">
            👤 {consulta.clientes.nome}
            {consulta.clientes.telefone && <> · {consulta.clientes.telefone}</>}
          </span>
        )}
      </div>

      {/* Contexto */}
      {consulta.context && (
        <p className={`consulta-context ${expandido ? 'consulta-context--full' : ''}`}>
          {consulta.context}
        </p>
      )}

      {/* Resposta já dada + badge de aprendizado */}
      {isRespondida && consulta.response && (
        <div className="consulta-resposta-exibida">
          <span className="consulta-resposta-label">Resposta de {consulta.responded_by ?? 'operador'}:</span>
          <p className="consulta-resposta-texto">{consulta.response}</p>
          {aprendeuOk && (
            <span className="aprendizado-badge-ok">🧠 IA aprendeu com esta resposta</span>
          )}
        </div>
      )}

      {/* Área de resposta inline com preview de aprendizado */}
      {respondendo && (
        <div className="consulta-resposta-area">
          <textarea
            ref={textareaRef}
            className="consulta-resposta-input"
            placeholder="Digite a resposta. Ex: Tem sim, R$159,90. Temos 5 unidades.  (Ctrl+Enter para enviar)"
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            onKeyDown={handleKey}
            rows={3}
          />

          {/* Preview de aprendizado em tempo real */}
          {consulta.product_name && (
            <AprendizadoPreview resposta={resposta} produtoNome={consulta.product_name} />
          )}

          {/* Toggle de aprendizado */}
          <div className="aprendizado-toggle">
            <label className="aprendizado-toggle-label">
              <input
                type="checkbox"
                checked={aprender}
                onChange={(e) => setAprender(e.target.checked)}
              />
              <span>🧠 Ensinar à IA (atualizar memória de produtos)</span>
            </label>
            {aprender && (
              <span className="aprendizado-toggle-hint">
                Preço e disponibilidade serão extraídos e salvos automaticamente
              </span>
            )}
          </div>

          <div className="consulta-resposta-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => { setRespondendo(false); setResposta('') }} disabled={loading}>
              Cancelar
            </button>
            <button className="btn btn-primary btn-sm" onClick={enviarResposta} disabled={loading || !resposta.trim()}>
              {loading ? 'Enviando…' : '✅ Responder'}
            </button>
          </div>
        </div>
      )}

      {/* Ações */}
      {isPendente && !respondendo && (
        <div className="consulta-card-actions">
          <button className="btn btn-sm btn-ghost" onClick={() => setExpandido((v) => !v)}>
            {expandido ? '▲ Recolher' : '▼ Expandir'}
          </button>
          <button className="btn btn-sm btn-primary" onClick={abrirResposta}>
            💬 Responder
          </button>
        </div>
      )}
      {isRespondida && (
        <div className="consulta-card-actions">
          <button className="btn btn-sm btn-ghost" onClick={handleApagar} disabled={apagando}>
            {apagando ? 'Apagando...' : '🗑️ Apagar'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export function ConsultasPage() {
  const { toast } = useToast()
  const { operador } = useAuth()
  const [consultas, setConsultas]       = useState([])
  const [loading, setLoading]           = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('ativos')
  const [filtroTipo, setFiltroTipo]     = useState('')
  const [busca, setBusca]               = useState('')
  const [erro, setErro]                 = useState(null)
  const [aprendizados, setAprendizados] = useState(0)

  const carregarConsultas = useCallback(async () => {
    if (DEMO_MODE) {
      setConsultas(MOCK_CONSULTAS)
      setErro(null)
      setLoading(false)
      return
    }
    try {
      let data
      if (filtroStatus === 'ativos') {
        data = await operationalQueriesService.buscarPendentes(
          filtroTipo ? { query_type: filtroTipo } : {}
        )
      } else {
        const filtros = {}
        if (filtroStatus !== 'todos') filtros.status = filtroStatus
        if (filtroTipo) filtros.query_type = filtroTipo
        data = await operationalQueriesService.listar(filtros)
      }
      setConsultas(data)
      setErro(null)
    } catch (err) {
      setErro(err.message)
    } finally {
      setLoading(false)
    }
  }, [filtroStatus, filtroTipo])

  useEffect(() => {
    setLoading(true)
    carregarConsultas()
  }, [carregarConsultas])

  useEffect(() => {
    if (DEMO_MODE) return
    let channel = null
    try {
      channel = operationalQueriesService.subscribe(() => carregarConsultas())
    } catch {
      channel = null
    }
    return () => {
      try { channel?.unsubscribe() } catch { /* ignora */ }
    }
  }, [carregarConsultas])

  async function handleResponder(id, resposta, deveAprender, produtoNome) {
    try {
      if (!DEMO_MODE) await operationalQueriesService.responder(id, resposta, operador?.id)

      // Best-effort: a resposta já foi gravada acima — uma falha aqui não deve
      // reverter o status "respondida" nem impedir o fluxo de aprendizado
      // abaixo, só avisa que o cliente pode não ter recebido a mensagem.
      if (!DEMO_MODE) {
        try {
          await operationalQueriesService.notificarCliente(id)
        } catch (erroNotificacao) {
          toast.aviso('Resposta salva, mas não consegui mandar pro WhatsApp do cliente: ' + erroNotificacao.message)
        }
      }

      // Auto-aprendizado: extrai preço e disponibilidade e salva na memória
      if (deveAprender && produtoNome) {
        const preco = extrairPrecoDeTexto(resposta)
        const dispon = extrairDisponibilidadeDeTexto(resposta)
        if (preco !== null || dispon !== null) {
          try {
            await productEngineService.aprenderDeResposta({
              produto_nome:    produtoNome,
              preco:           preco,
              disponibilidade: dispon ?? 'disponivel',
              operadorId:      operador?.id,
              observacao:      `Aprendido de consulta: ${resposta.substring(0, 100)}`,
            })
            setAprendizados((n) => n + 1)
            toast.sucesso('✅ Respondida. 🧠 IA aprendeu com a resposta.')
          } catch {
            toast.sucesso('Consulta respondida com sucesso.')
          }
        } else {
          toast.sucesso('Consulta respondida com sucesso.')
        }
      } else {
        toast.sucesso('Consulta respondida com sucesso.')
      }

      if (!DEMO_MODE) {
        await carregarConsultas()
      } else {
        setConsultas((prev) => prev.map((c) =>
          c.id === id ? { ...c, status: 'answered', response: resposta, responded_by: 'Operador' } : c
        ))
      }
    } catch (err) {
      toast.erro(err.message ?? 'Erro ao responder consulta.')
    }
  }

  async function handleApagar(id) {
    try {
      if (!DEMO_MODE) {
        await operationalQueriesService.apagar(id)
        await carregarConsultas()
      } else {
        setConsultas((prev) => prev.filter((c) => c.id !== id))
      }
      toast.sucesso('Consulta apagada.')
    } catch (err) {
      toast.erro('Erro ao apagar: ' + err.message)
    }
  }

  const consultasFiltradas = consultas.filter((c) => {
    if (!busca) return true
    const termo = busca.toLowerCase()
    return (
      c.product_name?.toLowerCase().includes(termo) ||
      c.context?.toLowerCase().includes(termo) ||
      c.clientes?.nome?.toLowerCase().includes(termo)
    )
  })

  const pendentes = consultas.filter((c) => c.status === QUERY_STATUS.PENDING || c.status === QUERY_STATUS.ASSIGNED)
  const criticas  = pendentes.filter((c) => c.priority === 'critica')

  return (
    <div className="consultas-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Consultas Operacionais</h1>
          <p className="page-subtitle">Perguntas da IA que precisam de resposta humana</p>
        </div>
        <div className="page-header-acoes">
          {DEMO_MODE && <span className="badge-mock">⚡ Demo</span>}
          {aprendizados > 0 && (
            <span className="aprendizado-session-badge">
              🧠 {aprendizados} produto{aprendizados > 1 ? 's' : ''} aprendido{aprendizados > 1 ? 's' : ''} hoje
            </span>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="consultas-kpi-strip">
        <div className="consultas-kpi">
          <span className="consultas-kpi-valor" style={{ color: 'var(--warning)' }}>{pendentes.length}</span>
          <span className="consultas-kpi-label">Pendentes</span>
        </div>
        <div className="consultas-kpi">
          <span className="consultas-kpi-valor" style={{ color: 'var(--danger)' }}>{criticas.length}</span>
          <span className="consultas-kpi-label">Críticas</span>
        </div>
        <div className="consultas-kpi">
          <span className="consultas-kpi-valor" style={{ color: 'var(--success)' }}>
            {consultas.filter((c) => c.status === 'answered').length}
          </span>
          <span className="consultas-kpi-label">Respondidas</span>
        </div>
        <div className="consultas-kpi">
          <span className="consultas-kpi-valor" style={{ color: '#8B5CF6' }}>{aprendizados}</span>
          <span className="consultas-kpi-label">🧠 Aprendidos</span>
        </div>
      </div>

      {/* Alerta de críticas */}
      {criticas.length > 0 && (
        <div className="consultas-alerta-critico">
          🔴 <strong>{criticas.length} consulta{criticas.length > 1 ? 's' : ''} crítica{criticas.length > 1 ? 's' : ''}</strong> aguardando resposta urgente!
        </div>
      )}

      {/* Barra de filtros */}
      <div className="consultas-filtros">
        <div className="consultas-filtros-status">
          {FILTROS_STATUS.map((f) => (
            <button
              key={f.value}
              className={`consultas-filtro-btn ${filtroStatus === f.value ? 'consultas-filtro-btn--ativo' : ''}`}
              onClick={() => setFiltroStatus(f.value)}
            >
              {f.icone} {f.label}
              {f.value === 'ativos' && pendentes.length > 0 && (
                <span className="consultas-filtro-count">{pendentes.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="consultas-filtros-right">
          <select
            className="consultas-select"
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
          >
            <option value="">Todos os tipos</option>
            {Object.entries(QUERY_TYPE_CONFIG).map(([v, c]) => (
              <option key={v} value={v}>{c.icone} {c.label}</option>
            ))}
          </select>

          <input
            className="consultas-busca"
            type="text"
            placeholder="Buscar produto ou cliente…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {/* Lista */}
      <div className="consultas-lista">
        {loading ? (
          <div className="consultas-empty">
            <div className="loading-spinner" />
            <p>Carregando consultas…</p>
          </div>
        ) : erro ? (
          <ErrorState
            titulo="Não foi possível carregar as consultas operacionais"
            detalhe={`Verifique a conexão com o Supabase. (${erro})`}
            onRetry={carregarConsultas}
          />
        ) : consultasFiltradas.length === 0 ? (
          <div className="consultas-empty">
            <span className="consultas-empty-icone">✅</span>
            <p className="consultas-empty-texto">Nenhuma consulta encontrada.</p>
            {filtroStatus === 'ativos' && (
              <p className="consultas-empty-subtexto">Todas as consultas foram respondidas.</p>
            )}
          </div>
        ) : (
          consultasFiltradas.map((consulta) => (
            <ConsultaCard
              key={consulta.id}
              consulta={consulta}
              onResponder={handleResponder}
              onApagar={handleApagar}
            />
          ))
        )}
      </div>
    </div>
  )
}
