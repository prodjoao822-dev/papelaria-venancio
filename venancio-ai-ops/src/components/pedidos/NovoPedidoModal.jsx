import { useState, useEffect } from 'react'
import { pedidosService } from '@/services/pedidos.service'
import { clientesService } from '@/services/clientes.service'
import { funcionariosService } from '@/services/funcionarios.service'
import { ProdutoAutocompleteInput } from './ProdutoAutocompleteInput'
import { useToast } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/utils/formatters'

const FORMAS_ENTREGA = [
  { value: 'retirada',       label: 'Retirada na loja' },
  { value: 'entrega_propria', label: 'Entrega própria' },
  { value: 'uber_flash',     label: 'Uber Flash / Motoboy' },
]

const ITEM_VAZIO = { descricao_livre: '', quantidade: 1, valor_unitario: '', produto_id: null }

// "Criar pedido manual" não insere direto em `pedidos` — orcamento_id é
// NOT NULL (todo pedido nasce de um orçamento aceito). Cria um orçamento
// tipo venda_geral e aceita na mesma chamada (ver pedidosService.criar()).
export function NovoPedidoModal({ onFechar }) {
  const { toast } = useToast()
  const { operador } = useAuth()

  const [salvando, setSalvando] = useState(false)
  const [cliente, setCliente] = useState({ nome: '', telefone: '' })
  const [formaEntrega, setFormaEntrega] = useState('retirada')
  const [observacoes, setObservacoes] = useState('')
  const [itens, setItens] = useState([{ ...ITEM_VAZIO }])
  const [responsavelSeparacaoId, setResponsavelSeparacaoId] = useState('')
  const [funcionariosSeparacao, setFuncionariosSeparacao] = useState([])

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
        observacoes: observacoes || null,
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
                </div>
              </div>
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
