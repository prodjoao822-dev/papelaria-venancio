import { useState } from 'react'
import { orcamentosService } from '@/services/orcamentos.service'
import { clientesService } from '@/services/clientes.service'
import { ProdutoAutocompleteInput } from '@/components/pedidos/ProdutoAutocompleteInput'
import { useToast } from '@/contexts/AppContext'
import { formatCurrency } from '@/utils/formatters'

const ITEM_VAZIO = { descricao_livre: '', quantidade: 1, valor_unitario: '', produto_id: null }

export function NovoOrcamentoModal({ onFechar, onCriado, clienteInicial = null }) {
  const { toast } = useToast()
  const [salvando, setSalvando] = useState(false)
  const [cliente, setCliente] = useState({
    nome: clienteInicial?.nome ?? '',
    telefone: clienteInicial?.telefone ?? '',
  })
  const [observacoes, setObservacoes] = useState('')
  const [status, setStatus] = useState('rascunho')
  const [itens, setItens] = useState([{ ...ITEM_VAZIO }])

  const total = itens.reduce((acc, i) => {
    return acc + (Number(i.quantidade) || 0) * (parseFloat(String(i.valor_unitario).replace(',', '.')) || 0)
  }, 0)

  function addItem() { setItens((p) => [...p, { ...ITEM_VAZIO }]) }
  function removeItem(idx) { setItens((p) => p.filter((_, i) => i !== idx)) }
  function setItem(idx, campo, val) {
    setItens((p) => p.map((it, i) => {
      if (i !== idx) return it
      if (campo === 'descricao_livre' && it.produto_id) {
        return { ...it, descricao_livre: val, produto_id: null }
      }
      return { ...it, [campo]: val }
    }))
  }
  function selecionarProduto(idx, produto) {
    setItens((p) => p.map((it, i) =>
      i === idx
        ? {
            ...it,
            produto_id: produto.id,
            descricao_livre: produto.nome,
            valor_unitario: it.valor_unitario ? it.valor_unitario : String(produto.preco ?? ''),
          }
        : it
    ))
  }

  async function handleSalvar() {
    if (!cliente.nome.trim())     { toast.aviso('Informe o nome do cliente.'); return }
    if (!cliente.telefone.trim()) { toast.aviso('Informe o telefone.'); return }
    const itensFiltrados = itens.filter((i) => i.descricao_livre.trim())
    if (itensFiltrados.length === 0) { toast.aviso('Adicione ao menos um item.'); return }

    setSalvando(true)
    try {
      let cli = await clientesService.buscarPorTelefone(cliente.telefone)
      if (!cli) {
        cli = await clientesService.criarOuAtualizar(cliente.telefone, {
          nome: cliente.nome, origem: 'manual',
        })
      }

      const orc = await orcamentosService.criar({
        cliente_id:  cli.id,
        tipo:        'venda_geral',
        status,
        observacoes: observacoes || null,
        itens: itensFiltrados.map((i) => ({
          produto_id:      i.produto_id ?? null,
          descricao_livre: i.descricao_livre.trim(),
          quantidade:      Number(i.quantidade) || 1,
          valor_unitario:  parseFloat(String(i.valor_unitario).replace(',', '.')) || 0,
        })),
      })

      toast.sucesso('Orçamento criado!')
      onCriado?.(orc)
      onFechar()
    } catch (err) {
      toast.erro('Erro: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal modal--grande">
        <div className="modal-header">
          <div className="modal-header-esquerda">
            <span style={{ fontSize: 22 }}>📋</span>
            <div>
              <h2 className="modal-titulo">Novo Orçamento</h2>
              <p className="modal-subtitulo">Crie uma proposta para o cliente</p>
            </div>
          </div>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>

        <div className="modal-body">
          <div className="pedido-detalhe">

            {/* Cliente */}
            <div className="pedido-detalhe-secao">
              <p className="pedido-detalhe-titulo">Cliente</p>
              <div className="form-grid form-grid--2">
                <div className="form-grupo">
                  <label className="form-label">Nome *</label>
                  <input className="input" placeholder="Nome completo" value={cliente.nome}
                    onChange={(e) => setCliente((c) => ({ ...c, nome: e.target.value }))} />
                </div>
                <div className="form-grupo">
                  <label className="form-label">Telefone / WhatsApp *</label>
                  <input className="input" placeholder="+55 11 99999-0000" value={cliente.telefone}
                    onChange={(e) => setCliente((c) => ({ ...c, telefone: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Configurações */}
            <div className="pedido-detalhe-secao">
              <p className="pedido-detalhe-titulo">Configurações</p>
              <div className="form-grid form-grid--2">
                <div className="form-grupo">
                  <label className="form-label">Status Inicial</label>
                  <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="rascunho">Rascunho</option>
                    <option value="enviado">Enviado</option>
                  </select>
                </div>
                <div className="form-grupo">
                  <label className="form-label">Observações</label>
                  <input className="input" placeholder="Ex: desconto negociado..." value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Itens */}
            <div className="pedido-detalhe-secao">
              <p className="pedido-detalhe-titulo">Itens do Orçamento</p>
              <div className="itens-input-lista">
                <div className="item-input-linha" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-3)', paddingBottom: 4 }}>
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
                      onChangeText={(v) => setItem(idx, 'descricao_livre', v)}
                      onSelecionar={(produto) => selecionarProduto(idx, produto)}
                    />
                    <input className="input input-sm" type="number" min="1" value={item.quantidade}
                      onChange={(e) => setItem(idx, 'quantidade', e.target.value)} style={{ textAlign: 'center' }} />
                    <input className="input input-sm" placeholder="0,00" value={item.valor_unitario}
                      onChange={(e) => setItem(idx, 'valor_unitario', e.target.value)} style={{ textAlign: 'right' }} />
                    <button className="btn-remover-item" onClick={() => removeItem(idx)} disabled={itens.length === 1}>×</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={addItem}>＋ Adicionar item</button>
                <div className="itens-total-novo">Total: <strong>{formatCurrency(total)}</strong></div>
              </div>
            </div>

          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSalvar} disabled={salvando}>
            {salvando ? '...' : '✓ Criar Orçamento'}
          </button>
        </div>
      </div>
    </div>
  )
}
