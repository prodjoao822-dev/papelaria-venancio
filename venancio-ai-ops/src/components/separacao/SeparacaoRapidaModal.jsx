import { useState } from 'react'
import { usePedidoBuscaRapida } from '@/hooks/usePedidoBuscaRapida'
import { pedidosService } from '@/services/pedidos.service'
import { separacaoService } from '@/services/separacao.service'
import { useToast } from '@/contexts/AppContext'
import { formatCurrency, formatPhone } from '@/utils/formatters'

const LIMITE_ITENS = 7

/**
 * Separação Rápida (RN-01) — operador separa ele mesmo, autoatribuído.
 * Fluxo deliberadamente diferente do DelegarSeparacaoModal (cor de destaque
 * "warning", copy própria) pra nunca ser confundido com o caminho padrão —
 * ver PROMPT_IMPLEMENTACAO_SEPARACAO.md: "fluxo visualmente diferenciado,
 * não o caminho padrão". Limitado a pedidos com até 7 itens (também
 * validado no servidor pela RPC separacao_rapida).
 */
export function SeparacaoRapidaModal({ onFechar, onIniciada }) {
  const { toast } = useToast()
  const { resultados, buscando, buscar, limpar } = usePedidoBuscaRapida()
  const [termo, setTermo] = useState('')
  const [pedido, setPedido] = useState(null)
  const [carregandoPedido, setCarregandoPedido] = useState(false)
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)

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

  const itensCount = pedido?.itens_pedido?.length ?? 0
  const excedeLimite = itensCount > LIMITE_ITENS

  async function handleIniciar() {
    if (!pedido) return toast.aviso('Escolha um pedido.')
    if (excedeLimite) return toast.aviso(`Separação Rápida é só para pedidos com até ${LIMITE_ITENS} itens.`)

    setSalvando(true)
    try {
      const solicitacao = await separacaoService.separacaoRapida({
        pedidoId: pedido.id,
        observacao: observacao.trim() || null,
      })
      toast.sucesso('Separação rápida iniciada — já está em andamento.')
      onIniciada?.(solicitacao)
      onFechar()
    } catch (err) {
      toast.erro('Erro ao iniciar separação rápida: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal modal--pequeno" style={{ borderTop: '3px solid #FB923C' }}>
        <div className="modal-header">
          <h2 className="modal-titulo">⚡ Separação Rápida</h2>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>

        <div className="modal-body">
          <p className="modal-descricao">
            Você mesmo separa agora — sem delegar a ninguém. Só pra pedidos pequenos
            (até {LIMITE_ITENS} itens), prioridade sempre imediata.
          </p>

          {!pedido ? (
            <div className="form-grupo">
              <label className="form-label">Pedido *</label>
              <input
                className="input"
                autoFocus
                placeholder="Buscar por nº, cliente ou telefone..."
                value={termo}
                onChange={(e) => { setTermo(e.target.value); buscar(e.target.value) }}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{pedido.protocolo}</strong> — {pedido.clientes?.nome ?? '—'}
                    <div style={{ fontSize: 13, color: excedeLimite ? 'var(--danger)' : 'var(--text-2)' }}>
                      {itensCount} {itensCount === 1 ? 'item' : 'itens'}
                      {excedeLimite && ` — excede o limite de ${LIMITE_ITENS}`}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPedido(null)}>Trocar</button>
                </div>
              </div>

              <div className="form-grupo">
                <label className="form-label">Observação</label>
                <textarea
                  className="input input-textarea"
                  rows={2}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className="btn btn-warning" onClick={handleIniciar} disabled={salvando || !pedido || excedeLimite}>
            {salvando ? 'Iniciando...' : '⚡ Iniciar Agora'}
          </button>
        </div>
      </div>
    </div>
  )
}
