import { useState, useEffect, useCallback, useRef } from 'react'
import { pedidosService } from '@/services/pedidos.service'
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
import { OPERACOES_SHOPCONTROL, FORMAS_PAGAMENTO, STATUS_PAGAMENTO } from '@/utils/constants'
import { calcularProgressoChecklist } from '@/utils/checklistSeparacao'
import { criarSequenciadorDeRequisicoes } from '@/utils/requestSequencer'
import { useToast } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { AbrirOcorrenciaModal } from '@/components/ocorrencias/AbrirOcorrenciaModal'
import { TimelinePedido } from './TimelinePedido'

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

// datetime-local não aceita ISO com timezone/segundos — corta pro formato
// que o input espera (yyyy-MM-ddTHH:mm), em horário local do navegador.
function isoParaDatetimeLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Pagamento (RF-02) ──────────────────────────────────────────────────────────
function PagamentoPedido({ pedido, onAtualizar }) {
  const [formaPagamento, setFormaPagamento] = useState(pedido.forma_pagamento ?? '')
  const [statusPagamento, setStatusPagamento] = useState(pedido.status_pagamento ?? 'pendente')
  const [horarioPrevisto, setHorarioPrevisto] = useState(isoParaDatetimeLocal(pedido.horario_previsto))
  const [salvando, setSalvando] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    setFormaPagamento(pedido.forma_pagamento ?? '')
    setStatusPagamento(pedido.status_pagamento ?? 'pendente')
    setHorarioPrevisto(isoParaDatetimeLocal(pedido.horario_previsto))
  }, [pedido.id, pedido.forma_pagamento, pedido.status_pagamento, pedido.horario_previsto])

  async function handleSalvar() {
    setSalvando(true)
    try {
      await pedidosService.atualizarPagamento(pedido.id, {
        forma_pagamento: formaPagamento || null,
        status_pagamento: statusPagamento,
        horario_previsto: horarioPrevisto ? new Date(horarioPrevisto).toISOString() : null,
      })
      toast.sucesso('Pagamento atualizado.')
      onAtualizar?.()
    } catch (err) {
      toast.erro('Erro ao salvar pagamento: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="pedido-detalhe-secao">
      <h3 className="pedido-detalhe-titulo">Pagamento</h3>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="pedido-detalhe-campo">
          <span className="campo-label">Forma de Pagamento</span>
          <select
            className="input input-sm"
            value={formaPagamento}
            onChange={(e) => setFormaPagamento(e.target.value)}
          >
            <option value="">— Não informado —</option>
            {FORMAS_PAGAMENTO.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <div className="pedido-detalhe-campo">
          <span className="campo-label">Status</span>
          <select
            className="input input-sm"
            value={statusPagamento}
            onChange={(e) => setStatusPagamento(e.target.value)}
          >
            {STATUS_PAGAMENTO.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="pedido-detalhe-campo">
          <span className="campo-label">Horário Previsto</span>
          <input
            type="datetime-local"
            className="input input-sm"
            value={horarioPrevisto}
            onChange={(e) => setHorarioPrevisto(e.target.value)}
          />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={handleSalvar} disabled={salvando}>
          {salvando ? '...' : 'Salvar'}
        </button>
      </div>
    </section>
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

  // Ver utils/checklistSeparacao.js para o porquê do status_real entrar
  // nessa conta (bug real: checklist ficava "0/N" pra pedido já separado
  // via Separação Delegada/Rápida, que nunca toca em itens_pedido).
  const { total, separados, progresso, tudoSeparado, separacaoConfirmadaPeloStatus } =
    calcularProgressoChecklist(itens, pedido.status_real)

  async function handleToggle(item) {
    if (separacaoConfirmadaPeloStatus) return // checklist bloqueado — pedido já separado
    const novoValor = !item.separado
    // Atualiza otimisticamente — resposta visual imediata (< 100ms)
    // NÃO chamar onAtualizar() aqui: o pai faria carregar() que, ao retornar do
    // servidor, sobrescreveria este estado otimista via useEffect([pedido]),
    // causando um "flash" de estado antigo antes do verde aparecer.
    setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, separado: novoValor } : i)))
    try {
      await pedidosService.marcarItemSeparado(item.id, novoValor)
      // Não re-fetcha o pedido inteiro — o estado local já está correto
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
        {itens.map((item) => {
          const marcado = (item.separado ?? false) || separacaoConfirmadaPeloStatus
          return (
          <label
            key={item.id}
            className={`checklist-item ${marcado ? 'checklist-item--separado' : ''}`}
            title={separacaoConfirmadaPeloStatus ? 'Pedido já separado — checklist bloqueado' : undefined}
          >
            <input
              type="checkbox"
              className="checklist-checkbox"
              checked={marcado}
              disabled={separacaoConfirmadaPeloStatus}
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
          )
        })}
      </div>
    </div>
  )
}

export function PedidoModal({ pedidoId, onFechar, onStatusAtualizado }) {
  const [pedido, setPedido] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [observacao, setObservacao] = useState('')
  const [modalOcorrencia, setModalOcorrencia] = useState(false)
  const { toast } = useToast()
  const { operador } = useAuth()

  // Como as seções (Responsáveis, Sequência, Pagamento, Marcar Todos) chamam
  // onAtualizar() de forma independente, é possível disparar 2+ requisições
  // em paralelo. Ver utils/requestSequencer.js para o porquê da guarda:
  // sem ela, a resposta que chegasse por último "vencia" mesmo que tivesse
  // sido disparada antes de outra já concluída, sobrescrevendo um
  // salvamento recente com um snapshot antigo (o usuário via o campo
  // "voltar" e achava que não tinha salvo, quando na verdade salvou — só a
  // tela é que mostrou um estado desatualizado por causa da corrida).
  const sequenciadorRef = useRef(null)
  if (!sequenciadorRef.current) sequenciadorRef.current = criarSequenciadorDeRequisicoes()

  // mostrarCarregando=true só na carga inicial do modal. As seções internas
  // chamam onAtualizar() só pra ressincronizar o pedido em segundo plano
  // depois de salvar — trocar a tela inteira pelo spinner a cada campo
  // editado é o que causava o "pisca" de carregamento a cada pequena edição.
  const carregar = useCallback((mostrarCarregando = false) => {
    if (!pedidoId) return
    const sequenciador = sequenciadorRef.current
    const minhaRequisicao = sequenciador.proxima()
    if (mostrarCarregando) setCarregando(true)
    return pedidosService
      .buscarPorId(pedidoId)
      .then((dados) => {
        if (!sequenciador.ehAtual(minhaRequisicao)) return // resposta obsoleta, descarta
        setPedido(dados)
      })
      .catch((err) => {
        if (!sequenciador.ehAtual(minhaRequisicao)) return
        toast.erro('Erro ao carregar pedido: ' + err.message)
      })
      .finally(() => {
        if (mostrarCarregando && sequenciador.ehAtual(minhaRequisicao)) setCarregando(false)
      })
  }, [pedidoId, toast])

  useEffect(() => { carregar(true) }, [carregar])

  async function handleAtualizarStatus(novoStatus) {
    setAtualizando(true)
    try {
      const atualizado = await pedidosService.atualizarStatus(
        pedido.id,
        novoStatus,
        operador?.id ?? null,
        observacao || null
      )
      // Mescla só status + status_real (não o pedido inteiro) pra não sobrescrever
      // edições em andamento em outras seções (Sequência, Pagamento) — mas os
      // dois campos de status juntos, senão status_real ficava desatualizado
      // e o checklist (que decide "tudo separado" a partir dele) não refletia
      // uma transição de status feita por aqui (ex.: "Marcar Separado").
      setPedido((prev) => ({ ...prev, status: atualizado.status, status_real: atualizado.status_real }))
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
    <>
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal modal--grande" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-esquerda">
            <h2 className="modal-titulo">
              {pedido ? pedido.protocolo : 'Pedido'}
            </h2>
            {pedido && <StatusBadge status={pedido.status} />}
            {pedido?.listas_modelo && (
              <span
                className="pedido-prioridade-badge pedido-prioridade-badge--lista-modelo"
                title={`Criado a partir da lista pronta de ${pedido.listas_modelo.escolas?.nome ?? 'escola'} (${pedido.listas_modelo.ano})`}
              >
                🎒 Lista {pedido.listas_modelo.escolas?.nome ?? ''} · {pedido.listas_modelo.ano}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {pedido && (
              <button className="btn btn-ghost btn-sm" onClick={() => setModalOcorrencia(true)}>
                🧾 Abrir Ocorrência
              </button>
            )}
            <button className="modal-fechar" onClick={onFechar} aria-label="Fechar">
              ✕
            </button>
          </div>
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
              <PagamentoPedido pedido={pedido} onAtualizar={carregar} />

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

              {/* Card destaque — Código do pedido na área de retirada */}
              {pedido.status === 'PRONTO_RETIRADA' && (
                <section className="pedido-detalhe-secao">
                  <div className="protocolo-retirada-card">
                    <div className="protocolo-retirada-icone">🏪</div>
                    <div className="protocolo-retirada-info">
                      <span className="protocolo-retirada-label">Código do Pedido — Área de Retirada</span>
                      <span className="protocolo-retirada-codigo">{pedido.protocolo}</span>
                      <span className="protocolo-retirada-instrucao">
                        Identifique o pacote com este código na área de retirada
                      </span>
                    </div>
                  </div>
                </section>
              )}

              {/* Checklist de Separação */}
              {['EM_SEPARACAO', 'SEPARADO'].includes(pedido.status) &&
                pedido.itens_pedido?.length > 0 && (
                  <section className="pedido-detalhe-secao">
                    <h3 className="pedido-detalhe-titulo">Checklist de Separação</h3>
                    <ChecklistSeparacao pedido={pedido} onAtualizar={carregar} />
                  </section>
                )}

              {/* Linha do tempo unificada (status + entrega + ocorrências) */}
              <section className="pedido-detalhe-secao">
                <h3 className="pedido-detalhe-titulo">Linha do Tempo</h3>
                <TimelinePedido pedidoId={pedido.id} orcamentoId={pedido.orcamento_id} />
              </section>

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

    {modalOcorrencia && pedido && (
      <AbrirOcorrenciaModal
        pedidoIdInicial={pedido.id}
        onFechar={() => setModalOcorrencia(false)}
      />
    )}
    </>
  )
}
