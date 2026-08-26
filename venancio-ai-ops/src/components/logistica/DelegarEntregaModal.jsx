import { useState, useEffect } from 'react'
import { usePedidoBuscaRapida } from '@/hooks/usePedidoBuscaRapida'
import { pedidosService } from '@/services/pedidos.service'
import { funcionariosService } from '@/services/funcionarios.service'
import { entregaService } from '@/services/entrega.service'
import { useToast } from '@/contexts/AppContext'
import { formatCurrency, formatPhone, formatEntrega } from '@/utils/formatters'

/**
 * Delegar entrega a um Entregador — a partir de um pedido existente (busca
 * por protocolo/cliente/telefone, mesmo hook do DelegarSeparacaoModal).
 * `delegar_entrega` só aceita pedidos com forma_entrega='entrega_propria' —
 * a busca não filtra isso no client (a RPC é a fonte de verdade), mas o
 * formulário avisa e bloqueia o envio pra evitar uma chamada fadada ao erro.
 */
export function DelegarEntregaModal({ pedidoIdInicial = null, onFechar, onDelegado }) {
  const { toast } = useToast()
  const { resultados, buscando, buscar, limpar } = usePedidoBuscaRapida()
  const [termo, setTermo] = useState('')
  const [pedido, setPedido] = useState(null)
  const [carregandoPedido, setCarregandoPedido] = useState(!!pedidoIdInicial)
  const [entregadores, setEntregadores] = useState([])
  const [entregadorId, setEntregadorId] = useState('')
  const [horarioPrevisto, setHorarioPrevisto] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    funcionariosService.listarPorPapel('entrega').then(setEntregadores).catch(() => setEntregadores([]))
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

  const pedidoElegivel = pedido?.forma_entrega === 'entrega_propria'

  async function handleSalvar() {
    if (!pedido) return toast.aviso('Escolha um pedido.')
    if (!pedidoElegivel) return toast.aviso('Este pedido não é de entrega própria.')
    if (!entregadorId) return toast.aviso('Escolha um entregador.')

    setSalvando(true)
    try {
      await entregaService.delegar({
        pedidoId: pedido.id,
        entregadorId,
        horarioPrevisto: horarioPrevisto ? new Date(horarioPrevisto).toISOString() : null,
      })
      toast.sucesso('Entrega delegada.')
      onDelegado?.()
      onFechar()
    } catch (err) {
      toast.erro('Erro ao delegar entrega: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  const itensCount = pedido?.itens_pedido?.length ?? 0

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal modal--medio">
        <div className="modal-header">
          <h2 className="modal-titulo">Delegar Entrega</h2>
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
                      {itensCount} {itensCount === 1 ? 'item' : 'itens'} · {formatCurrency(pedido.valor_total)} · {formatEntrega(pedido.forma_entrega)}
                    </div>
                    {pedido.endereco_entrega && (
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{pedido.endereco_entrega}</div>
                    )}
                  </div>
                  {!pedidoIdInicial && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setPedido(null)}>Trocar</button>
                  )}
                </div>
                {!pedidoElegivel && (
                  <p className="form-hint" style={{ color: 'var(--danger)', marginTop: 8 }}>
                    ⚠️ Este pedido é "{formatEntrega(pedido.forma_entrega)}" — delegar_entrega só aceita pedidos de entrega própria.
                  </p>
                )}
              </div>

              {pedidoElegivel && (
                <div className="form-grid form-grid--2">
                  <div className="form-grupo">
                    <label className="form-label">Entregador *</label>
                    <select className="input" value={entregadorId} onChange={(e) => setEntregadorId(e.target.value)}>
                      <option value="">— Selecionar —</option>
                      {entregadores.map((f) => (
                        <option key={f.id} value={f.id}>{f.nome}</option>
                      ))}
                    </select>
                    {entregadores.length === 0 && (
                      <p className="form-hint">Nenhum entregador ativo cadastrado — ver página Funcionários.</p>
                    )}
                  </div>

                  <div className="form-grupo">
                    <label className="form-label">Horário previsto</label>
                    <input
                      type="datetime-local"
                      className="input"
                      value={horarioPrevisto}
                      onChange={(e) => setHorarioPrevisto(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSalvar} disabled={salvando || !pedido || !pedidoElegivel}>
            {salvando ? 'Delegando...' : '✓ Delegar Entrega'}
          </button>
        </div>
      </div>
    </div>
  )
}
