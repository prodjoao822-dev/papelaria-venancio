import { useState, useEffect } from 'react'
import { pedidosService } from '@/services/pedidos.service'
import { clientesService } from '@/services/clientes.service'
import { funcionariosService } from '@/services/funcionarios.service'
import { separacaoService } from '@/services/separacao.service'
import { ProdutoAutocompleteInput } from './ProdutoAutocompleteInput'
import { useToast } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/utils/formatters'
import { FORMAS_PAGAMENTO, STATUS_PAGAMENTO } from '@/utils/constants'

const FORMAS_ENTREGA = [
  { value: 'retirada',       label: 'Retirada na loja' },
  { value: 'entrega_propria', label: 'Entrega própria' },
  { value: 'uber_flash',     label: 'Uber Flash / Motoboy' },
]

const ITEM_VAZIO = { descricao_livre: '', quantidade: 1, valor_unitario: '', produto_id: null }

// "Criar pedido manual" não insere direto em `pedidos` — orcamento_id é
// NOT NULL (todo pedido nasce de um orçamento aceito). Cria um orçamento
// tipo venda_geral e aceita na mesma chamada (ver pedidosService.criar()).
export function NovoPedidoModal({ onFechar, clienteInicial = null }) {
  const { toast } = useToast()
  const { operador } = useAuth()

  const [salvando, setSalvando] = useState(false)
  const [cliente, setCliente] = useState({
    nome: clienteInicial?.nome ?? '',
    telefone: clienteInicial?.telefone ?? '',
  })
  const [formaEntrega, setFormaEntrega] = useState('retirada')
  const [enderecoEntrega, setEnderecoEntrega] = useState('')
  const [observacoes, setObservacoes] = useState('')
  // RF-02 (Fase 3): pagamento — todos opcionais no cadastro manual, pra não
  // travar o balcão quando o cliente ainda não decidiu como vai pagar.
  const [formaPagamento, setFormaPagamento] = useState('')
  const [statusPagamento, setStatusPagamento] = useState('pendente')
  const [horarioPrevisto, setHorarioPrevisto] = useState('')
  const [itens, setItens] = useState([{ ...ITEM_VAZIO }])
  const [responsavelSeparacaoId, setResponsavelSeparacaoId] = useState('')
  const [funcionariosSeparacao, setFuncionariosSeparacao] = useState([])
  // Delegação formal (nova) — distinta do "Responsável pela Separação" acima,
  // que é a atribuição informal legada (Ficha de Separação, sem prioridade
  // nem notificação). As duas convivem de propósito (decisão do dono do
  // produto, 14/08/2026): não substituir uma pela outra ainda.
  const [delegarFormalmente, setDelegarFormalmente] = useState(false)
  const [separadorDelegadoId, setSeparadorDelegadoId] = useState('')
  const [prioridadeDelegacao, setPrioridadeDelegacao] = useState('imediata')
  const [horarioRetiradaDelegacao, setHorarioRetiradaDelegacao] = useState('')

  useEffect(() => {
    funcionariosService.listarPorPapel('separacao')
      .then(setFuncionariosSeparacao)
      .catch(() => {})
  }, [])

  const totalItens = itens.reduce((acc, item) => {
    const qty = Number(item.quantidade) || 0
    const preco = parseFloat(String(item.valor_unitario).replace(',', '.')) || 0
    return acc + qty * preco
  }, 0)

  function adicionarItem() {
    setItens((prev) => [...prev, { ...ITEM_VAZIO }])
  }

  function removerItem(idx) {
    setItens((prev) => prev.filter((_, i) => i !== idx))
  }

  function atualizarItem(idx, campo, valor) {
    setItens((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item
        // Editar a descrição depois de ter selecionado um produto do catálogo
        // desvincula o item (evita gravar produto_id de um texto diferente).
        if (campo === 'descricao_livre' && item.produto_id) {
          return { ...item, descricao_livre: valor, produto_id: null }
        }
        return { ...item, [campo]: valor }
      })
    )
  }

  function selecionarProduto(idx, produto) {
    setItens((prev) =>
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              produto_id: produto.id,
              descricao_livre: produto.nome,
              valor_unitario: item.valor_unitario ? item.valor_unitario : String(produto.preco ?? ''),
            }
          : item
      )
    )
  }

  async function handleSalvar() {
    if (!cliente.nome.trim()) { toast.aviso('Informe o nome do cliente.'); return }
    if (!cliente.telefone.trim()) { toast.aviso('Informe o telefone do cliente.'); return }
    const itensFiltrados = itens.filter((i) => i.descricao_livre.trim())
    if (itensFiltrados.length === 0) { toast.aviso('Adicione ao menos um item.'); return }
    if (formaEntrega !== 'retirada' && !enderecoEntrega.trim()) {
      toast.aviso('Informe o endereço de entrega.'); return
    }
    if (delegarFormalmente) {
      if (!separadorDelegadoId) { toast.aviso('Escolha o separador para delegar.'); return }
      if (prioridadeDelegacao === 'agendada' && !horarioRetiradaDelegacao) {
        toast.aviso('Informe o horário de retirada para prioridade agendada.'); return
      }
    }

    setSalvando(true)
    try {
      let clienteObj = await clientesService.buscarPorTelefone(cliente.telefone)

      if (!clienteObj) {
        clienteObj = await clientesService.criarOuAtualizar(cliente.telefone, {
          nome: cliente.nome,
          origem: 'manual',
        })
      }

      const pedido = await pedidosService.criar({
        cliente_id: clienteObj.id,
        forma_entrega: formaEntrega,
        endereco_entrega: formaEntrega !== 'retirada' ? enderecoEntrega.trim() : null,
        observacoes: observacoes || null,
        forma_pagamento: formaPagamento || null,
        status_pagamento: statusPagamento,
        horario_previsto: horarioPrevisto ? new Date(horarioPrevisto).toISOString() : null,
        itens: itensFiltrados.map((item) => ({
          produto_id: item.produto_id ?? null,
          descricao_livre: item.descricao_livre.trim(),
          quantidade: Number(item.quantidade) || 1,
          valor_unitario: parseFloat(String(item.valor_unitario).replace(',', '.')) || 0,
        })),
      }, operador?.id ?? null)

      if (responsavelSeparacaoId) {
        try {
          await pedidosService.atribuirResponsavel(pedido.id, 'separacao', responsavelSeparacaoId, operador?.id ?? null)
        } catch (err) {
          toast.aviso('Pedido criado, mas não consegui atribuir o responsável: ' + err.message)
        }
      }

      if (delegarFormalmente) {
        try {
          await separacaoService.delegar({
            pedidoId: pedido.id,
            separadorId: separadorDelegadoId,
            prioridade: prioridadeDelegacao,
            horarioRetirada: prioridadeDelegacao === 'agendada' ? new Date(horarioRetiradaDelegacao).toISOString() : null,
          })
        } catch (err) {
          toast.aviso('Pedido criado, mas não consegui delegar a separação: ' + err.message)
        }
      }

      toast.sucesso('Pedido criado com sucesso!')
      onFechar()
    } catch (err) {
      toast.erro(`Erro ao criar pedido: ${err.message}`)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal modal--grande">
        <div className="modal-header">
          <div className="modal-header-esquerda">
            <span style={{ fontSize: '22px' }}>📝</span>
            <div>
              <h2 className="modal-titulo">Novo Pedido Manual</h2>
              <p className="modal-subtitulo">Cadastre um pedido direto no sistema</p>
            </div>
          </div>
          <button className="modal-fechar" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        <div className="modal-body">
          <div className="pedido-detalhe">

            {/* Dados do cliente */}
            <div className="pedido-detalhe-secao">
              <p className="pedido-detalhe-titulo">Cliente</p>
              <div className="form-grid form-grid--2">
                <div className="form-grupo">
                  <label className="form-label">Nome *</label>
                  <input
                    className="input"
                    placeholder="Nome completo"
                    value={cliente.nome}
                    onChange={(e) => setCliente((c) => ({ ...c, nome: e.target.value }))}
                  />
                </div>
                <div className="form-grupo">
                  <label className="form-label">Telefone / WhatsApp *</label>
                  <input
                    className="input"
                    placeholder="+55 11 99999-0000"
                    value={cliente.telefone}
                    onChange={(e) => setCliente((c) => ({ ...c, telefone: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Entrega */}
            <div className="pedido-detalhe-secao">
              <p className="pedido-detalhe-titulo">Entrega</p>
              <div className="form-grid form-grid--2">
                <div className="form-grupo">
                  <label className="form-label">Forma de Entrega</label>
                  <select
                    className="input"
                    value={formaEntrega}
                    onChange={(e) => setFormaEntrega(e.target.value)}
                  >
                    {FORMAS_ENTREGA.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-grupo">
                  <label className="form-label">Observações</label>
                  <input
                    className="input"
                    placeholder="Ex: entregar antes do meio-dia"
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                  />
                </div>
                {formaEntrega !== 'retirada' && (
                  <div className="form-grupo form-grupo--full">
                    <label className="form-label">Endereço de Entrega *</label>
                    <input
                      className="input"
                      placeholder="Rua, número, bairro, cidade"
                      value={enderecoEntrega}
                      onChange={(e) => setEnderecoEntrega(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Pagamento (RF-02) */}
            <div className="pedido-detalhe-secao">
              <p className="pedido-detalhe-titulo">Pagamento</p>
              <div className="form-grid form-grid--2">
                <div className="form-grupo">
                  <label className="form-label">Forma de Pagamento</label>
                  <select
                    className="input"
                    value={formaPagamento}
                    onChange={(e) => setFormaPagamento(e.target.value)}
                  >
                    <option value="">— Não informado —</option>
                    {FORMAS_PAGAMENTO.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-grupo">
                  <label className="form-label">Status do Pagamento</label>
                  <select
                    className="input"
                    value={statusPagamento}
                    onChange={(e) => setStatusPagamento(e.target.value)}
                  >
                    {STATUS_PAGAMENTO.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-grupo">
                  <label className="form-label">Horário Previsto (retirada/entrega)</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={horarioPrevisto}
                    onChange={(e) => setHorarioPrevisto(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Logística */}
            <div className="pedido-detalhe-secao">
              <p className="pedido-detalhe-titulo">Logística</p>
              <div className="form-grid form-grid--2">
                <div className="form-grupo">
                  <label className="form-label">Responsável pela Separação</label>
                  <select
                    className="input"
                    value={responsavelSeparacaoId}
                    onChange={(e) => setResponsavelSeparacaoId(e.target.value)}
                  >
                    <option value="">— Nenhum —</option>
                    {funcionariosSeparacao.map((f) => (
                      <option key={f.id} value={f.id}>{f.nome}</option>
                    ))}
                  </select>
                  <p className="form-hint">Atribuição simples (Ficha de Separação) — sem prioridade, sem notificação.</p>
                </div>
              </div>

              <div className="form-grupo form-grupo--full" style={{ marginTop: 12 }}>
                <label className="form-label-check">
                  <input
                    type="checkbox"
                    checked={delegarFormalmente}
                    onChange={(e) => setDelegarFormalmente(e.target.checked)}
                  />
                  Delegar separação formalmente agora (solicitação rastreável, com prioridade e notificação ao separador)
                </label>
              </div>

              {delegarFormalmente && (
                <div className="form-grid form-grid--2" style={{ marginTop: 8 }}>
                  <div className="form-grupo">
                    <label className="form-label">Separador *</label>
                    <select
                      className="input"
                      value={separadorDelegadoId}
                      onChange={(e) => setSeparadorDelegadoId(e.target.value)}
                    >
                      <option value="">— Selecionar —</option>
                      {funcionariosSeparacao.map((f) => (
                        <option key={f.id} value={f.id}>{f.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-grupo">
                    <label className="form-label">Prioridade *</label>
                    <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                      <label className="form-label-check">
                        <input type="radio" name="prioridadeNovoPedido" checked={prioridadeDelegacao === 'imediata'} onChange={() => setPrioridadeDelegacao('imediata')} />
                        ⚡ Imediata
                      </label>
                      <label className="form-label-check">
                        <input type="radio" name="prioridadeNovoPedido" checked={prioridadeDelegacao === 'agendada'} onChange={() => setPrioridadeDelegacao('agendada')} />
                        🗓️ Agendada
                      </label>
                    </div>
                  </div>
                  {prioridadeDelegacao === 'agendada' && (
                    <div className="form-grupo form-grupo--full">
                      <label className="form-label">Horário de retirada *</label>
                      <input
                        type="datetime-local"
                        className="input"
                        value={horarioRetiradaDelegacao}
                        onChange={(e) => setHorarioRetiradaDelegacao(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Itens */}
            <div className="pedido-detalhe-secao">
              <p className="pedido-detalhe-titulo">Itens do Pedido</p>

              <div className="itens-input-lista">
                {/* Header */}
                <div
                  className="item-input-linha"
                  style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-3)', paddingBottom: '4px' }}
                >
                  <span>Produto / Descrição</span>
                  <span style={{ textAlign: 'center' }}>Qtd</span>
                  <span style={{ textAlign: 'right' }}>Preço Unit.</span>
                  <span />
                </div>

                {itens.map((item, idx) => (
                  <div key={idx} className="item-input-linha">
                    <ProdutoAutocompleteInput
                      placeholder="Nome do produto (busca no catálogo)"
                      value={item.descricao_livre}
                      onChangeText={(v) => atualizarItem(idx, 'descricao_livre', v)}
                      onSelecionar={(produto) => selecionarProduto(idx, produto)}
                    />
                    <input
                      className="input input-sm"
                      type="number"
                      min="1"
                      placeholder="1"
                      value={item.quantidade}
                      onChange={(e) => atualizarItem(idx, 'quantidade', e.target.value)}
                      style={{ textAlign: 'center' }}
                    />
                    <input
                      className="input input-sm"
                      placeholder="0,00"
                      value={item.valor_unitario}
                      onChange={(e) => atualizarItem(idx, 'valor_unitario', e.target.value)}
                      style={{ textAlign: 'right' }}
                    />
                    <button
                      className="btn-remover-item"
                      onClick={() => removerItem(idx)}
                      disabled={itens.length === 1}
                      title="Remover item"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                <button className="btn btn-ghost btn-sm" onClick={adicionarItem}>
                  ＋ Adicionar item
                </button>
                <div className="itens-total-novo">
                  Total: <strong>{formatCurrency(totalItens)}</strong>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onFechar} disabled={salvando}>
            Cancelar
          </button>
          <button className="btn btn-purple" onClick={handleSalvar} disabled={salvando}>
            {salvando ? (
              <><span className="spinner spinner--branco" style={{ width: 14, height: 14 }} /> Salvando...</>
            ) : (
              '✓ Criar Pedido'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
