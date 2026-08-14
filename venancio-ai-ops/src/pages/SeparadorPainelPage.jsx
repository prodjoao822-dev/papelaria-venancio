import { Navigate, useNavigate } from 'react-router-dom'
import { useSeparadorAuth } from '@/contexts/SeparadorAuthContext'
import { useMinhasSolicitacoes } from '@/hooks/useMinhasSolicitacoes'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { getStatusSeparacaoConfig } from '@/utils/statusSeparacao'
import { formatDate, formatCurrency } from '@/utils/formatters'

/** Painel do Separador — lista de solicitações atribuídas a ele, prioridade
 * imediata sempre no topo e visualmente destacada (RN-02). Rota
 * `/separador/painel`, protegida pelo próprio guard aqui (não usa
 * RequireAuth do Operador — é outra identidade). */
export function SeparadorPainelPage() {
  const { session, carregando: carregandoAuth, funcionario, logout } = useSeparadorAuth()
  const navigate = useNavigate()
  const { solicitacoes, carregando, erro, recarregar } = useMinhasSolicitacoes({
    statusIn: ['pendente', 'em_andamento'],
  })

  if (carregandoAuth) return <LoadingSpinner mensagem="Carregando sessão..." />
  if (!session) return <Navigate to="/separador" replace />

  const ordenadas = [...solicitacoes].sort((a, b) => {
    if (a.prioridade !== b.prioridade) return a.prioridade === 'imediata' ? -1 : 1
    return new Date(a.criado_em) - new Date(b.criado_em)
  })

  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1 className="page-titulo">Olá, {funcionario?.nome ?? 'Separador'}</h1>
          <p className="page-descricao">Suas solicitações de separação</p>
        </div>
        <div className="page-header-acoes">
          <button className="btn btn-ghost btn-sm" onClick={recarregar}>↺</button>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Sair</button>
        </div>
      </div>

      {carregando ? (
        <LoadingSpinner mensagem="Carregando..." />
      ) : erro ? (
        <ErrorState titulo="Erro ao carregar" detalhe={erro.message} onRetry={recarregar} />
      ) : ordenadas.length === 0 ? (
        <EmptyState icone="🎉" titulo="Nenhuma solicitação pendente" descricao="Você está em dia!" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ordenadas.map((s) => {
            const statusCfg = getStatusSeparacaoConfig(s.status)
            const imediata = s.prioridade === 'imediata'
            const total = s.itens?.length ?? 0
            const feitos = s.itens?.filter((i) => i.separado).length ?? 0
            return (
              <div
                key={s.id}
                className="card card--hover"
                style={{
                  cursor: 'pointer',
                  borderLeft: `4px solid ${imediata ? '#E5484D' : '#5B7596'}`,
                }}
                onClick={() => navigate(`/separador/solicitacao/${s.id}`)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {imediata ? '⚡ Imediata' : '🗓️ Agendada'} — {s.pedidos?.protocolo}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
                      {s.pedidos?.clientes?.nome ?? '—'} · {formatCurrency(s.pedidos?.valor_total)}
                    </div>
                    {!imediata && s.horario_retirada && (
                      <div style={{ fontSize: 13, color: '#5B7596', marginTop: 2 }}>
                        Retirada: {formatDate(s.horario_retirada)}
                      </div>
                    )}
                  </div>
                  <span
                    className="status-badge status-badge--sm"
                    style={{ color: statusCfg.cor, backgroundColor: statusCfg.bg, borderColor: statusCfg.borda }}
                  >
                    {statusCfg.icone} {statusCfg.label}
                  </span>
                </div>
                {total > 0 && (
                  <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-2)' }}>
                    {feitos}/{total} itens separados
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
