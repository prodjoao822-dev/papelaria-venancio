import { useState, useEffect } from 'react'
import { usePedidoBuscaRapida } from '@/hooks/usePedidoBuscaRapida'
import { pedidosService } from '@/services/pedidos.service'
import { funcionariosService } from '@/services/funcionarios.service'
import { separacaoService } from '@/services/separacao.service'
import { useToast } from '@/contexts/AppContext'
import { formatCurrency, formatPhone } from '@/utils/formatters'

/**
 * Delegar separação a um Separador — a partir de um pedido existente
 * (busca por protocolo/cliente/telefone, mesmo hook do BuscaPedidoGlobal).
 * Se `pedidoIdInicial` for passado, pula direto pra escolha de separador.
 */
export function DelegarSeparacaoModal({ pedidoIdInicial = null, onFechar, onDelegado }) {
  const { toast } = useToast()
  const { resultados, buscando, buscar, limpar } = usePedidoBuscaRapida()
  const [termo, setTermo] = useState('')
  const [pedido, setPedido] = useState(null)
  const [carregandoPedido, setCarregandoPedido] = useState(!!pedidoIdInicial)
  const [separadores, setSeparadores] = useState([])
  const [separadorId, setSeparadorId] = useState('')
  const [prioridade, setPrioridade] = useState('imediata')
  const [horarioRetirada, setHorarioRetirada] = useState('')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    funcionariosService.listarPorPapel('separacao').then(setSeparadores).catch(() => setSeparadores([]))
  }, [])

  useEffect(() => {
    if (!pedidoIdInicial) return
    pedidosService.buscarPorId(pedidoIdInicial)
      .then(setPedido)
      .catch((err) => toast.erro('Erro ao carregar pedido: ' + err.message))
      .finally(() => setCarregandoPedido(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoIdInicial])

  async function selecionarPedido(resumo) {
    setCarregandoPedido(true)
    try {
      const completo = await pedidosService.buscarPorId(resumo.id)
      setPedido(completo)
    } catch (err) {
      toast.erro('Erro ao carregar pedido: ' + err.message)
    } finally {
      setCarregandoPedido(false)
      setTermo('')
      limpar()
    }
  }

  async function handleSalvar() {
    if (!pedido) return toast.aviso('Escolha um pedido.')
    if (!separadorId) return toast.aviso('Escolha um separador.')
    if (prioridade === 'agendada' && !horarioRetirada) {
      return toast.aviso('Informe o horário de retirada para prioridade agendada.')
    }

    setSalvando(true)
    try {
      await separacaoService.delegar({
        pedidoId: pedido.id,
        separadorId,
        prioridade,
        horarioRetirada: prioridade === 'agendada' ? new Date(horarioRetirada).toISOString() : null,
        observacao: observacao.trim() || null,
      })
      toast.sucesso('Separação delegada.')
      onDelegado?.()
      onFechar()
    } catch (err) {
      toast.erro('Erro ao delegar separação: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  const itensCount = pedido?.itens_pedido?.length ?? 0

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal modal--medio">
        <div className="modal-header">
          <h2 className="modal-titulo">Delegar Separação</h2>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>

        <div className="modal-body">
          {!pedido ? (
            <div className="form-grupo">
              <label className="form-label">Pedido *</label>
              <input
                className="input"
                autoFocus
                placeholder="Buscar por nº, cliente ou telefone..."
                value={termo}
                onChange={(e) => {
                  setTermo(e.target.value)
                  buscar(e.target.value)
                }}
              />
              {carregandoPedido ? (
                <div className="produto-autocomplete-vazio" style={{ marginTop: 8 }}>Carregando pedido...</div>
              ) : termo.trim().length >= 2 && (
                <div style={{ marginTop: 8 }}>
                  {buscando ? (
                    <div className="produto-autocomplete-vazio">Buscando…</div>
                  ) : resultados.length === 0 ? (
                    <div className="produto-autocomplete-vazio">Nenhum pedido encontrado</div>
                  ) : (
                    resultados.map((p) => (
                      <div
                        key={p.id}
                        className="header-search-item"
                        style={{ cursor: 'pointer', border: '1px solid var(--border-1)', borderRadius: 6, marginBottom: 4, padding: 8 }}
                        onClick={() => selecionarPedido(p)}
                      >
                        <div className="header-search-item-linha1">
                          <span className="header-search-item-protocolo">{p.protocolo}</span>
                        </div>
                        <div className="header-search-item-linha2">
                          <span>{p.clientes?.nome ?? '—'}</span>
                          <span>{formatPhone(p.clientes?.telefone)}</span>
                          <span className="header-search-item-valor">{formatCurrency(p.valor_total)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="pedido-detalhe-secao">
                <div className="pedido-detalhe-titulo">Pedido</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{pedido.protocolo}</strong> — {pedido.clientes?.nome ?? '—'}
                    <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                      {itensCount} {itensCount === 1 ? 'item' : 'itens'} · {formatCurrency(pedido.valor_total)}
                    </div>
                  </div>
                  {!pedidoIdInicial && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setPedido(null)}>Trocar</button>
                  )}
                </div>
              </div>

              <div className="form-grid form-grid--2">
                <div className="form-grupo">
                  <label className="form-label">Separador *</label>
                  <select className="input" value={separadorId} onChange={(e) => setSeparadorId(e.target.value)}>
                    <option value="">— Selecionar —</option>
                    {separadores.map((f) => (
                      <option key={f.id} value={f.id}>{f.nome}</option>
                    ))}
                  </select>
                  {separadores.length === 0 && (
                    <p className="form-hint">Nenhum separador ativo cadastrado — ver página Funcionários.</p>
                  )}
                </div>

                <div className="form-grupo">
                  <label className="form-label">Prioridade *</label>
                  <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                    <label className="form-label-check">
                      <input type="radio" name="prioridade" checked={prioridade === 'imediata'} onChange={() => setPrioridade('imediata')} />
                      ⚡ Imediata
                    </label>
                    <label className="form-label-check">
                      <input type="radio" name="prioridade" checked={prioridade === 'agendada'} onChange={() => setPrioridade('agendada')} />
                      🗓️ Agendada
                    </label>
                  </div>
                </div>

                {prioridade === 'agendada' && (
                  <div className="form-grupo form-grupo--full">
                    <label className="form-label">Horário de retirada *</label>
                    <input
                      type="datetime-local"
                      className="input"
                      value={horarioRetirada}
                      onChange={(e) => setHorarioRetirada(e.target.value)}
                    />
                  </div>
                )}

                <div className="form-grupo form-grupo--full">
                  <label className="form-label">Observação</label>
                  <textarea
                    className="input input-textarea"
                    rows={3}
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Opcional — instruções pro separador"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSalvar} disabled={salvando || !pedido}>
            {salvando ? 'Delegando...' : '✓ Delegar Separação'}
          </button>
        </div>
      </div>
    </div>
  )
}
