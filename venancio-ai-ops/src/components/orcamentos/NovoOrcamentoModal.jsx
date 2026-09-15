import { useState, useEffect } from 'react'
import { orcamentosService } from '@/services/orcamentos.service'
import { clientesService } from '@/services/clientes.service'
import { ProdutoAutocompleteInput } from '@/components/pedidos/ProdutoAutocompleteInput'
import { useToast } from '@/contexts/AppContext'
import { formatCurrency } from '@/utils/formatters'
import { useRascunhoAutoSave } from '@/hooks/useRascunhoAutoSave'
import {
  CHAVE_RASCUNHO_NOVO_ORCAMENTO,
  carregarRascunho,
  salvarRascunho,
  limparRascunho,
  rascunhoNovoTemConteudo,
  prepararDuplicacaoOrcamento,
} from '@/utils/rascunhoOrcamento'

const ITEM_VAZIO = { descricao_livre: '', quantidade: 1, valor_unitario: '', produto_id: null }

// Lazy init (função no useState) roda uma única vez, na montagem — é aqui
// que o rascunho salvo (se existir e tiver conteúdo) sobrepõe o padrão
// vazio/clienteInicial. Feito fora do componente pra ficar fácil de ler o
// que cada state realmente considera como "valor inicial".
//
// Duplicar (`duplicarDe`) tem prioridade sobre qualquer rascunho existente:
// é uma ação explícita do operador, então sobrescreve na hora (síncrono,
// antes do primeiro render) o rascunho de "novo orçamento" que já houvesse
// — não mistura os dois nem pede confirmação extra.
function estadoInicial(clienteInicial, duplicarDe) {
  if (duplicarDe) {
    const duplicado = prepararDuplicacaoOrcamento(duplicarDe)
    salvarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO, duplicado)
    return { ...duplicado, recuperado: false, duplicado: true }
  }

  const rascunho = carregarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)
  const temRascunho = rascunhoNovoTemConteudo(rascunho)
  if (temRascunho) return { ...rascunho, recuperado: true, duplicado: false }
  return {
    cliente: { nome: clienteInicial?.nome ?? '', telefone: clienteInicial?.telefone ?? '' },
    observacoes: '',
    status: 'rascunho',
    itens: [{ ...ITEM_VAZIO }],
    recuperado: false,
    duplicado: false,
  }
}

export function NovoOrcamentoModal({ onFechar, onCriado, clienteInicial = null, duplicarDe = null }) {
  const { toast } = useToast()
  const [salvando, setSalvando] = useState(false)
  const [estadoInicialCarregado] = useState(() => estadoInicial(clienteInicial, duplicarDe))
  const [cliente, setCliente] = useState(estadoInicialCarregado.cliente)
  const [observacoes, setObservacoes] = useState(estadoInicialCarregado.observacoes)
  const [status, setStatus] = useState(estadoInicialCarregado.status)
  const [itens, setItens] = useState(estadoInicialCarregado.itens)

  useEffect(() => {
    if (estadoInicialCarregado.duplicado) {
      toast.aviso('Orçamento duplicado — selecione o cliente para este novo orçamento.')
    } else if (estadoInicialCarregado.recuperado) {
      toast.aviso('Recuperamos um rascunho de orçamento que não tinha sido salvo.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useRascunhoAutoSave(CHAVE_RASCUNHO_NOVO_ORCAMENTO, { cliente, observacoes, status, itens })

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

      limparRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)
      toast.sucesso('Orçamento criado!')
      onCriado?.(orc)
      onFechar()
    } catch (err) {
      toast.erro('Erro: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  // "Cancelar" é ação explícita do operador — diferente de fechar clicando
  // fora do modal (acidental, na maioria das vezes) ou no ✕, que preservam
  // o rascunho de propósito pra poder ser recuperado depois.
  function handleCancelar() {
    limparRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)
    onFechar()
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal modal--grande">
        <div className="modal-header">
          <div className="modal-header-esquerda">
            <span style={{ fontSize: 22 }}>📋</span>
            <div>
              <h2 className="modal-titulo">{duplicarDe ? 'Duplicar Orçamento' : 'Novo Orçamento'}</h2>
              <p className="modal-subtitulo">
                {duplicarDe
                  ? `Mesmos itens de ${duplicarDe.protocolo} — escolha o cliente`
                  : 'Crie uma proposta para o cliente'}
              </p>
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
                  <label className="form-label" htmlFor="orcamento-cliente-nome">Nome *</label>
                  <input id="orcamento-cliente-nome" className="input" placeholder="Nome completo" value={cliente.nome}
                    onChange={(e) => setCliente((c) => ({ ...c, nome: e.target.value }))} />
                </div>
                <div className="form-grupo">
                  <label className="form-label" htmlFor="orcamento-cliente-telefone">Telefone / WhatsApp *</label>
                  <input id="orcamento-cliente-telefone" className="input" placeholder="+55 11 99999-0000" value={cliente.telefone}
                    onChange={(e) => setCliente((c) => ({ ...c, telefone: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Configurações */}
            <div className="pedido-detalhe-secao">
              <p className="pedido-detalhe-titulo">Configurações</p>
              <div className="form-grid form-grid--2">
                <div className="form-grupo">
                  <label className="form-label" htmlFor="orcamento-status-inicial">Status Inicial</label>
                  <select id="orcamento-status-inicial" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="rascunho">Rascunho</option>
                    <option value="enviado">Enviado</option>
                  </select>
                </div>
                <div className="form-grupo">
                  <label className="form-label" htmlFor="orcamento-observacoes">Observações</label>
                  <input id="orcamento-observacoes" className="input" placeholder="Ex: desconto negociado..." value={observacoes}
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
                    <button className="btn-remover-item" onClick={() => removeItem(idx)} disabled={itens.length === 1} aria-label="Remover item">×</button>
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
          <button className="btn btn-ghost" onClick={handleCancelar} disabled={salvando}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSalvar} disabled={salvando}>
            {salvando ? '...' : '✓ Criar Orçamento'}
          </button>
        </div>
      </div>
    </div>
  )
}
