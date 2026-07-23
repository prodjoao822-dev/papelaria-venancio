import { useState, useMemo } from 'react'
import { useOrcamentos } from '@/hooks/useOrcamentos'
import { NovoOrcamentoModal } from '@/components/orcamentos/NovoOrcamentoModal'
import { StatusOrcBadge } from '@/components/orcamentos/StatusOrcBadge'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/contexts/AppContext'
import { formatCurrency, formatDate, formatTimeAgo, formatPhone } from '@/utils/formatters'

// Enum real status_orcamento (chatbot/papelaria-bot/supabase/squemanovo.sql):
// rascunho -> enviado|recusado|aceito ; enviado -> aceito|recusado|expirado.
// "Aceitar" não é uma troca de status qualquer — aceitar_orcamento() gera o
// pedido na mesma transação, por isso tem ação própria (acao: 'aceitar').
const ABAS_ORC = [
  { id: 'TODOS',     label: 'Todos',         statuses: null },
  { id: 'ATIVOS',    label: 'Em Andamento',  statuses: ['rascunho', 'enviado'] },
  { id: 'ACEITOS',   label: 'Aceitos',       statuses: ['aceito'] },
  { id: 'PERDIDOS',  label: 'Perdidos',      statuses: ['recusado', 'expirado'] },
]

const ACOES_STATUS = {
  rascunho: [
    { status: 'enviado',  label: 'Marcar Enviado', cls: 'btn-ghost',   acao: 'status' },
    { status: 'aceito',   label: '✓ Aceitar',      cls: 'btn-success', acao: 'aceitar' },
    { status: 'recusado', label: '✗ Recusar',      cls: 'btn-danger',  acao: 'status' },
  ],
  enviado: [
    { status: 'aceito',   label: '✓ Aceitar',      cls: 'btn-success', acao: 'aceitar' },
    { status: 'recusado', label: '✗ Recusar',      cls: 'btn-danger',  acao: 'status' },
    { status: 'expirado', label: 'Marcar Expirado', cls: 'btn-ghost',  acao: 'status' },
  ],
  aceito: [],
  recusado: [],
  expirado: [],
}

function OrcamentoDetalhe({ orc, onStatusChange, onAceitar, onFechar }) {
  const [processando, setProcessando] = useState(false)
  const acoes = ACOES_STATUS[orc.status] ?? []
  const pedidoGerado = orc.pedidos?.[0]

  async function handleAcao(acao) {
    setProcessando(true)
    try {
      if (acao.acao === 'aceitar') await onAceitar(orc.id)
      else await onStatusChange(orc.id, acao.status)
    } finally {
      setProcessando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal modal--grande">
        <div className="modal-header">
          <div className="modal-header-esquerda">
            <span style={{ fontSize: 22 }}>📋</span>
            <div>
              <h2 className="modal-titulo">{orc.protocolo}</h2>
              <p className="modal-subtitulo">{orc.clientes?.nome} · {formatDate(orc.criado_em)}</p>
            </div>
          </div>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>

        <div className="modal-body">
          <div className="pedido-detalhe">

            {/* Status e ações */}
            <div className="pedido-detalhe-secao">
              <p className="pedido-detalhe-titulo">Status</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <StatusOrcBadge status={orc.status} tamanho="lg" />
                {acoes.map((a) => (
                  <button key={a.status} className={`btn btn-sm ${a.cls}`}
                    onClick={() => handleAcao(a)} disabled={processando}>
                    {processando ? '...' : a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dados */}
            <div className="pedido-detalhe-secao">
              <p className="pedido-detalhe-titulo">Cliente</p>
              <div className="pedido-detalhe-grid">
                <div className="pedido-detalhe-campo">
                  <span className="campo-label">Nome</span>
                  <span className="campo-valor">{orc.clientes?.nome ?? '—'}</span>
                </div>
                <div className="pedido-detalhe-campo">
                  <span className="campo-label">Telefone</span>
                  <span className="campo-valor">{formatPhone(orc.clientes?.telefone)}</span>
                </div>
                <div className="pedido-detalhe-campo">
                  <span className="campo-label">Tipo</span>
                  <span className="campo-valor">{orc.tipo}</span>
                </div>
                {orc.observacoes && (
                  <div className="pedido-detalhe-campo pedido-detalhe-campo--full">
                    <span className="campo-label">Observações</span>
                    <span className="campo-valor">{orc.observacoes}</span>
                  </div>
                )}
                {pedidoGerado && (
                  <div className="pedido-detalhe-campo">
                    <span className="campo-label">Pedido Gerado</span>
                    <span className="campo-valor" style={{ color: 'var(--primary-hover)', fontWeight: 700 }}>
                      {pedidoGerado.protocolo}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Itens */}
            <div className="pedido-detalhe-secao">
              <p className="pedido-detalhe-titulo">Itens</p>
              <div className="itens-lista">
                {(orc.itens_orcamento ?? []).map((item) => (
                  <div key={item.id} className="item-linha">
                    <span className="item-qtd">{item.quantidade}×</span>
                    <span className="item-nome">{item.nome_item}</span>
                    <span className="item-preco">{formatCurrency(item.valor_unitario)}</span>
                    <span className="item-subtotal">{formatCurrency(item.valor_total)}</span>
                  </div>
                ))}
                <div className="itens-total">
                  <span>Total do Orçamento</span>
                  <span className="itens-total-valor">{formatCurrency(orc.valor_total)}</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

export function OrcamentosPage() {
  const { orcamentos, carregando, carregar, aceitar, atualizarStatus } = useOrcamentos()
  const [abaAtiva, setAbaAtiva] = useState('TODOS')
  const [busca, setBusca] = useState('')
  const [novoAberto, setNovoAberto] = useState(false)
  const [orcDetalhe, setOrcDetalhe] = useState(null)

  const orcFiltrados = useMemo(() => {
    const aba = ABAS_ORC.find((a) => a.id === abaAtiva)
    let lista = orcamentos

    if (aba?.statuses) {
      lista = lista.filter((o) => aba.statuses.includes(o.status))
    }

    if (busca) {
      const b = busca.toLowerCase()
      lista = lista.filter(
        (o) => o.clientes?.nome?.toLowerCase().includes(b) || o.clientes?.telefone?.includes(busca)
      )
    }

    return lista
  }, [orcamentos, abaAtiva, busca])

  function contagemAba(aba) {
    if (!aba.statuses) return orcamentos.length
    return orcamentos.filter((o) => aba.statuses.includes(o.status)).length
  }

  // KPIs resumo
  const totalOrcamentos = orcamentos.length
  const totalValor = orcamentos.reduce((a, o) => a + (o.valor_total ?? 0), 0)
  const aceitos = orcamentos.filter((o) => o.status === 'aceito').length
  const taxaConversao = totalOrcamentos > 0 ? Math.round((aceitos / totalOrcamentos) * 100) : 0

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-info">
          <h1 className="page-titulo">Orçamentos</h1>
          <p className="page-descricao">Gerencie propostas e aceite para gerar pedidos</p>
        </div>
        <div className="page-header-acoes">
          <button className="btn btn-ghost btn-sm" onClick={() => carregar()}>↺ Atualizar</button>
          <button className="btn btn-primary" onClick={() => setNovoAberto(true)}>
            ＋ Novo Orçamento
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { titulo: 'Total',       valor: totalOrcamentos,             cor: '#3B82F6', icone: '📋' },
          { titulo: 'Valor Total', valor: formatCurrency(totalValor),  cor: '#10B981', icone: '💰' },
          { titulo: 'Aceitos',     valor: aceitos,                     cor: '#7C3AED', icone: '✅' },
          { titulo: 'Conversão',   valor: `${taxaConversao}%`,         cor: '#F59E0B', icone: '🎯' },
        ].map((k) => (
          <div key={k.titulo} className="kpi-card" style={{ '--kpi-cor': k.cor }}>
            <div className="kpi-card-header">
              <div className="kpi-card-header-left">
                <span className="kpi-card-icone">{k.icone}</span>
                <span className="kpi-card-titulo">{k.titulo}</span>
              </div>
            </div>
            <div className="kpi-card-valor">{k.valor}</div>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div className="card">
        {/* Abas */}
        <div className="abas" style={{ marginTop: 4 }}>
          {ABAS_ORC.map((aba) => (
            <button
              key={aba.id}
              className={`aba-btn ${abaAtiva === aba.id ? 'aba-btn--ativa' : ''}`}
              onClick={() => setAbaAtiva(aba.id)}
            >
              {aba.label}
              <span className="aba-count">{contagemAba(aba)}</span>
            </button>
          ))}
        </div>

        {/* Busca */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <input
            type="text"
            className="input"
            placeholder="Buscar por nome do cliente..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ maxWidth: 360 }}
          />
        </div>

        {carregando ? (
          <LoadingSpinner mensagem="Carregando orçamentos..." />
        ) : orcFiltrados.length === 0 ? (
          <EmptyState
            icone="📋"
            titulo="Nenhum orçamento nesta categoria"
            descricao="Crie um novo orçamento para começar."
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
                  <th className="tabela-th">Status</th>
                  <th className="tabela-th">Pedido</th>
                  <th className="tabela-th">Data</th>
                  <th className="tabela-th">Ações</th>
                </tr>
              </thead>
              <tbody>
                {orcFiltrados.map((orc) => {
                  const acoes = ACOES_STATUS[orc.status] ?? []
                  const pedidoGerado = orc.pedidos?.[0]
                  return (
                    <tr
                      key={orc.id}
                      className="tabela-row tabela-row--clicavel"
                      onClick={() => setOrcDetalhe(orc)}
                    >
                      <td className="tabela-cell">
                        <span className="pedido-numero" style={{ fontFamily: 'var(--font-mono)' }}>
                          {orc.protocolo}
                        </span>
                      </td>
                      <td className="tabela-cell">
                        <div className="pedido-cliente-nome">{orc.clientes?.nome ?? '—'}</div>
                        <div className="pedido-cliente-tel">{formatPhone(orc.clientes?.telefone)}</div>
                      </td>
                      <td className="tabela-cell">
                        <span className="pedido-itens-resumo">{(orc.itens_orcamento ?? []).length} item(s)</span>
                      </td>
                      <td className="tabela-cell">
                        <span className="pedido-valor">{formatCurrency(orc.valor_total)}</span>
                      </td>
                      <td className="tabela-cell">
                        <StatusOrcBadge status={orc.status} />
                      </td>
                      <td className="tabela-cell">
                        {pedidoGerado ? (
                          <span className="pedido-numero" style={{ fontSize: 11 }}>
                            {pedidoGerado.protocolo}
                          </span>
                        ) : (
                          <span className="texto-vazio">—</span>
                        )}
                      </td>
                      <td className="tabela-cell">
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {formatTimeAgo(orc.criado_em)}
                        </span>
                      </td>
                      <td className="tabela-cell" onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                          {acoes.slice(0, 1).map((a) => (
                            <button
                              key={a.status}
                              className={`btn btn-sm ${a.cls}`}
                              onClick={() => (a.acao === 'aceitar' ? aceitar(orc.id) : atualizarStatus(orc.id, a.status))}
                              title={a.label}
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {novoAberto && (
        <NovoOrcamentoModal
          onFechar={() => setNovoAberto(false)}
          onCriado={() => carregar()}
        />
      )}

      {orcDetalhe && (
        <OrcamentoDetalhe
          orc={orcDetalhe}
          onStatusChange={async (id, status) => {
            await atualizarStatus(id, status)
            const updated = orcamentos.find((o) => o.id === id)
            if (updated) setOrcDetalhe({ ...updated, status })
          }}
          onAceitar={async (id) => {
            await aceitar(id)
            setOrcDetalhe(null)
          }}
          onFechar={() => setOrcDetalhe(null)}
        />
      )}
    </div>
  )
}
