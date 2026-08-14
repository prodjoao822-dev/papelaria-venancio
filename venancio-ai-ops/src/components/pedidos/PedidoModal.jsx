import { useState, useEffect, useCallback } from 'react'
import { pedidosService, mapStatusRealParaDashboard } from '@/services/pedidos.service'
import { funcionariosService } from '@/services/funcionarios.service'
import { StatusBadge } from './StatusBadge'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import {
  formatCurrency,
  formatDateTime,
  formatPhone,
  formatEntrega,
} from '@/utils/formatters'
import { getStatusConfig } from '@/utils/status'
import { OPERACOES_SHOPCONTROL } from '@/utils/constants'
import { useToast } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'

// ── Responsáveis + Sequência ShopControl ───────────────────────────────────────
function ResponsaveisSequencia({ pedido, onAtualizar }) {
  const [funcSeparacao, setFuncSeparacao] = useState([])
  const [funcEntrega, setFuncEntrega] = useState([])
  const [sequencia, setSequencia] = useState(pedido.sequencia ?? '')
  const [operacao, setOperacao] = useState(pedido.operacao ?? '')
  const [salvandoSeq, setSalvandoSeq] = useState(false)
  const { toast } = useToast()
  const { operador } = useAuth()

  useEffect(() => {
    setSequencia(pedido.sequencia ?? '')
    setOperacao(pedido.operacao ?? '')
  }, [pedido.id, pedido.sequencia, pedido.operacao])

  useEffect(() => {
    Promise.all([
      funcionariosService.listarPorPapel('separacao'),
      funcionariosService.listarPorPapel('entrega'),
    ])
      .then(([sep, ent]) => { setFuncSeparacao(sep); setFuncEntrega(ent) })
      .catch((err) => toast.erro('Erro ao carregar funcionários: ' + err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleResponsavel(tipo, funcionarioId) {
    try {
      await pedidosService.atribuirResponsavel(pedido.id, tipo, funcionarioId || null, operador?.id ?? null)
      toast.sucesso('Responsável atualizado.')
      onAtualizar?.()
    } catch (err) {
      toast.erro('Erro ao atribuir responsável: ' + err.message)
    }
  }

  async function handleSalvarSequencia() {
    setSalvandoSeq(true)
    try {
      await pedidosService.atualizarSequencia(pedido.id, {
        sequencia: sequencia.trim() || null,
        operacao: operacao || null,
      })
      toast.sucesso('Sequência atualizada.')
      onAtualizar?.()
    } catch (err) {
      toast.erro('Erro ao salvar sequência: ' + err.message)
    } finally {
      setSalvandoSeq(false)
    }
  }

  return (
    <>
      <section className="pedido-detalhe-secao">
        <h3 className="pedido-detalhe-titulo">Responsáveis</h3>
        <div className="pedido-detalhe-grid">
          <div className="pedido-detalhe-campo">
            <span className="campo-label">Separação</span>
            <select
              className="input input-sm"
              value={pedido.responsavel_separacao?.id ?? ''}
              onChange={(e) => handleResponsavel('separacao', e.target.value)}
            >
              <option value="">— Selecionar —</option>
              {funcSeparacao.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>
          <div className="pedido-detalhe-campo">
            <span className="campo-label">Entrega</span>
            <select
              className="input input-sm"
              value={pedido.responsavel_entrega?.id ?? ''}
              onChange={(e) => handleResponsavel('entrega', e.target.value)}
              disabled={pedido.forma_entrega === 'retirada'}
            >
              <option value="">— Selecionar —</option>
              {funcEntrega.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="pedido-detalhe-secao">
        <h3 className="pedido-detalhe-titulo">Sequência ShopControl</h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="pedido-detalhe-campo">
            <span className="campo-label">Sequência</span>
            <input
              className="input input-sm"
              value={sequencia}
              onChange={(e) => setSequencia(e.target.value)}
              placeholder="Ex: SC-10475"
            />
          </div>
          <div className="pedido-detalhe-campo">
            <span className="campo-label">Operação</span>
            <select
              className="input input-sm"
              value={operacao}
              onChange={(e) => setOperacao(e.target.value)}
            >
              <option value="">—</option>
              {OPERACOES_SHOPCONTROL.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleSalvarSequencia} disabled={salvandoSeq}>
            {salvandoSeq ? '...' : 'Salvar'}
          </button>
        </div>
      </section>
    </>
  )
}

// ── Checklist de separação ────────────────────────────────────────────────────
function ChecklistSeparacao({ pedido, onAtualizar }) {
  const [itens, setItens] = useState(pedido?.itens_pedido ?? [])
  const [marcandoTodos, setMarcandoTodos] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    setItens(pedido?.itens_pedido ?? [])
  }, [pedido])

  const separados = itens.filter((i) => i.separado).length
  const total = itens.length
  const progresso = total > 0 ? Math.round((separados / total) * 100) : 0
  const tudoSeparado = separados === total && total > 0

  async function handleToggle(item) {
    const novoValor = !item.separado
    // Atualiza otimisticamente
    setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, separado: novoValor } : i)))
    try {
      await pedidosService.marcarItemSeparado(item.id, novoValor)
      onAtualizar?.()
    } catch (e) {
      // Reverte em caso de erro
      setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, separado: item.separado } : i)))
      toast.erro('Erro ao atualizar item: ' + e.message)
    }
  }

  async function handleMarcarTodos() {
    setMarcandoTodos(true)
    setItens((prev) => prev.map((i) => ({ ...i, separado: true })))
    try {
      await pedidosService.marcarTodosItens(pedido.id, true)
      toast.sucesso('Todos os itens marcados como separados!')
      onAtualizar?.()
    } catch (e) {
      toast.erro('Erro: ' + e.message)
    } finally {
      setMarcandoTodos(false)
    }
  }

  if (total === 0) return null

  return (
    <div className="checklist-separacao">
      {/* Header com progresso */}
      <div className="checklist-header">
        <div className="checklist-progresso-info">
          <span className="checklist-progresso-label">
            {separados}/{total} itens separados
          </span>
          {tudoSeparado && (
            <span className="checklist-tudo-ok">✅ Tudo separado!</span>
          )}
        </div>
        <div className="checklist-progresso-barra">
          <div
            className="checklist-progresso-fill"
            style={{
              width: `${progresso}%`,
              background: tudoSeparado ? 'var(--success)' : 'var(--warning)',
            }}
          />
        </div>
        {!tudoSeparado && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleMarcarTodos}
            disabled={marcandoTodos}
            style={{ marginTop: 8 }}
          >
            {marcandoTodos ? '...' : '✓ Marcar Todos'}
          </button>
        )}
      </div>

      {/* Lista de itens */}
      <div className="checklist-lista">
        {itens.map((item) => (
          <label
            key={item.id}
            className={`checklist-item ${item.separado ? 'checklist-item--separado' : ''}`}
          >
            <input
              type="checkbox"
              className="checklist-checkbox"
              checked={item.separado ?? false}
              onChange={() => handleToggle(item)}
            />
            <div className="checklist-item-info">
              <span className="checklist-item-qtd">{item.quantidade}×</span>
              <span className="checklist-item-nome">{item.nome_item}</span>
            </div>
            <span className="checklist-item-preco">
              {formatCurrency(item.quantidade * item.valor_unitario)}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

export function PedidoModal({ pedidoId, onFechar, onStatusAtualizado }) {
  const [pedido, setPedido] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [observacao, setObservacao] = useState('')
  const { toast } = useToast()
  const { operador } = useAuth()

  const carregar = useCallback(() => {
    if (!pedidoId) return
    setCarregando(true)
    pedidosService
      .buscarPorId(pedidoId)
      .then(setPedido)
      .catch((err) => toast.erro('Erro ao carregar pedido: ' + err.message))
      .finally(() => setCarregando(false))
  }, [pedidoId, toast])

  useEffect(() => { carregar() }, [carregar])

  async function handleAtualizarStatus(novoStatus) {
    setAtualizando(true)
    try {
      const atualizado = await pedidosService.atualizarStatus(
        pedido.id,
        novoStatus,
        operador?.id ?? null,
        observacao || null
      )
      setPedido((prev) => ({ ...prev, status: atualizado.status }))
      onStatusAtualizado?.(atualizado)
      toast.sucesso(`Pedido atualizado para "${getStatusConfig(novoStatus).label}"`)
      setObservacao('')
    } catch (err) {
      toast.erro('Erro ao atualizar status: ' + err.message)
    } finally {
      setAtualizando(false)
    }
  }

  if (!pedidoId) return null

  const cfg = pedido ? getStatusConfig(pedido.status) : null

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal modal--grande" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-esquerda">
            <h2 className="modal-titulo">
              {pedido ? pedido.protocolo : 'Pedido'}
            </h2>
            {pedido && <StatusBadge status={pedido.status} />}
          </div>
          <button className="modal-fechar" onClick={onFechar} aria-label="Fechar">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {carregando ? (
            <LoadingSpinner mensagem="Carregando pedido..." />
          ) : !pedido ? (
            <p>Pedido não encontrado.</p>
          ) : (
            <div className="pedido-detalhe">
              {/* Dados do cliente */}
              <section className="pedido-detalhe-secao">
                <h3 className="pedido-detalhe-titulo">Cliente</h3>
                <div className="pedido-detalhe-grid">
                  <div className="pedido-detalhe-campo">
                    <span className="campo-label">Nome</span>
                    <span className="campo-valor">
                      {pedido.clientes?.nome ?? '—'}
                    </span>
                  </div>
                  <div className="pedido-detalhe-campo">
                    <span className="campo-label">Telefone</span>
                    <span className="campo-valor">
                      {formatPhone(pedido.clientes?.telefone)}
                    </span>
                  </div>
                  <div className="pedido-detalhe-campo">
                    <span className="campo-label">Data/Hora</span>
                    <span className="campo-valor">
                      {formatDateTime(pedido.criado_em)}
                    </span>
                  </div>
                  <div className="pedido-detalhe-campo">
                    <span className="campo-label">Entrega</span>
                    <span className="campo-valor">
                      {formatEntrega(pedido.forma_entrega)}
                    </span>
                  </div>
                  {pedido.endereco_entrega && (
                    <div className="pedido-detalhe-campo pedido-detalhe-campo--full">
                      <span className="campo-label">Endereço</span>
                      <span className="campo-valor">{pedido.endereco_entrega}</span>
                    </div>
                  )}
                  {pedido.observacoes && (
                    <div className="pedido-detalhe-campo pedido-detalhe-campo--full">
                      <span className="campo-label">Observações</span>
                      <span className="campo-valor campo-valor--destaque">
                        {pedido.observacoes}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              <ResponsaveisSequencia pedido={pedido} onAtualizar={carregar} />

              {/* Itens */}
              <section className="pedido-detalhe-secao">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h3 className="pedido-detalhe-titulo" style={{ marginBottom: 0 }}>
                    Itens ({pedido.itens_pedido?.length ?? 0})
                  </h3>
                  {pedido.itens_pedido?.length > 0 && (
                    <span className="campo-valor" style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>
                      {formatCurrency(pedido.valor_total)}
                    </span>
                  )}
                </div>
                {pedido.itens_pedido?.length > 0 ? (
                  <div className="itens-lista">
                    {pedido.itens_pedido.map((item) => (
                      <div key={item.id} className="item-linha">
                        <span className="item-qtd">{item.quantidade}x</span>
                        <span className="item-nome">{item.nome_item}</span>
                        <span className="item-preco">
                          {formatCurrency(item.valor_unitario)}
                        </span>
                        <span className="item-subtotal">
                          {formatCurrency(item.quantidade * item.valor_unitario)}
                        </span>
                      </div>
                    ))}
                    <div className="itens-total">
                      <span>Total</span>
                      <span className="itens-total-valor">
                        {formatCurrency(pedido.valor_total)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="texto-vazio">Nenhum item registrado</p>
                )}
              </section>

              {/* Checklist de Separação */}
              {['EM_SEPARACAO', 'SEPARADO'].includes(pedido.status) &&
                pedido.itens_pedido?.length > 0 && (
                  <section className="pedido-detalhe-secao">
                    <h3 className="pedido-detalhe-titulo">Checklist de Separação</h3>
                    <ChecklistSeparacao pedido={pedido} onAtualizar={carregar} />
                  </section>
                )}

              {/* Histórico */}
              {pedido.pedidos_status_historico?.length > 0 && (
                <section className="pedido-detalhe-secao">
                  <h3 className="pedido-detalhe-titulo">Histórico</h3>
                  <div className="historico-lista">
                    {pedido.pedidos_status_historico.map((h) => {
                      const cfgNovo = getStatusConfig(mapStatusRealParaDashboard(h.status_novo))
                      return (
                        <div key={h.id} className="historico-item">
                          <span
                            className="historico-dot"
                            style={{ backgroundColor: cfgNovo.cor }}
                          />
                          <div className="historico-info">
                            <span className="historico-status">{cfgNovo.label}</span>
                            {h.observacao && (
                              <span className="historico-obs">{h.observacao}</span>
                            )}
                            <span className="historico-tempo">
                              {formatDateTime(h.criado_em)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Ações de status */}
              {cfg.acoes.length > 0 && (
                <section className="pedido-detalhe-secao">
                  <h3 className="pedido-detalhe-titulo">Atualizar Status</h3>
                  <div className="status-acoes">
                    <textarea
                      className="input input-textarea"
                      placeholder="Observação (opcional)..."
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                      rows={2}
                    />
                    <div className="status-acoes-btns">
                      {cfg.acoes.map((acao) => (
                        <button
                          key={acao.status}
                          className={`btn ${acao.perigo ? 'btn-danger' : 'btn-primary'}`}
                          onClick={() => handleAtualizarStatus(acao.status)}
                          disabled={atualizando}
                        >
                          {atualizando ? '...' : acao.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
