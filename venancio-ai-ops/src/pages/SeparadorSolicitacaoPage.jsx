import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { useSeparadorAuth } from '@/contexts/SeparadorAuthContext'
import { separacaoSeparadorService } from '@/services/separacaoSeparador.service'
import { separadorSupabase } from '@/supabase/separadorClient'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useToast } from '@/contexts/AppContext'
import { getStatusSeparacaoConfig } from '@/utils/statusSeparacao'
import { formatCurrency, formatPhone, formatDate } from '@/utils/formatters'

/** Checklist + chat de uma solicitação — botão "Separação Pronta" só
 * habilita quando todo item está marcado (regra também garantida no
 * servidor por concluir_separacao). Rota `/separador/solicitacao/:id`. */
export function SeparadorSolicitacaoPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { session, carregando: carregandoAuth } = useSeparadorAuth()

  const [solicitacao, setSolicitacao] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [textoMsg, setTextoMsg] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [concluindo, setConcluindo] = useState(false)
  const mensagensFimRef = useRef(null)

  const carregar = useCallback(async () => {
    try {
      const s = await separacaoSeparadorService.buscarPorId(id)
      setSolicitacao(s)
      setMensagens(await separacaoSeparadorService.listarMensagens(id))
    } catch (err) {
      toast.erro('Erro ao carregar solicitação: ' + err.message)
    } finally {
      setCarregando(false)
    }
  }, [id, toast])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (!separadorSupabase || !id) return undefined
    const canal = separadorSupabase
      .channel(`separador-solicitacao-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_separacao', filter: `id=eq.${id}` }, carregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_separacao_itens', filter: `solicitacao_id=eq.${id}` }, carregar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'solicitacoes_separacao_mensagens', filter: `solicitacao_id=eq.${id}` }, carregar)
      .subscribe()
    return () => { separadorSupabase.removeChannel(canal) }
  }, [id, carregar])

  useEffect(() => {
    mensagensFimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  if (carregandoAuth) return <LoadingSpinner mensagem="Carregando sessão..." />
  if (!session) return <Navigate to="/separador" replace />
  if (carregando) return <LoadingSpinner mensagem="Carregando solicitação..." />
  if (!solicitacao) {
    return (
      <div className="page" style={{ maxWidth: 720, margin: '0 auto' }}>
        <p>Solicitação não encontrada.</p>
        <button className="btn btn-ghost" onClick={() => navigate('/separador/painel')}>← Voltar</button>
      </div>
    )
  }

  async function handleAssumir() {
    try {
      await separacaoSeparadorService.assumir(id)
      toast.sucesso('Solicitação assumida — pode começar a separar.')
      await carregar()
    } catch (err) {
      toast.erro('Erro ao assumir: ' + err.message)
    }
  }

  async function handleToggleItem(item) {
    try {
      await separacaoSeparadorService.marcarItem(item.id, !item.separado)
      await carregar()
    } catch (err) {
      toast.erro('Erro ao marcar item: ' + err.message)
    }
  }

  async function handleConcluir() {
    setConcluindo(true)
    try {
      await separacaoSeparadorService.concluir(id)
      toast.sucesso('Separação concluída!')
      navigate('/separador/painel')
    } catch (err) {
      toast.erro('Erro ao concluir: ' + err.message)
    } finally {
      setConcluindo(false)
    }
  }

  async function handleEnviarMensagem(e) {
    e.preventDefault()
    if (!textoMsg.trim()) return
    setEnviando(true)
    try {
      await separacaoSeparadorService.enviarMensagem(id, textoMsg.trim())
      setTextoMsg('')
      await carregar()
    } catch (err) {
      toast.erro('Erro ao enviar mensagem: ' + err.message)
    } finally {
      setEnviando(false)
    }
  }

  const statusCfg = getStatusSeparacaoConfig(solicitacao.status)
  const itens = solicitacao.itens ?? []
  const todosMarcados = itens.length > 0 && itens.every((i) => i.separado)

  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/separador/painel')} style={{ marginBottom: 12 }}>
        ← Painel
      </button>

      <div className="pedido-detalhe-secao">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="page-titulo" style={{ marginBottom: 0 }}>{solicitacao.pedidos?.protocolo}</h1>
          <span className="status-badge status-badge--md" style={{ color: statusCfg.cor, backgroundColor: statusCfg.bg, borderColor: statusCfg.borda }}>
            {statusCfg.icone} {statusCfg.label}
          </span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6 }}>
          <div>{solicitacao.pedidos?.clientes?.nome ?? '—'} · {formatPhone(solicitacao.pedidos?.clientes?.telefone)}</div>
          <div>{formatCurrency(solicitacao.pedidos?.valor_total)}</div>
          {solicitacao.horario_retirada && <div>Retirada: {formatDate(solicitacao.horario_retirada)}</div>}
          {solicitacao.observacao && <div style={{ marginTop: 6 }}><strong>Observação:</strong> {solicitacao.observacao}</div>}
        </div>
      </div>

      {solicitacao.status === 'pendente' && (
        <button className="btn btn-primary" style={{ width: '100%', marginBottom: 16 }} onClick={handleAssumir}>
          Assumir Solicitação
        </button>
      )}

      {solicitacao.status !== 'pendente' && (
        <>
          <div className="pedido-detalhe-secao">
            <div className="pedido-detalhe-titulo">Checklist ({itens.filter((i) => i.separado).length}/{itens.length})</div>
            {itens.map((item) => (
              <label
                key={item.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-1)' }}
              >
                <input
                  type="checkbox"
                  checked={item.separado}
                  disabled={solicitacao.status !== 'em_andamento'}
                  onChange={() => handleToggleItem(item)}
                  style={{ width: 20, height: 20 }}
                />
                <span style={{ flex: 1, textDecoration: item.separado ? 'line-through' : 'none', color: item.separado ? 'var(--text-2)' : 'inherit' }}>
                  {item.itens_pedido?.nome_item}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>x{item.itens_pedido?.quantidade}</span>
              </label>
            ))}
          </div>

          {solicitacao.status === 'em_andamento' && (
            <button
              className="btn btn-success"
              style={{ width: '100%', marginTop: 12, marginBottom: 20 }}
              disabled={!todosMarcados || concluindo}
              onClick={handleConcluir}
            >
              {concluindo ? 'Concluindo...' : '✓ Separação Pronta'}
            </button>
          )}

          <div className="pedido-detalhe-secao">
            <div className="pedido-detalhe-titulo">Chat com o Operador</div>
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {mensagens.length === 0 ? (
                <p className="texto-vazio">Nenhuma mensagem ainda</p>
              ) : (
                mensagens.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: m.autor_tipo === 'separador' ? 'flex-end' : 'flex-start',
                      background: m.autor_tipo === 'separador' ? 'var(--accent-purple-bg, rgba(139,92,246,0.15))' : 'var(--bg-hover)',
                      borderRadius: 8,
                      padding: '6px 10px',
                      maxWidth: '80%',
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 2 }}>
                      {m.autor_tipo === 'operador' ? (m.autor_operador?.nome ?? 'Operador') : (m.autor_funcionario?.nome ?? 'Você')}
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
        </>
      )}
    </div>
  )
}
