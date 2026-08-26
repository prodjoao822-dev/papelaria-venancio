import { useState, useEffect } from 'react'
import { usePedidoBuscaRapida } from '@/hooks/usePedidoBuscaRapida'
import { pedidosService } from '@/services/pedidos.service'
import { ocorrenciasService } from '@/services/ocorrencias.service'
import { useToast } from '@/contexts/AppContext'
import { TIPOS_OCORRENCIA } from '@/utils/ocorrencias'
import { formatCurrency, formatPhone } from '@/utils/formatters'

/**
 * Abrir uma ocorrência ligada a um pedido — mesmo padrão de busca de
 * DelegarSeparacaoModal/DelegarEntregaModal. O caso mais importante
 * (Requisitos_Addendum_Entrega_Ocorrencia.md) é pós-venda: cliente retorna
 * à loja para troca/devolução/produto errado, o Operador busca o pedido
 * dele e abre a ocorrência contra o histórico real.
 * Se `pedidoIdInicial` for passado (ex: aberto de dentro do detalhe do
 * pedido), pula direto pro formulário.
 */
export function AbrirOcorrenciaModal({ pedidoIdInicial = null, onFechar, onCriada }) {
  const { toast } = useToast()
  const { resultados, buscando, buscar, limpar } = usePedidoBuscaRapida()
  const [termo, setTermo] = useState('')
  const [pedido, setPedido] = useState(null)
  const [carregandoPedido, setCarregandoPedido] = useState(!!pedidoIdInicial)
  const [tipo, setTipo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)

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
    if (!tipo) return toast.aviso('Escolha o tipo de ocorrência.')
    if (!descricao.trim()) return toast.aviso('Descreva a ocorrência.')

    setSalvando(true)
    try {
      await ocorrenciasService.abrir({
        pedidoId: pedido.id,
        tipo,
        descricao: descricao.trim(),
      })
      toast.sucesso('Ocorrência aberta.')
      onCriada?.()
      onFechar()
    } catch (err) {
      toast.erro('Erro ao abrir ocorrência: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  const itensCount = pedido?.itens_pedido?.length ?? 0

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal modal--medio">
        <div className="modal-header">
          <h2 className="modal-titulo">Abrir Ocorrência</h2>
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
                <div className="form-grupo form-grupo--full">
                  <label className="form-label">Tipo *</label>
                  <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                    <option value="">— Selecionar —</option>
                    <optgroup label="Operacional">
                      {TIPOS_OCORRENCIA.filter((t) => t.grupo === 'operacional').map((t) => (
                        <option key={t.value} value={t.value}>{t.icone} {t.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Pós-venda">
                      {TIPOS_OCORRENCIA.filter((t) => t.grupo === 'pos_venda').map((t) => (
                        <option key={t.value} value={t.value}>{t.icone} {t.label}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div className="form-grupo form-grupo--full">
                  <label className="form-label">Descrição *</label>
                  <textarea
                    className="input input-textarea"
                    rows={4}
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    placeholder="O que aconteceu..."
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSalvar} disabled={salvando || !pedido}>
            {salvando ? 'Abrindo...' : '✓ Abrir Ocorrência'}
          </button>
        </div>
      </div>
    </div>
  )
}
