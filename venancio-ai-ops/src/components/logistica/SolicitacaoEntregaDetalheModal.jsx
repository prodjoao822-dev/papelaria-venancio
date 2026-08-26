import { useState, useEffect, useCallback } from 'react'
import { entregaService } from '@/services/entrega.service'
import { useToast } from '@/contexts/AppContext'
import { getStatusEntregaConfig } from '@/utils/statusEntrega'
import { formatCurrency, formatDateTime, formatPhone } from '@/utils/formatters'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { supabase } from '@/supabase/client'

/**
 * Visão do Operador sobre uma solicitação de entrega: acompanhamento ao vivo
 * e cancelamento. Assumir/iniciar rota/concluir são ações do Entregador
 * (app mobile, Fase C) — aqui é só leitura + cancelamento, mesmo recorte de
 * SolicitacaoDetalheModal.jsx (Separação) pro lado do Operador.
 */
export function SolicitacaoEntregaDetalheModal({ solicitacaoId, onFechar, onAtualizado }) {
  const { toast } = useToast()
  const [solicitacao, setSolicitacao] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [cancelando, setCancelando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const s = await entregaService.buscarPorId(solicitacaoId)
      setSolicitacao(s)
    } catch (err) {
      toast.erro('Erro ao carregar solicitação: ' + err.message)
    } finally {
      setCarregando(false)
    }
  }, [solicitacaoId, toast])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (!supabase || !solicitacaoId) return undefined
    const canal = supabase
      .channel(`solicitacao-entrega-detalhe-${solicitacaoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_entrega', filter: `id=eq.${solicitacaoId}` }, carregar)
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [solicitacaoId, carregar])

  async function handleCancelar() {
    const motivo = window.prompt('Motivo do cancelamento (opcional):')
    if (motivo === null) return
    setCancelando(true)
    try {
      await entregaService.cancelar(solicitacaoId, motivo.trim() || null)
      toast.sucesso('Solicitação de entrega cancelada.')
      onAtualizado?.()
      onFechar()
    } catch (err) {
      toast.erro('Erro ao cancelar: ' + err.message)
    } finally {
      setCancelando(false)
    }
  }

  if (carregando) {
    return (
      <div className="modal-overlay">
        <div className="modal modal--medio"><LoadingSpinner mensagem="Carregando solicitação..." /></div>
      </div>
    )
  }
  if (!solicitacao) return null

  const statusCfg = getStatusEntregaConfig(solicitacao.status)
  const podeCancelar = ['pendente', 'em_rota'].includes(solicitacao.status)

  const timeline = [
    { label: 'Criada', em: solicitacao.criado_em },
    { label: 'Assumida', em: solicitacao.assumida_em },
    { label: 'Rota iniciada', em: solicitacao.iniciada_em },
    { label: 'Concluída', em: solicitacao.concluida_em },
    { label: 'Insucesso', em: solicitacao.insucesso_em },
    { label: 'Cancelada', em: solicitacao.cancelada_em },
  ].filter((t) => t.em)

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal modal--medio">
        <div className="modal-header">
          <h2 className="modal-titulo">Entrega — {solicitacao.pedidos?.protocolo}</h2>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>

        <div className="modal-body">
          <div className="pedido-detalhe-secao">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="status-badge status-badge--md" style={{ color: statusCfg.cor, backgroundColor: statusCfg.bg, borderColor: statusCfg.borda }}>
                <span className="status-badge-icone">{statusCfg.icone}</span>
                <span className="status-badge-label">{statusCfg.label}</span>
              </span>
              {solicitacao.horario_previsto && (
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  Previsto: {formatDateTime(solicitacao.horario_previsto)}
                </span>
              )}
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-2)' }}>
              <div><strong>Cliente:</strong> {solicitacao.pedidos?.clientes?.nome ?? '—'} · {formatPhone(solicitacao.pedidos?.clientes?.telefone)}</div>
              <div><strong>Valor:</strong> {formatCurrency(solicitacao.pedidos?.valor_total)}</div>
              <div><strong>Entregador:</strong> {solicitacao.entregador?.nome ?? '—'}</div>
              <div><strong>Delegado por:</strong> {solicitacao.delegado_por?.nome ?? '—'}</div>
              {solicitacao.endereco_entrega && <div><strong>Endereço:</strong> {solicitacao.endereco_entrega}</div>}
              {solicitacao.motivo_insucesso && <div><strong>Motivo do insucesso:</strong> {solicitacao.motivo_insucesso}</div>}
              {solicitacao.motivo_cancelamento && <div><strong>Motivo do cancelamento:</strong> {solicitacao.motivo_cancelamento}</div>}
            </div>
          </div>

          {timeline.length > 0 && (
            <div className="pedido-detalhe-secao">
              <div className="pedido-detalhe-titulo">Linha do tempo</div>
              <div className="historico-lista">
                {timeline.map((t) => (
                  <div key={t.label} className="historico-item">
                    <span className="historico-dot" style={{ backgroundColor: statusCfg.cor }} />
                    <div className="historico-info">
                      <span className="historico-status">{t.label}</span>
                      <span className="historico-tempo">{formatDateTime(t.em)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {podeCancelar && (
            <button className="btn btn-danger" onClick={handleCancelar} disabled={cancelando}>
              {cancelando ? 'Cancelando...' : 'Cancelar Entrega'}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
