import { useState, useMemo, useEffect, useRef } from 'react'
import { useClientes } from '@/hooks/useClientes'
import { useAtendimentoAtivo } from '@/hooks/useAtendimentoAtivo'
import { clientesService } from '@/services/clientes.service'
import { ClienteModal } from '@/components/clientes/ClienteModal'
import { EtiquetaAtendimento } from '@/components/atendimento/EtiquetaAtendimento'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatCurrency, formatPhone, formatDate, formatTimeAgo } from '@/utils/formatters'

const POR_PAGINA = 25

const STATUS_COR = {
  ativo:   { cor: '#10B981', bg: 'rgba(16,185,129,0.10)',  borda: 'rgba(16,185,129,0.25)' },
  inativo: { cor: '#6B7280', bg: 'rgba(107,114,128,0.08)', borda: 'rgba(107,114,128,0.20)' },
  vip:     { cor: '#F59E0B', bg: 'rgba(245,158,11,0.10)',  borda: 'rgba(245,158,11,0.25)' },
}

function BadgeStatus({ status }) {
  const c = STATUS_COR[status] ?? STATUS_COR.ativo
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 600, color: c.cor, background: c.bg, border: `1px solid ${c.borda}`,
    }}>
      {status === 'vip' ? '⭐ VIP' : status === 'ativo' ? '● Ativo' : '○ Inativo'}
    </span>
  )
}

const FILTROS_STATUS = [
  { value: '', label: 'Todos' },
  { value: 'ativo', label: 'Ativos' },
  { value: 'vip', label: 'VIP' },
  { value: 'inativo', label: 'Inativos' },
]

const ORDENACOES = [
  { value: 'recente',  label: 'Mais recentes' },
  { value: 'gasto',    label: 'Maior gasto' },
  { value: 'pedidos',  label: 'Mais pedidos' },
  { value: 'ticket',   label: 'Maior ticket' },
  { value: 'nome',     label: 'Nome A-Z' },
]

export function ClientesPage() {
  const { clientes, carregando, carregar } = useClientes()
  const { mapa: mapaAtendimento } = useAtendimentoAtivo()
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [ordenacao, setOrdenacao] = useState('recente')
  const [pagina, setPagina] = useState(1)
  const [clienteSelecionado, setClienteSelecionado] = useState(null)

  // `clientes` (do useClientes) é limitado aos 200 de maior gasto — ótimo
  // pros KPIs do topo (não deve mudar com busca), péssimo pra busca (cliente
  // fora do top 200 "não existia" pra quem procurava). Busca com termo ativo
  // vai direto no servidor (view v_clientes_crm), sem esse teto.
  const [resultadosBusca, setResultadosBusca] = useState(null)
  const [buscandoServidor, setBuscandoServidor] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!busca.trim()) {
      setResultadosBusca(null)
      setBuscandoServidor(false)
      return
    }
    setBuscandoServidor(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await clientesService.listarCrm({ busca: busca.trim(), status: filtroStatus || undefined })
        setResultadosBusca(data)
      } catch {
        setResultadosBusca([])
      } finally {
        setBuscandoServidor(false)
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [busca, filtroStatus])

  const clientesFiltrados = useMemo(() => {
    let lista = resultadosBusca !== null ? [...resultadosBusca] : [...clientes]

    if (resultadosBusca === null && filtroStatus) {
      lista = lista.filter((c) => c.status === filtroStatus)
    }

    lista.sort((a, b) => {
      switch (ordenacao) {
        case 'gasto':   return (b.total_gasto ?? 0) - (a.total_gasto ?? 0)
        case 'pedidos': return (b.qtd_pedidos ?? 0) - (a.qtd_pedidos ?? 0)
        case 'ticket':  return (b.ticket_medio ?? 0) - (a.ticket_medio ?? 0)
        case 'nome':    return (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR')
        default:        return new Date(b.criado_em) - new Date(a.criado_em)
      }
    })

    return lista
  }, [clientes, resultadosBusca, filtroStatus, ordenacao])

  const totalPaginas = Math.max(1, Math.ceil(clientesFiltrados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const clientesPagina = clientesFiltrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

  const totalGasto = clientes.reduce((a, c) => a + (c.total_gasto ?? 0), 0)
  const ticketMedioGeral = clientes.filter((c) => (c.qtd_finalizados ?? 0) > 0)
  const ticketMedio = ticketMedioGeral.length > 0
    ? ticketMedioGeral.reduce((a, c) => a + (c.ticket_medio ?? 0), 0) / ticketMedioGeral.length
    : 0
  const vips = clientes.filter((c) => c.status === 'vip').length

  function handleBusca(e) { setBusca(e.target.value); setPagina(1) }
  function handleFiltro(s) { setFiltroStatus(s); setPagina(1) }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-info">
          <h1 className="page-titulo">Clientes</h1>
          <p className="page-descricao">CRM operacional — histórico e métricas por cliente</p>
        </div>
        <div className="page-header-acoes">
          <button className="btn btn-ghost btn-sm" onClick={() => carregar()}>↺ Atualizar</button>
        </div>
      </div>

      {/* KPIs resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { titulo: 'Total de Clientes', valor: clientes.length, cor: '#3B82F6', icone: '👥' },
          { titulo: 'Faturamento Total', valor: formatCurrency(totalGasto), cor: '#10B981', icone: '💰', raw: true },
          { titulo: 'Ticket Médio',      valor: formatCurrency(ticketMedio), cor: '#F59E0B', icone: '🎯', raw: true },
          { titulo: 'Clientes VIP',      valor: vips, cor: '#7C3AED', icone: '⭐' },
        ].map((k) => (
          <div key={k.titulo} className="kpi-card" style={{ '--kpi-cor': k.cor }}>
            <div className="kpi-card-header">
              <div className="kpi-card-header-left">
                <span className="kpi-card-icone">{k.icone}</span>
                <span className="kpi-card-titulo">{k.titulo}</span>
              </div>
            </div>
            <div className="kpi-card-valor">{k.raw ? k.valor : (k.valor ?? 0)}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="filtros-painel">
        <div className="filtros-linha">
          <input
            type="text"
            className="input filtros-busca-input"
            placeholder="Buscar por nome ou telefone..."
            value={busca}
            onChange={handleBusca}
          />
          <div className="filtros-status">
            {FILTROS_STATUS.map((f) => (
              <button
                key={f.value}
                className={`filtro-status-btn ${filtroStatus === f.value ? 'filtro-status-btn--ativo' : ''}`}
                onClick={() => handleFiltro(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            className="input"
            style={{ width: 'auto', minWidth: 140 }}
            value={ordenacao}
            onChange={(e) => setOrdenacao(e.target.value)}
          >
            {ORDENACOES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabela CRM */}
      <div className="card">
        {carregando ? (
          <LoadingSpinner mensagem="Carregando clientes..." />
        ) : clientesPagina.length === 0 ? (
          <EmptyState
            icone="👥"
            titulo="Nenhum cliente encontrado"
            descricao="Clientes criados via WhatsApp ou manualmente aparecerão aqui."
          />
        ) : (
          <>
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr>
                    <th className="tabela-th">Cliente</th>
                    <th className="tabela-th">Status</th>
                    <th className="tabela-th">Pedidos</th>
                    <th className="tabela-th">Total Gasto</th>
                    <th className="tabela-th">Ticket Médio</th>
                    <th className="tabela-th">Última Compra</th>
                    <th className="tabela-th">Origem</th>
                    <th className="tabela-th"></th>
                  </tr>
                </thead>
                <tbody>
                  {clientesPagina.map((cliente) => (
                    <tr
                      key={cliente.id}
                      className="tabela-row tabela-row--clicavel"
                      onClick={() => setClienteSelecionado(cliente.id)}
                    >
                      <td className="tabela-cell">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: 'linear-gradient(135deg, var(--primary), var(--purple))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0,
                          }}>
                            {cliente.nome?.[0]?.toUpperCase() ?? '?'}
                          </div>
                          <div>
                            <div className="pedido-cliente-nome">{cliente.nome ?? '—'}</div>
                            <div className="pedido-cliente-tel">{formatPhone(cliente.telefone)}</div>
                            <EtiquetaAtendimento nome={mapaAtendimento[cliente.id]} />
                          </div>
                        </div>
                      </td>
                      <td className="tabela-cell">
                        <BadgeStatus status={cliente.status} />
                      </td>
                      <td className="tabela-cell">
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{cliente.qtd_pedidos ?? 0}</div>
                        {(cliente.qtd_finalizados ?? 0) > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--success)' }}>
                            {cliente.qtd_finalizados} finalizado(s)
                          </div>
                        )}
                      </td>
                      <td className="tabela-cell">
                        <span style={{ fontWeight: 700, color: (cliente.total_gasto ?? 0) > 0 ? 'var(--success)' : 'var(--text-3)' }}>
                          {formatCurrency(cliente.total_gasto ?? 0)}
                        </span>
                      </td>
                      <td className="tabela-cell">
                        <span style={{ color: 'var(--text-2)' }}>
                          {(cliente.ticket_medio ?? 0) > 0 ? formatCurrency(cliente.ticket_medio) : '—'}
                        </span>
                      </td>
                      <td className="tabela-cell">
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                          {cliente.ultima_compra_em ? formatDate(cliente.ultima_compra_em) : '—'}
                        </span>
                      </td>
                      <td className="tabela-cell">
                        <span className={`tag tag--${cliente.origem}`}>
                          {cliente.origem === 'whatsapp' ? '📱 WhatsApp' : '🖥️ Manual'}
                        </span>
                      </td>
                      <td className="tabela-cell tabela-cell--acao">
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={(e) => { e.stopPropagation(); setClienteSelecionado(cliente.id) }}
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {totalPaginas > 1 && (
              <div className="paginacao">
                <button
                  className="pag-btn"
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={paginaAtual === 1}
                >
                  ‹
                </button>
                {Array.from({ length: Math.min(totalPaginas, 7) }, (_, i) => {
                  const p = i + 1
                  return (
                    <button
                      key={p}
                      className={`pag-btn ${paginaAtual === p ? 'pag-btn--ativo' : ''}`}
                      onClick={() => setPagina(p)}
                    >
                      {p}
                    </button>
                  )
                })}
                <button
                  className="pag-btn"
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={paginaAtual === totalPaginas}
                >
                  ›
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {clienteSelecionado && (
        <ClienteModal
          clienteId={clienteSelecionado}
          onFechar={() => setClienteSelecionado(null)}
        />
      )}
    </div>
  )
}
