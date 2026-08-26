import { useState } from 'react'
import { usePedidos } from '@/hooks/usePedidos'
import { useSolicitacoesEntrega } from '@/hooks/useSolicitacoesEntrega'
import { STATUS } from '@/utils/status'
import { getStatusEntregaConfig } from '@/utils/statusEntrega'
import { formatPhone, formatTimeAgo, formatDate } from '@/utils/formatters'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { DelegarEntregaModal } from '@/components/logistica/DelegarEntregaModal'
import { SolicitacaoEntregaDetalheModal } from '@/components/logistica/SolicitacaoEntregaDetalheModal'

const FILTROS_ENTREGA = [
  { valor: ['pendente', 'em_rota'], label: 'Ativas' },
  { valor: ['entregue'], label: 'Entregues' },
  { valor: ['insucesso', 'cancelada'], label: 'Insucesso/Canceladas' },
  { valor: null, label: 'Todas' },
]

export function LogisticaPage() {
  const { pedidos, carregando: carregandoPedidos } = usePedidos()
  const [filtroIdx, setFiltroIdx] = useState(0)
  const [busca, setBusca] = useState('')
  const { solicitacoes, carregando, erro, recarregar } = useSolicitacoesEntrega(
    FILTROS_ENTREGA[filtroIdx].valor ? { statusIn: FILTROS_ENTREGA[filtroIdx].valor } : {}
  )
  const [modalDelegar, setModalDelegar] = useState(false)
  const [solicitacaoAberta, setSolicitacaoAberta] = useState(null)

  const prontoRetirada = pedidos.filter((p) => p.status === STATUS.PRONTO_RETIRADA)

  const solicitacoesFiltradas = solicitacoes.filter((s) => {
    if (!busca) return true
    const termo = busca.toLowerCase()
    return (
      s.pedidos?.protocolo?.toLowerCase().includes(termo) ||
      s.pedidos?.clientes?.nome?.toLowerCase().includes(termo)
    )
  })

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-info">
          <h1 className="page-titulo">Logística</h1>
          <p className="page-descricao">Retiradas pendentes e entregas delegadas</p>
        </div>
        <div className="page-header-acoes">
          <button className="btn btn-ghost btn-sm" onClick={recarregar}>↺ Atualizar</button>
          <button className="btn btn-primary" onClick={() => setModalDelegar(true)}>+ Delegar Entrega</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 20 }}>

        {/* Pronto para Retirada */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.7px', textTransform: 'uppercase', marginBottom: 14, color: 'var(--text-3)' }}>
            Pronto para Retirada
          </div>
          {carregandoPedidos ? (
            <LoadingSpinner mensagem="Carregando..." />
          ) : prontoRetirada.length === 0 ? (
            <EmptyState icone="🏪" titulo="Nada pra retirar" descricao="Pedidos prontos para retirada aparecem aqui." />
          ) : (
            prontoRetirada.map((p) => (
              <div key={p.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{p.clientes?.nome ?? '—'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>
                  {p.sequencia || p.protocolo} · {formatPhone(p.clientes?.telefone)} · desde {formatTimeAgo(p.pronto_para_retirada_em)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Entregas (solicitacoes_entrega) */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--text-3)' }}>
              Entregas
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {FILTROS_ENTREGA.map((f, idx) => (
                <button
                  key={f.label}
                  className={`btn btn-sm ${filtroIdx === idx ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setFiltroIdx(idx)}
                >
                  {f.label}
                </button>
              ))}
              <input
                className="consultas-busca"
                type="text"
                placeholder="Buscar por nº do pedido ou cliente…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                style={{ width: 200 }}
              />
            </div>
          </div>

          {carregando ? (
            <LoadingSpinner mensagem="Carregando entregas..." />
          ) : erro ? (
            <ErrorState titulo="Erro ao carregar entregas" detalhe={erro.message} onRetry={recarregar} />
          ) : solicitacoesFiltradas.length === 0 ? (
            <EmptyState
              icone="🛵"
              titulo={busca ? 'Nenhuma entrega encontrada' : 'Nenhuma entrega'}
              descricao={busca ? 'Tente buscar por outro nome ou número.' : 'Clique em "+ Delegar Entrega" para começar.'}
            />
          ) : (
            solicitacoesFiltradas.map((s) => {
              const statusCfg = getStatusEntregaConfig(s.status)
              return (
                <div
                  key={s.id}
                  onClick={() => setSolicitacaoAberta(s.id)}
                  style={{
                    padding: '14px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{s.pedidos?.clientes?.nome ?? '—'}</span>
                      <span
                        className="status-badge status-badge--sm"
                        style={{ color: statusCfg.cor, backgroundColor: statusCfg.bg, borderColor: statusCfg.borda }}
                      >
                        {statusCfg.icone} {statusCfg.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
                      {s.endereco_entrega || s.pedidos?.endereco_entrega || 'Endereço não informado'}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>
                      {s.pedidos?.protocolo} · Entregador: {s.entregador?.nome ?? '— sem entregador —'}
                      {s.horario_previsto && <> · Previsto: {formatDate(s.horario_previsto, { hour: '2-digit', minute: '2-digit' })}</>}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

      </div>

      {modalDelegar && (
        <DelegarEntregaModal
          onFechar={() => setModalDelegar(false)}
          onDelegado={recarregar}
        />
      )}
      {solicitacaoAberta && (
        <SolicitacaoEntregaDetalheModal
          solicitacaoId={solicitacaoAberta}
          onFechar={() => setSolicitacaoAberta(null)}
          onAtualizado={recarregar}
        />
      )}
    </div>
  )
}
