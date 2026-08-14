import { useState, useEffect, useCallback, useRef } from 'react'
import { separacaoService } from '@/services/separacao.service'
import { useToast } from '@/contexts/AppContext'
import { getStatusSeparacaoConfig, getPrioridadeSeparacaoConfig } from '@/utils/statusSeparacao'
import { formatCurrency, formatDate, formatPhone } from '@/utils/formatters'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { supabase } from '@/supabase/client'

/**
 * Visão do Operador sobre uma solicitação: acompanhamento ao vivo,
 * checklist (editável só se tipo='rapida', já que aí o operador é o
 * executor), chat interno (só tipo='delegada' — RPC rejeita chat em
 * Separação Rápida) e cancelamento.
 */
export function SolicitacaoDetalheModal({ solicitacaoId, onFechar, onAtualizado }) {
  const { toast } = useToast()
  const [solicitacao, setSolicitacao] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [textoMsg, setTextoMsg] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const mensagensFimRef = useRef(null)

  const carregar = useCallback(async () => {
    try {
      const s = await separacaoService.buscarPorId(solicitacaoId)
      setSolicitacao(s)
      if (s.tipo === 'delegada') {
        setMensagens(await separacaoService.listarMensagens(solicitacaoId))
      }
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
      .channel(`solicitacao-detalhe-${solicitacaoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_separacao', filter: `id=eq.${solicitacaoId}` }, carregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_separacao_itens', filter: `solicitacao_id=eq.${solicitacaoId}` }, carregar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'solicitacoes_separacao_mensagens', filter: `solicitacao_id=eq.${solicitacaoId}` }, carregar)
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [solicitacaoId, carregar])

  useEffect(() => {
    mensagensFimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  async function handleToggleItem(item) {
    try {
      await separacaoService.marcarItem(item.id, !item.separado)
      await carregar()
    } catch (err) {
      toast.erro('Erro ao marcar item: ' + err.message)
    }
  }

  async function handleConcluir() {
    try {
      await separacaoService.concluir(solicitacaoId)
      toast.sucesso('Separação concluída.')
      await carregar()
      onAtualizado?.()
    } catch (err) {
      toast.erro('Erro ao concluir: ' + err.message)
    }
  }

  async function handleCancelar() {
    const motivo = window.prompt('Motivo do cancelamento (opcional):')
    if (motivo === null) return
    setCancelando(true)
    try {
      await separacaoService.cancelar(solicitacaoId, motivo.trim() || null)
      toast.sucesso('Solicitação cancelada.')
      onAtualizado?.()
      onFechar()
    } catch (err) {
      toast.erro('Erro ao cancelar: ' + err.message)
    } finally {
      setCancelando(false)
    }
  }

  async function handleEnviarMensagem(e) {
    e.preventDefault()
    if (!textoMsg.trim()) return
    setEnviando(true)
    try {
      await separacaoService.enviarMensagem(solicitacaoId, textoMsg.trim())
      setTextoMsg('')
      await carregar()
    } catch (err) {
      toast.erro('Erro ao enviar mensagem: ' + err.message)
    } finally {
      setEnviando(false)
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

  const statusCfg = getStatusSeparacaoConfig(solicitacao.status)
  const prioridadeCfg = getPrioridadeSeparacaoConfig(solicitacao.prioridade)
  const itens = solicitacao.itens ?? []
  const todosMarcados = itens.length > 0 && itens.every((i) => i.separado)
  // Operador só pode marcar itens/concluir se for Separação Rápida (ele é o executor).
  const operadorEhExecutor = solicitacao.tipo === 'rapida'
  const podeCancelar = ['pendente', 'em_andamento'].includes(solicitacao.status)

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal modal--grande">
        <div className="modal-header">
          <h2 className="modal-titulo">
            {solicitacao.tipo === 'rapida' ? '⚡ Separação Rápida' : 'Solicitação de Separação'} — {solicitacao.pedidos?.protocolo}
          </h2>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>

        <div className="modal-body">
          <div className="pedido-detalhe-secao">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="status-badge status-badge--md" style={{ color: statusCfg.cor, backgroundColor: statusCfg.bg, borderColor: statusCfg.borda }}>
                <span className="status-badge-icone">{statusCfg.icone}</span>
                <span className="status-badge-label">{statusCfg.label}</span>
              </span>
              <span className="status-badge status-badge--md" style={{ color: prioridadeCfg.cor, backgroundColor: prioridadeCfg.bg }}>
                <span className="status-badge-icone">{prioridadeCfg.icone}</span>
                <span className="status-badge-label">{prioridadeCfg.label}</span>
              </span>
              {solicitacao.horario_retirada && (
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  Retirada: {formatDate(solicitacao.horario_retirada)}
                </span>
              )}
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-2)' }}>
              <div><strong>Cliente:</strong> {solicitacao.pedidos?.clientes?.nome ?? '—'} · {formatPhone(solicitacao.pedidos?.clientes?.telefone)}</div>
              {solicitacao.tipo === 'delegada' && (
                <div><strong>Separador:</strong> {solicitacao.separador?.nome ?? '—'}</div>
              )}
              {solicitacao.observacao && <div><strong>Observação:</strong> {solicitacao.observacao}</div>}
            </div>
          </div>

          <div className="pedido-detalhe-secao">
            <div className="pedido-detalhe-titulo">Checklist ({itens.filter((i) => i.separado).length}/{itens.length})</div>
            {itens.map((item) => (
              <div key={item.id} className="ficha-tabela-linha" style={{ gridTemplateColumns: '1fr auto auto', alignItems: 'center' }}>
                <div>{item.itens_pedido?.nome_item}</div>
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>x{item.itens_pedido?.quantidade}</div>
                <div>
                  <input
                    type="checkbox"
                    checked={item.separado}
                    disabled={!operadorEhExecutor || solicitacao.status !== 'em_andamento'}
                    onChange={() => handleToggleItem(item)}
                    style={{ width: 18, height: 18, cursor: operadorEhExecutor ? 'pointer' : 'default' }}
                  />
                </div>
              </div>
            ))}
            {operadorEhExecutor && solicitacao.status === 'em_andamento' && (
              <button className="btn btn-success" style={{ marginTop: 10 }} disabled={!todosMarcados} onClick={handleConcluir}>
                ✓ Separação Pronta
              </button>
            )}
          </div>

          {solicitacao.tipo === 'delegada' && (
            <div className="pedido-detalhe-secao">
              <div className="pedido-detalhe-titulo">Chat com o Separador</div>
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                {mensagens.length === 0 ? (
                  <p className="texto-vazio">Nenhuma mensagem ainda</p>
                ) : (
                  mensagens.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: m.autor_tipo === 'operador' ? 'flex-end' : 'flex-start',
                        background: m.autor_tipo === 'operador' ? 'var(--accent-purple-bg, rgba(139,92,246,0.15))' : 'var(--bg-hover)',
                        borderRadius: 8,
                        padding: '6px 10px',
                        maxWidth: '80%',
                      }}
                    >
                      <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 2 }}>
                        {m.autor_tipo === 'operador' ? (m.autor_operador?.nome ?? 'Operador') : (m.autor_funcionario?.nome ?? 'Separador')}
                      </div>
                      <div style={{ fontSize: 13 }}>{m.texto}</div>
                    </div>
                  ))
                )}
                <div ref={mensagensFimRef} />
              </div>
              <form onSubmit={handleEnviarMensagem} style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  placeholder="Escrever mensagem..."
                  value={textoMsg}
                  onChange={(e) => setTextoMsg(e.target.value)}
                  disabled={enviando}
                />
                <button type="submit" className="btn btn-primary" disabled={enviando || !textoMsg.trim()}>Enviar</button>
              </form>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {podeCancelar && (
            <button className="btn btn-danger" onClick={handleCancelar} disabled={cancelando}>
              {cancelando ? 'Cancelando...' : 'Cancelar Solicitação'}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
