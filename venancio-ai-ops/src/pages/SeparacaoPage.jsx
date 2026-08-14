import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useSolicitacoesSeparacao } from '@/hooks/useSolicitacoesSeparacao'
import { DelegarSeparacaoModal } from '@/components/separacao/DelegarSeparacaoModal'
import { SeparacaoRapidaModal } from '@/components/separacao/SeparacaoRapidaModal'
import { SolicitacaoDetalheModal } from '@/components/separacao/SolicitacaoDetalheModal'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { getStatusSeparacaoConfig, getPrioridadeSeparacaoConfig } from '@/utils/statusSeparacao'
import { formatDate } from '@/utils/formatters'

const FILTROS = [
  { valor: null, label: 'Todas' },
  { valor: ['pendente', 'em_andamento'], label: 'Ativas' },
  { valor: ['pronta'], label: 'Prontas' },
  { valor: ['cancelada'], label: 'Canceladas' },
]

/**
 * Tela de Separação Delegada do Operador — rota /separacao, deliberadamente
 * fora do menu principal (ver Sidebar.jsx), acessível por link direto,
 * seguindo o mesmo padrão já usado hoje por /pedidos/:id/ficha.
 */
export function SeparacaoPage() {
  const location = useLocation()
  const [filtroIdx, setFiltroIdx] = useState(1)
  const { solicitacoes, carregando, erro, recarregar } = useSolicitacoesSeparacao(
    FILTROS[filtroIdx].valor ? { statusIn: FILTROS[filtroIdx].valor } : {}
  )
  const [modalDelegar, setModalDelegar] = useState(false)
  const [modalRapida, setModalRapida] = useState(false)
  const [solicitacaoAberta, setSolicitacaoAberta] = useState(null)

  const pedidoIdInicial = location.state?.pedidoId ?? null

  useEffect(() => {
    if (pedidoIdInicial) setModalDelegar(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoIdInicial])

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-info">
          <h1 className="page-titulo">Separação Delegada</h1>
          <p className="page-descricao">Delegue a separação de um pedido a um funcionário e acompanhe ao vivo</p>
        </div>
        <div className="page-header-acoes">
          <button className="btn btn-ghost btn-sm" onClick={recarregar}>↺ Atualizar</button>
          <button className="btn btn-warning" onClick={() => setModalRapida(true)}>⚡ Separação Rápida</button>
          <button className="btn btn-primary" onClick={() => setModalDelegar(true)}>+ Delegar Separação</button>
        </div>
      </div>

      <div className="section-header">
        <div className="section-header-esquerda" style={{ display: 'flex', gap: 8 }}>
          {FILTROS.map((f, idx) => (
            <button
              key={f.label}
              className={`btn btn-sm ${filtroIdx === idx ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFiltroIdx(idx)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="section-contagem">{solicitacoes.length} solicitação(ões)</div>
      </div>

      <div className="card">
        {carregando ? (
          <LoadingSpinner mensagem="Carregando solicitações..." />
        ) : erro ? (
          <ErrorState titulo="Erro ao carregar solicitações" detalhe={erro.message} onRetry={recarregar} />
        ) : solicitacoes.length === 0 ? (
          <EmptyState icone="📦" titulo="Nenhuma solicitação" descricao='Clique em "+ Delegar Separação" para começar.' />
        ) : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th className="tabela-th">Pedido</th>
                  <th className="tabela-th">Cliente</th>
                  <th className="tabela-th">Separador</th>
                  <th className="tabela-th">Prioridade</th>
                  <th className="tabela-th">Status</th>
                  <th className="tabela-th">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {solicitacoes.map((s) => {
                  const statusCfg = getStatusSeparacaoConfig(s.status)
                  const prioridadeCfg = getPrioridadeSeparacaoConfig(s.prioridade)
                  const total = s.itens?.length ?? 0
                  const feitos = s.itens?.filter((i) => i.separado).length ?? 0
                  return (
                    <tr key={s.id} className="tabela-row tabela-row--clicavel" onClick={() => setSolicitacaoAberta(s.id)}>
                      <td className="tabela-cell"><strong>{s.pedidos?.protocolo}</strong></td>
                      <td className="tabela-cell">{s.pedidos?.clientes?.nome ?? '—'}</td>
                      <td className="tabela-cell">{s.tipo === 'rapida' ? '⚡ Você mesmo' : (s.separador?.nome ?? '—')}</td>
                      <td className="tabela-cell">
                        <span className="status-badge status-badge--sm" style={{ color: prioridadeCfg.cor, backgroundColor: prioridadeCfg.bg }}>
                          {prioridadeCfg.icone} {prioridadeCfg.label}
                        </span>
                      </td>
                      <td className="tabela-cell">
                        <span className="status-badge status-badge--sm" style={{ color: statusCfg.cor, backgroundColor: statusCfg.bg, borderColor: statusCfg.borda }}>
                          {statusCfg.icone} {statusCfg.label}
                        </span>
                        {total > 0 && <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-2)' }}>{feitos}/{total}</span>}
                      </td>
                      <td className="tabela-cell">{formatDate(s.criado_em)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalDelegar && (
        <DelegarSeparacaoModal
          pedidoIdInicial={pedidoIdInicial}
          onFechar={() => setModalDelegar(false)}
          onDelegado={recarregar}
        />
      )}
      {modalRapida && (
        <SeparacaoRapidaModal onFechar={() => setModalRapida(false)} onIniciada={recarregar} />
      )}
      {solicitacaoAberta && (
        <SolicitacaoDetalheModal
          solicitacaoId={solicitacaoAberta}
          onFechar={() => setSolicitacaoAberta(null)}
          onAtualizado={recarregar}
        />
      )}
    </div>
  )
}
