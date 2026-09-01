import { useState, useEffect } from 'react'
import { funcionariosService } from '@/services/funcionarios.service'
import { tarefasService } from '@/services/tarefas.service'
import { usePedidoBuscaRapida } from '@/hooks/usePedidoBuscaRapida'
import { useToast } from '@/contexts/AppContext'
import { formatCurrency, formatPhone } from '@/utils/formatters'

/**
 * Criar tarefa agendada (RF-03, tela 23 do design). Pedido é opcional —
 * mesmo padrão de busca do AbrirOcorrenciaModal, mas skippável: a maioria
 * das tarefas ("organizar prateleira", "conferir estoque") não tem pedido.
 */
export function NovaTarefaModal({ onFechar, onCriada }) {
  const { toast } = useToast()
  const { resultados, buscando, buscar, limpar } = usePedidoBuscaRapida()

  const [funcionarios, setFuncionarios] = useState([])
  const [responsavelId, setResponsavelId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [dataExecucao, setDataExecucao] = useState('')
  const [vincularPedido, setVincularPedido] = useState(false)
  const [pedido, setPedido] = useState(null)
  const [termoPedido, setTermoPedido] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    funcionariosService.listar({ ativo: true })
      .then(setFuncionarios)
      .catch((err) => toast.erro('Erro ao carregar funcionários: ' + err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleTermoPedido(valor) {
    setTermoPedido(valor)
    buscar(valor)
  }

  function selecionarPedido(resumo) {
    setPedido(resumo)
    setTermoPedido('')
    limpar()
  }

  async function handleSalvar() {
    if (!responsavelId) return toast.aviso('Escolha o responsável.')
    if (!descricao.trim()) return toast.aviso('Descreva a tarefa.')
    if (!dataExecucao) return toast.aviso('Informe a data/hora de execução.')
    if (vincularPedido && !pedido) return toast.aviso('Escolha um pedido ou desmarque "Vincular a um pedido".')

    setSalvando(true)
    try {
      await tarefasService.criar({
        responsavelId,
        descricao: descricao.trim(),
        dataExecucao: new Date(dataExecucao).toISOString(),
        pedidoId: vincularPedido ? pedido.id : null,
      })
      toast.sucesso('Tarefa criada.')
      onCriada?.()
      onFechar()
    } catch (err) {
      toast.erro('Erro ao criar tarefa: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal modal--medio">
        <div className="modal-header">
          <h2 className="modal-titulo">Nova Tarefa</h2>
          <button className="modal-fechar" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        <div className="modal-body">
          <div className="form-grid form-grid--2">
            <div className="form-grupo">
              <label className="form-label">Responsável *</label>
              <select
                className="input"
                value={responsavelId}
                onChange={(e) => setResponsavelId(e.target.value)}
              >
                <option value="">— Selecionar —</option>
                {funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>
            <div className="form-grupo">
              <label className="form-label">Data/Hora de Execução *</label>
              <input
                type="datetime-local"
                className="input"
                value={dataExecucao}
                onChange={(e) => setDataExecucao(e.target.value)}
              />
            </div>
            <div className="form-grupo form-grupo--full">
              <label className="form-label">Descrição *</label>
              <textarea
                className="input input-textarea"
                rows={3}
                placeholder="Ex: Organizar prateleira de canetas"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>

            <div className="form-grupo form-grupo--full">
              <label className="form-label-check">
                <input
                  type="checkbox"
                  checked={vincularPedido}
                  onChange={(e) => { setVincularPedido(e.target.checked); if (!e.target.checked) setPedido(null) }}
                />
                Vincular a um pedido (opcional)
              </label>
            </div>

            {vincularPedido && (
              <div className="form-grupo form-grupo--full">
                {!pedido ? (
                  <>
                    <input
                      className="input"
                      placeholder="Buscar pedido por nº, cliente ou telefone..."
                      value={termoPedido}
                      onChange={(e) => handleTermoPedido(e.target.value)}
                    />
                    {termoPedido.trim().length >= 2 && (
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
                  </>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{pedido.protocolo}</strong> — {pedido.clientes?.nome ?? '—'}
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setPedido(null)}>Trocar</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSalvar} disabled={salvando}>
            {salvando ? 'Salvando...' : '✓ Criar Tarefa'}
          </button>
        </div>
      </div>
    </div>
  )
}
