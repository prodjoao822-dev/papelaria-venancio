import { useState, useMemo } from 'react'
import { useOrcamentos } from '@/hooks/useOrcamentos'
import { orcamentosService } from '@/services/orcamentos.service'
import { NovoOrcamentoModal } from '@/components/orcamentos/NovoOrcamentoModal'
import { StatusOrcBadge } from '@/components/orcamentos/StatusOrcBadge'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProdutoAutocompleteInput } from '@/components/pedidos/ProdutoAutocompleteInput'
import { useToast } from '@/contexts/AppContext'
import { formatCurrency, formatDate, formatTimeAgo, formatPhone } from '@/utils/formatters'
import { orcamentoDocumento } from '@/utils/orcamentoDocumento'
import { useRascunhoAutoSave } from '@/hooks/useRascunhoAutoSave'
import {
  chaveRascunhoEdicaoOrcamento,
  carregarRascunho,
  limparRascunho,
  rascunhoEdicaoDifereDoOriginal,
  itensOrcamentoParaFormulario,
} from '@/utils/rascunhoOrcamento'

// Enum real status_orcamento (chatbot/papelaria-bot/supabase/squemanovo.sql):
// rascunho -> enviado|recusado|aceito ; enviado -> aceito|recusado|expirado.
// "Aceitar" não é uma troca de status qualquer — aceitar_orcamento() gera o
// pedido na mesma transação, por isso tem ação própria (acao: 'aceitar').
const ABAS_ORC = [
  { id: 'TODOS',     label: 'Todos',         statuses: null },
  { id: 'ATIVOS',    label: 'Em Andamento',  statuses: ['rascunho', 'enviado'] },
  { id: 'ACEITOS',   label: 'Aceitos',       statuses: ['aceito'] },
  { id: 'PERDIDOS',  label: 'Perdidos',      statuses: ['recusado', 'expirado'] },
]

const ACOES_STATUS = {
  rascunho: [
    { status: 'enviado',  label: 'Marcar Enviado', cls: 'btn-ghost',   acao: 'status' },
    { status: 'aceito',   label: '✓ Aceitar',      cls: 'btn-success', acao: 'aceitar' },
    { status: 'recusado', label: '✗ Recusar',      cls: 'btn-danger',  acao: 'status' },
  ],
  enviado: [
    { status: 'aceito',   label: '✓ Aceitar',      cls: 'btn-success', acao: 'aceitar' },
    { status: 'recusado', label: '✗ Recusar',      cls: 'btn-danger',  acao: 'status' },
    { status: 'expirado', label: 'Marcar Expirado', cls: 'btn-ghost',  acao: 'status' },
  ],
  aceito: [],
  recusado: [],
  expirado: [],
}

const ITEM_EDIT_VAZIO = { descricao_livre: '', quantidade: 1, valor_unitario: '', produto_id: null }

function OrcamentoDetalhe({ orc, onStatusChange, onAceitar, onPrecoAtualizado, onAtualizado, onDuplicar, onFechar }) {
  const { toast } = useToast()
  const [processando, setProcessando] = useState(false)
  const [editandoItemId, setEditandoItemId] = useState(null)
  const [precoEditado, setPrecoEditado] = useState('')
  const [salvandoPreco, setSalvandoPreco] = useState(false)
  const [editando, setEditando] = useState(false)
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [itensEdit, setItensEdit] = useState([])
  const [observacoesEdit, setObservacoesEdit] = useState('')
  const [enviandoPdf, setEnviandoPdf] = useState(false)
  const acoes = ACOES_STATUS[orc.status] ?? []
  const pedidoGerado = orc.pedidos?.[0]
  const itensSemPreco = (orc.itens_orcamento ?? []).filter((i) => i.valor_unitario === null)
  const chaveRascunhoEdicao = chaveRascunhoEdicaoOrcamento(orc.id)

  // Só grava rascunho de edição enquanto `editando` está ativo — evita
  // sobrescrever um rascunho existente com o state vazio ([]) de antes de
  // entrar no modo de edição.
  useRascunhoAutoSave(chaveRascunhoEdicao, { itens: itensEdit, observacoes: observacoesEdit }, editando)

  async function handleAcao(acao) {
    if (acao.acao === 'aceitar' && itensSemPreco.length > 0) {
      toast.aviso('Preencha o preço de todos os itens antes de aceitar — tem item sem valor ainda.')
      return
    }
    setProcessando(true)
    try {
      if (acao.acao === 'aceitar') await onAceitar(orc.id)
      else await onStatusChange(orc.id, acao.status)
    } finally {
      setProcessando(false)
    }
  }

  function iniciarEdicaoPreco(item) {
    setEditandoItemId(item.id)
    setPrecoEditado('')
  }

  async function confirmarPreco(item) {
    const valor = parseFloat(String(precoEditado).replace(',', '.'))
    if (!valor || valor <= 0) { toast.aviso('Informe um preço válido.'); return }
    setSalvandoPreco(true)
    try {
      await onPrecoAtualizado(item.id, valor)
      setEditandoItemId(null)
      toast.sucesso('Preço atualizado.')
    } catch (err) {
      toast.erro('Erro ao salvar preço: ' + err.message)
    } finally {
      setSalvandoPreco(false)
    }
  }

  function iniciarEdicaoOrcamento() {
    const original = { itens: itensOrcamentoParaFormulario(orc), observacoes: orc.observacoes ?? '' }
    const rascunho = carregarRascunho(chaveRascunhoEdicao)
    const rascunhoValido = rascunho && Array.isArray(rascunho.itens)

    if (rascunhoValido && rascunhoEdicaoDifereDoOriginal(rascunho, original)) {
      setItensEdit(rascunho.itens)
      setObservacoesEdit(rascunho.observacoes ?? '')
      toast.aviso('Recuperamos alterações não salvas deste orçamento.')
    } else {
      setItensEdit(original.itens)
      setObservacoesEdit(original.observacoes)
    }
    setEditando(true)
  }

  // "Cancelar" na edição é ação explícita — descarta o rascunho de propósito.
  // Fechar o modal inteiro (✕, clicar fora) enquanto editando=true preserva
  // o rascunho, que é exatamente o cenário que queremos poder recuperar.
  function cancelarEdicaoOrcamento() {
    limparRascunho(chaveRascunhoEdicao)
    setEditando(false)
  }

  function addItemEdit() { setItensEdit((p) => [...p, { ...ITEM_EDIT_VAZIO }]) }
  function removeItemEdit(idx) { setItensEdit((p) => p.filter((_, i) => i !== idx)) }
  function setItemEdit(idx, campo, val) {
    setItensEdit((p) => p.map((it, i) => {
      if (i !== idx) return it
      if (campo === 'descricao_livre' && it.produto_id) {
        return { ...it, descricao_livre: val, produto_id: null }
      }
      return { ...it, [campo]: val }
    }))
  }
  function selecionarProdutoEdit(idx, produto) {
    setItensEdit((p) => p.map((it, i) =>
      i === idx
        ? { ...it, produto_id: produto.id, descricao_livre: produto.nome, valor_unitario: it.valor_unitario || String(produto.preco ?? '') }
        : it
    ))
  }

  async function salvarEdicaoOrcamento() {
    const itensFiltrados = itensEdit.filter((i) => i.descricao_livre.trim())
    if (itensFiltrados.length === 0) { toast.aviso('O orçamento precisa de ao menos um item.'); return }

    setSalvandoEdicao(true)
    try {
      const atualizado = await orcamentosService.atualizar(orc.id, {
        observacoes: observacoesEdit || null,
        itens: itensFiltrados.map((i) => ({
          produto_id: i.produto_id ?? null,
          descricao_livre: i.descricao_livre.trim(),
          quantidade: Number(i.quantidade) || 1,
          valor_unitario: parseFloat(String(i.valor_unitario).replace(',', '.')) || 0,
        })),
      })
      limparRascunho(chaveRascunhoEdicao)
      onAtualizado(atualizado)
      setEditando(false)
      toast.sucesso('Orçamento atualizado.')
    } catch (err) {
      toast.erro('Erro ao salvar: ' + err.message)
    } finally {
      setSalvandoEdicao(false)
    }
  }

  async function handleEnviarPdf() {
    setEnviandoPdf(true)
    try {
      const { base64, nomeArquivo } = orcamentoDocumento.gerarPdfBase64Orcamento(orc)
      await orcamentosService.enviarPdf(orc.clientes?.telefone, base64, nomeArquivo, `Orçamento ${orc.protocolo}`)
      toast.sucesso('PDF enviado pelo WhatsApp.')
    } catch (err) {
      toast.erro('Erro ao enviar: ' + err.message)
    } finally {
      setEnviandoPdf(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal modal--grande">
        <div className="modal-header">
          <div className="modal-header-esquerda">
            <span style={{ fontSize: 22 }}>📋</span>
            <div>
              <h2 className="modal-titulo">{orc.protocolo}</h2>
              <p className="modal-subtitulo">{orc.clientes?.nome} · {formatDate(orc.criado_em)}</p>
            </div>
          </div>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>

        {/* Documento: imprimir, baixar PDF e enviar — mesmo layout do orçamento
            que o JS Bot manda pro cliente (ver src/utils/orcamentoDocumento.js) */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => orcamentoDocumento.imprimirOrcamento(orc)}>
            🖨️ Imprimir
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => orcamentoDocumento.baixarPdfOrcamento(orc)}>
            📄 Baixar PDF
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleEnviarPdf}
            disabled={enviandoPdf || !orc.clientes?.telefone}
            title={!orc.clientes?.telefone ? 'Cliente sem telefone cadastrado' : undefined}
          >
            {enviandoPdf ? '...' : '📤 Enviar por WhatsApp'}
          </button>
          <div style={{ flex: 1 }} />
          {!editando && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => onDuplicar(orc)} title="Criar um novo orçamento com os mesmos itens, pra outro cliente">
                ⧉ Duplicar
              </button>
              <button className="btn btn-ghost btn-sm" onClick={iniciarEdicaoOrcamento}>✏️ Editar</button>
            </>
          )}
        </div>

        <div className="modal-body">
          <div className="pedido-detalhe">

            {/* Status e ações */}
            <div className="pedido-detalhe-secao">
              <p className="pedido-detalhe-titulo">Status</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <StatusOrcBadge status={orc.status} tamanho="lg" />
                {acoes.map((a) => (
                  <button key={a.status} className={`btn btn-sm ${a.cls}`}
                    onClick={() => handleAcao(a)}
                    disabled={processando || (a.acao === 'aceitar' && itensSemPreco.length > 0)}
                    title={a.acao === 'aceitar' && itensSemPreco.length > 0 ? 'Preencha o preço de todos os itens primeiro' : undefined}
                  >
                    {processando ? '...' : a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dados */}
            <div className="pedido-detalhe-secao">
              <p className="pedido-detalhe-titulo">Cliente</p>
              <div className="pedido-detalhe-grid">
                <div className="pedido-detalhe-campo">
                  <span className="campo-label">Nome</span>
                  <span className="campo-valor">{orc.clientes?.nome ?? '—'}</span>
                </div>
                <div className="pedido-detalhe-campo">
                  <span className="campo-label">Telefone</span>
                  <span className="campo-valor">{formatPhone(orc.clientes?.telefone)}</span>
                </div>
                <div className="pedido-detalhe-campo">
                  <span className="campo-label">Tipo</span>
                  <span className="campo-valor">{orc.tipo}</span>
                </div>
                {editando ? (
                  <div className="pedido-detalhe-campo pedido-detalhe-campo--full">
                    <span className="campo-label">Observações</span>
                    <input className="input" placeholder="Ex: desconto negociado..." value={observacoesEdit}
                      onChange={(e) => setObservacoesEdit(e.target.value)} />
                  </div>
                ) : orc.observacoes && (
                  <div className="pedido-detalhe-campo pedido-detalhe-campo--full">
                    <span className="campo-label">Observações</span>
                    <span className="campo-valor">{orc.observacoes}</span>
                  </div>
                )}
                {pedidoGerado && (
                  <div className="pedido-detalhe-campo">
                    <span className="campo-label">Pedido Gerado</span>
                    <span className="campo-valor" style={{ color: 'var(--primary-hover)', fontWeight: 700 }}>
                      {pedidoGerado.protocolo}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Itens */}
            <div className="pedido-detalhe-secao">
              <p className="pedido-detalhe-titulo">Itens</p>

              {editando ? (
                <>
                  <div className="itens-input-lista">
                    <div className="item-input-linha" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-3)', paddingBottom: 4 }}>
                      <span>Produto / Descrição</span>
                      <span style={{ textAlign: 'center' }}>Qtd</span>
                      <span style={{ textAlign: 'right' }}>Preço Unit.</span>
                      <span />
                    </div>
                    {itensEdit.map((item, idx) => (
                      <div key={idx} className="item-input-linha">
                        <ProdutoAutocompleteInput
                          placeholder="Nome do produto (busca no catálogo)"
                          value={item.descricao_livre}
                          onChangeText={(v) => setItemEdit(idx, 'descricao_livre', v)}
                          onSelecionar={(produto) => selecionarProdutoEdit(idx, produto)}
                        />
                        <input className="input input-sm" type="number" min="1" value={item.quantidade}
                          onChange={(e) => setItemEdit(idx, 'quantidade', e.target.value)} style={{ textAlign: 'center' }} />
                        <input className="input input-sm" placeholder="0,00" value={item.valor_unitario}
                          onChange={(e) => setItemEdit(idx, 'valor_unitario', e.target.value)} style={{ textAlign: 'right' }} />
                        <button className="btn-remover-item" onClick={() => removeItemEdit(idx)} disabled={itensEdit.length === 1}>×</button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={addItemEdit}>＋ Adicionar item</button>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost btn-sm" onClick={cancelarEdicaoOrcamento} disabled={salvandoEdicao}>
                        Cancelar
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={salvarEdicaoOrcamento} disabled={salvandoEdicao}>
                        {salvandoEdicao ? '...' : '✓ Salvar alterações'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {itensSemPreco.length > 0 && (
                    <p className="form-hint" style={{ color: 'var(--warning, #F59E0B)', marginBottom: 8 }}>
                      ⚠️ {itensSemPreco.length} {itensSemPreco.length === 1 ? 'item ainda não tem preço' : 'itens ainda não têm preço'}
                      {orc.tipo === 'cotacao_empresa' ? ' — cotação empresa nasce sem preço automático, precisa preencher aqui.' : '.'}
                    </p>
                  )}
                  <div className="itens-lista">
                    {(orc.itens_orcamento ?? []).map((item) => (
                      <div key={item.id} className="item-linha">
                        <span className="item-qtd">{item.quantidade}×</span>
                        <span className="item-nome">{item.nome_item}</span>
                        {editandoItemId === item.id ? (
                          <span className="item-preco" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input
                              className="input input-sm"
                              style={{ width: 80 }}
                              placeholder="0,00"
                              autoFocus
                              value={precoEditado}
                              onChange={(e) => setPrecoEditado(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && confirmarPreco(item)}
                            />
                            <button className="btn btn-ghost btn-xs" disabled={salvandoPreco} onClick={() => confirmarPreco(item)}>✓</button>
                            <button className="btn btn-ghost btn-xs" onClick={() => setEditandoItemId(null)}>✕</button>
                          </span>
                        ) : item.valor_unitario === null ? (
                          <button className="btn btn-warning btn-xs" onClick={() => iniciarEdicaoPreco(item)}>
                            + Definir preço
                          </button>
                        ) : (
                          <span className="item-preco">{formatCurrency(item.valor_unitario)}</span>
                        )}
                        <span className="item-subtotal">{item.valor_total !== null ? formatCurrency(item.valor_total) : '—'}</span>
                      </div>
                    ))}
                    <div className="itens-total">
                      <span>Total do Orçamento</span>
                      <span className="itens-total-valor">{formatCurrency(orc.valor_total)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

export function OrcamentosPage() {
  const { orcamentos, carregando, carregar, aceitar, atualizarStatus } = useOrcamentos()
  const [abaAtiva, setAbaAtiva] = useState('TODOS')
  const [busca, setBusca] = useState('')
  const [novoAberto, setNovoAberto] = useState(false)
  const [orcDetalhe, setOrcDetalhe] = useState(null)
  const [duplicarOrc, setDuplicarOrc] = useState(null)

  // Duplicar fecha o detalhe (se aberto) e abre o mesmo modal de "Novo
  // Orçamento" pré-carregado — é uma ação explícita, não precisa de
  // confirmação extra mesmo que já exista um rascunho de "novo orçamento"
  // não relacionado (ver rascunhoOrcamento.prepararDuplicacaoOrcamento).
  function handleDuplicar(orc) {
    setOrcDetalhe(null)
    setDuplicarOrc(orc)
  }

  const orcFiltrados = useMemo(() => {
    const aba = ABAS_ORC.find((a) => a.id === abaAtiva)
    let lista = orcamentos

    if (aba?.statuses) {
      lista = lista.filter((o) => aba.statuses.includes(o.status))
    }

    if (busca) {
      const b = busca.toLowerCase()
      lista = lista.filter(
        (o) => o.clientes?.nome?.toLowerCase().includes(b) || o.clientes?.telefone?.includes(busca)
      )
    }

    return lista
  }, [orcamentos, abaAtiva, busca])

  function contagemAba(aba) {
    if (!aba.statuses) return orcamentos.length
    return orcamentos.filter((o) => aba.statuses.includes(o.status)).length
  }

  // KPIs resumo
  const totalOrcamentos = orcamentos.length
  const totalValor = orcamentos.reduce((a, o) => a + (o.valor_total ?? 0), 0)
  const aceitos = orcamentos.filter((o) => o.status === 'aceito').length
  const taxaConversao = totalOrcamentos > 0 ? Math.round((aceitos / totalOrcamentos) * 100) : 0

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-info">
          <h1 className="page-titulo">Orçamentos</h1>
          <p className="page-descricao">Gerencie propostas e aceite para gerar pedidos</p>
        </div>
        <div className="page-header-acoes">
          <button className="btn btn-ghost btn-sm" onClick={() => carregar()}>↺ Atualizar</button>
          <button className="btn btn-primary" onClick={() => setNovoAberto(true)}>
            ＋ Novo Orçamento
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { titulo: 'Total',       valor: totalOrcamentos,             cor: '#3B82F6', icone: '📋' },
          { titulo: 'Valor Total', valor: formatCurrency(totalValor),  cor: '#10B981', icone: '💰' },
          { titulo: 'Aceitos',     valor: aceitos,                     cor: '#7C3AED', icone: '✅' },
          { titulo: 'Conversão',   valor: `${taxaConversao}%`,         cor: '#F59E0B', icone: '🎯' },
        ].map((k) => (
          <div key={k.titulo} className="kpi-card" style={{ '--kpi-cor': k.cor }}>
            <div className="kpi-card-header">
              <div className="kpi-card-header-left">
                <span className="kpi-card-icone">{k.icone}</span>
                <span className="kpi-card-titulo">{k.titulo}</span>
              </div>
            </div>
            <div className="kpi-card-valor">{k.valor}</div>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div className="card">
        {/* Abas */}
        <div className="abas" style={{ marginTop: 4 }}>
          {ABAS_ORC.map((aba) => (
            <button
              key={aba.id}
              className={`aba-btn ${abaAtiva === aba.id ? 'aba-btn--ativa' : ''}`}
              onClick={() => setAbaAtiva(aba.id)}
            >
              {aba.label}
              <span className="aba-count">{contagemAba(aba)}</span>
            </button>
          ))}
        </div>

        {/* Busca */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <input
            type="text"
            className="input"
            placeholder="Buscar por nome do cliente..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ maxWidth: 360 }}
          />
        </div>

        {carregando ? (
          <LoadingSpinner mensagem="Carregando orçamentos..." />
        ) : orcFiltrados.length === 0 ? (
          <EmptyState
            icone="📋"
            titulo="Nenhum orçamento nesta categoria"
            descricao="Crie um novo orçamento para começar."
          />
        ) : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th className="tabela-th">#</th>
                  <th className="tabela-th">Cliente</th>
                  <th className="tabela-th">Itens</th>
                  <th className="tabela-th">Valor</th>
                  <th className="tabela-th">Status</th>
                  <th className="tabela-th">Pedido</th>
                  <th className="tabela-th">Data</th>
                  <th className="tabela-th">Ações</th>
                </tr>
              </thead>
              <tbody>
                {orcFiltrados.map((orc) => {
                  const acoes = ACOES_STATUS[orc.status] ?? []
                  const pedidoGerado = orc.pedidos?.[0]
                  return (
                    <tr
                      key={orc.id}
                      className="tabela-row tabela-row--clicavel"
                      onClick={() => setOrcDetalhe(orc)}
                    >
                      <td className="tabela-cell">
                        <span className="pedido-numero" style={{ fontFamily: 'var(--font-mono)' }}>
                          {orc.protocolo}
                        </span>
                      </td>
                      <td className="tabela-cell">
                        <div className="pedido-cliente-nome">{orc.clientes?.nome ?? '—'}</div>
                        <div className="pedido-cliente-tel">{formatPhone(orc.clientes?.telefone)}</div>
                      </td>
                      <td className="tabela-cell">
                        <span className="pedido-itens-resumo">{(orc.itens_orcamento ?? []).length} item(s)</span>
                      </td>
                      <td className="tabela-cell">
                        <span className="pedido-valor">{formatCurrency(orc.valor_total)}</span>
                      </td>
                      <td className="tabela-cell">
                        <StatusOrcBadge status={orc.status} />
                      </td>
                      <td className="tabela-cell">
                        {pedidoGerado ? (
                          <span className="pedido-numero" style={{ fontSize: 11 }}>
                            {pedidoGerado.protocolo}
                          </span>
                        ) : (
                          <span className="texto-vazio">—</span>
                        )}
                      </td>
                      <td className="tabela-cell">
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {formatTimeAgo(orc.criado_em)}
                        </span>
                      </td>
                      <td className="tabela-cell" onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                          {acoes.slice(0, 1).map((a) => (
                            <button
                              key={a.status}
                              className={`btn btn-sm ${a.cls}`}
                              onClick={() => (a.acao === 'aceitar' ? aceitar(orc.id) : atualizarStatus(orc.id, a.status))}
                              title={a.label}
                            >
                              {a.label}
                            </button>
                          ))}
                          <button
                            className="btn btn-ghost btn-xs"
                            onClick={() => handleDuplicar(orc)}
                            title="Duplicar orçamento (mesmos itens, outro cliente)"
                          >
                            ⧉
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(novoAberto || duplicarOrc) && (
        <NovoOrcamentoModal
          duplicarDe={duplicarOrc}
          onFechar={() => { setNovoAberto(false); setDuplicarOrc(null) }}
          onCriado={() => carregar()}
        />
      )}

      {orcDetalhe && (
        <OrcamentoDetalhe
          orc={orcDetalhe}
          onStatusChange={async (id, status) => {
            await atualizarStatus(id, status)
            const updated = orcamentos.find((o) => o.id === id)
            if (updated) setOrcDetalhe({ ...updated, status })
          }}
          onAceitar={async (id) => {
            await aceitar(id)
            setOrcDetalhe(null)
          }}
          onPrecoAtualizado={async (itemId, valorUnitario) => {
            await orcamentosService.atualizarPrecoItem(itemId, valorUnitario)
            const atualizado = await orcamentosService.buscarPorId(orcDetalhe.id)
            setOrcDetalhe(atualizado)
            carregar()
          }}
          onAtualizado={(atualizado) => {
            setOrcDetalhe(atualizado)
            carregar()
          }}
          onDuplicar={handleDuplicar}
          onFechar={() => setOrcDetalhe(null)}
        />
      )}
    </div>
  )
}
