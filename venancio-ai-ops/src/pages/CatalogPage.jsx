import { useState, useEffect, useCallback, useRef } from 'react'
import { produtosService } from '@/services/produtos.service'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/contexts/AppContext'
import { formatCurrency } from '@/utils/formatters'

// ── Modal de Produto (criar / editar) ─────────────────────────────────────────

const CATEGORIAS_DEFAULT = [
  'Cadernos', 'Canetas e Lápis', 'Mochilas', 'Papéis', 'Pastas e Fichários',
  'Arte e Pintura', 'Informática', 'Escritório', 'Escolar', 'Outros',
]

function ProdutoModal({ produto, categorias, marcas, onSalvar, onFechar }) {
  const isEdicao = !!produto?.id
  const [form, setForm] = useState({
    nome:       produto?.nome       ?? '',
    categoria:  produto?.categoria  ?? '',
    marca:      produto?.marca      ?? '',
    sku:        produto?.sku        ?? '',
    preco:      produto?.preco      ?? '',
    estoque:    produto?.estoque    ?? 0,
    descricao:  produto?.descricao  ?? '',
    imagem_url: produto?.imagem_url ?? '',
    ativo:      produto?.ativo      ?? true,
    aliasInput: '',
    aliases:    produto?.aliases    ?? [],
    tags:       produto?.tags       ?? [],
    tagInput:   '',
  })
  const [salvando, setSalvando] = useState(false)
  const { toast } = useToast()
  const nomeRef = useRef(null)

  useEffect(() => { nomeRef.current?.focus() }, [])

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function adicionarAlias() {
    const v = form.aliasInput.trim()
    if (!v || form.aliases.includes(v)) return
    setForm((f) => ({ ...f, aliases: [...f.aliases, v], aliasInput: '' }))
  }

  function removerAlias(alias) {
    setForm((f) => ({ ...f, aliases: f.aliases.filter((a) => a !== alias) }))
  }

  function adicionarTag() {
    const v = form.tagInput.trim().toLowerCase()
    if (!v || form.tags.includes(v)) return
    setForm((f) => ({ ...f, tags: [...f.tags, v], tagInput: '' }))
  }

  function removerTag(tag) {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nome.trim())     return toast.aviso('Nome é obrigatório.')
    if (!form.categoria.trim()) return toast.aviso('Categoria é obrigatória.')
    if (isNaN(parseFloat(form.preco)) || parseFloat(form.preco) < 0) return toast.aviso('Preço inválido.')

    setSalvando(true)
    try {
      const dados = {
        nome:       form.nome.trim(),
        categoria:  form.categoria.trim(),
        marca:      form.marca.trim()     || null,
        sku:        form.sku.trim()       || null,
        preco:      parseFloat(form.preco),
        estoque:    parseInt(form.estoque) || 0,
        descricao:  form.descricao.trim() || null,
        imagem_url: form.imagem_url.trim() || null,
        ativo:      form.ativo,
        aliases:    form.aliases,
        tags:       form.tags,
      }
      await onSalvar(dados)
      toast.sucesso(isEdicao ? 'Produto atualizado.' : 'Produto criado.')
      onFechar()
    } catch (err) {
      toast.erro(err.message ?? 'Erro ao salvar produto.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal modal--lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-titulo">{isEdicao ? 'Editar Produto' : 'Novo Produto'}</h2>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <div className="form-grupo form-grupo--full">
              <label className="form-label">Nome *</label>
              <input
                ref={nomeRef}
                className="input"
                value={form.nome}
                onChange={(e) => set('nome', e.target.value)}
                placeholder="Ex: Caderno Universitário 10 matérias"
              />
            </div>

            <div className="form-grupo">
              <label className="form-label">Categoria *</label>
              <input
                className="input"
                list="categorias-list"
                value={form.categoria}
                onChange={(e) => set('categoria', e.target.value)}
                placeholder="Categoria do produto"
              />
              <datalist id="categorias-list">
                {[...new Set([...CATEGORIAS_DEFAULT, ...categorias])].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div className="form-grupo">
              <label className="form-label">Marca</label>
              <input
                className="input"
                list="marcas-list"
                value={form.marca}
                onChange={(e) => set('marca', e.target.value)}
                placeholder="Ex: Faber-Castell"
              />
              <datalist id="marcas-list">
                {marcas.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>

            <div className="form-grupo">
              <label className="form-label">SKU</label>
              <input
                className="input"
                value={form.sku}
                onChange={(e) => set('sku', e.target.value)}
                placeholder="Código único do produto"
              />
            </div>

            <div className="form-grupo">
              <label className="form-label">Preço (R$) *</label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                value={form.preco}
                onChange={(e) => set('preco', e.target.value)}
                placeholder="0,00"
              />
            </div>

            <div className="form-grupo">
              <label className="form-label">Estoque</label>
              <input
                className="input"
                type="number"
                min="0"
                value={form.estoque}
                onChange={(e) => set('estoque', e.target.value)}
              />
            </div>

            <div className="form-grupo form-grupo--full">
              <label className="form-label">Descrição</label>
              <textarea
                className="input textarea"
                rows={2}
                value={form.descricao}
                onChange={(e) => set('descricao', e.target.value)}
                placeholder="Descrição opcional para ajudar a IA a identificar o produto"
              />
            </div>

            {/* Aliases — nomes alternativos para busca da IA */}
            <div className="form-grupo form-grupo--full">
              <label className="form-label">
                Nomes alternativos (aliases)
                <span className="form-label-hint"> — a IA usará para reconhecer variações do nome</span>
              </label>
              <div className="alias-input-row">
                <input
                  className="input"
                  value={form.aliasInput}
                  onChange={(e) => set('aliasInput', e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), adicionarAlias())}
                  placeholder="Ex: caderno 10 matérias, caderno universitário..."
                />
                <button type="button" className="btn btn-ghost btn-sm" onClick={adicionarAlias}>
                  + Adicionar
                </button>
              </div>
              {form.aliases.length > 0 && (
                <div className="tags-lista" style={{ marginTop: '8px' }}>
                  {form.aliases.map((a) => (
                    <span key={a} className="tag tag--info tag--removivel" onClick={() => removerAlias(a)}>
                      {a} ✕
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="form-grupo form-grupo--full">
              <label className="form-label">Tags</label>
              <div className="alias-input-row">
                <input
                  className="input"
                  value={form.tagInput}
                  onChange={(e) => set('tagInput', e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), adicionarTag())}
                  placeholder="escolar, infantil, papelaria..."
                />
                <button type="button" className="btn btn-ghost btn-sm" onClick={adicionarTag}>
                  + Tag
                </button>
              </div>
              {form.tags.length > 0 && (
                <div className="tags-lista" style={{ marginTop: '8px' }}>
                  {form.tags.map((t) => (
                    <span key={t} className="tag tag--neutro tag--removivel" onClick={() => removerTag(t)}>
                      {t} ✕
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* URL de imagem */}
            <div className="form-grupo form-grupo--full">
              <label className="form-label">URL da Imagem</label>
              <input
                className="input"
                type="url"
                value={form.imagem_url}
                onChange={(e) => set('imagem_url', e.target.value)}
                placeholder="https://..."
              />
            </div>

            {isEdicao && (
              <div className="form-grupo form-grupo--full">
                <label className="form-label-check">
                  <input
                    type="checkbox"
                    checked={form.ativo}
                    onChange={(e) => set('ativo', e.target.checked)}
                  />
                  Produto ativo (visível no catálogo)
                </label>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onFechar} disabled={salvando}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando…' : isEdicao ? '💾 Salvar Alterações' : '+ Criar Produto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export function CatalogPage() {
  const [produtos, setProdutos]         = useState([])
  const [carregando, setCarregando]     = useState(true)
  const [busca, setBusca]               = useState('')
  const [filtroAtivo, setFiltroAtivo]   = useState('ativo')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroMarca, setFiltroMarca]   = useState('')
  const [modalAberto, setModalAberto]   = useState(false)
  const [produtoEditar, setProdutoEditar] = useState(null)
  const [categorias, setCategorias]     = useState([])
  const [marcas, setMarcas]             = useState([])
  const { toast } = useToast()

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const filtros = {}
      if (filtroAtivo === 'ativo')   filtros.ativo = true
      if (filtroAtivo === 'inativo') filtros.ativo = false
      if (filtroCategoria) filtros.categoria = filtroCategoria
      if (filtroMarca) filtros.marca = filtroMarca

      const [data, cats, marcasData] = await Promise.all([
        produtosService.listar(filtros),
        produtosService.listarCategorias(),
        produtosService.listarMarcas(),
      ])
      setProdutos(data)
      setCategorias(cats)
      setMarcas(marcasData)
    } catch (err) {
      toast.erro('Erro ao carregar catálogo: ' + (err.message ?? 'desconhecido'))
    } finally {
      setCarregando(false)
    }
  }, [filtroAtivo, filtroCategoria, filtroMarca, toast])

  useEffect(() => { carregar() }, [carregar])

  const produtosFiltrados = busca
    ? produtos.filter((p) =>
        p.nome?.toLowerCase().includes(busca.toLowerCase()) ||
        p.categoria?.toLowerCase().includes(busca.toLowerCase()) ||
        p.marca?.toLowerCase().includes(busca.toLowerCase()) ||
        p.sku?.toLowerCase().includes(busca.toLowerCase()) ||
        (p.aliases ?? []).some((a) => a.toLowerCase().includes(busca.toLowerCase()))
      )
    : produtos

  async function handleSalvar(dados) {
    if (produtoEditar?.id) {
      await produtosService.atualizar(produtoEditar.id, dados)
    } else {
      await produtosService.criar(dados)
    }
    await carregar()
  }

  async function handleToggleAtivo(produto) {
    try {
      await produtosService.atualizar(produto.id, { ativo: !produto.ativo })
      toast.sucesso(produto.ativo ? 'Produto desativado.' : 'Produto ativado.')
      await carregar()
    } catch (err) {
      toast.erro(err.message ?? 'Erro ao alterar produto.')
    }
  }

  function abrirEdicao(produto) {
    setProdutoEditar(produto)
    setModalAberto(true)
  }

  function abrirNovo() {
    setProdutoEditar(null)
    setModalAberto(true)
  }

  const totalAtivos   = produtos.filter((p) => p.ativo).length
  const totalInativos = produtos.filter((p) => !p.ativo).length
  const semEstoque    = produtos.filter((p) => p.ativo && p.estoque === 0).length

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-info">
          <h1 className="page-titulo">Catálogo de Produtos</h1>
          <p className="page-descricao">Gerencie produtos, preços, estoque e aliases da IA</p>
        </div>
        <div className="page-header-acoes">
          <button className="btn btn-ghost btn-sm" onClick={carregar}>↺ Atualizar</button>
          <button className="btn btn-primary" onClick={abrirNovo}>+ Novo Produto</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="catalog-kpi-row">
        <div className="catalog-kpi">
          <span className="catalog-kpi-valor" style={{ color: 'var(--primary)' }}>{totalAtivos}</span>
          <span className="catalog-kpi-label">Ativos</span>
        </div>
        <div className="catalog-kpi">
          <span className="catalog-kpi-valor" style={{ color: 'var(--text-3)' }}>{totalInativos}</span>
          <span className="catalog-kpi-label">Inativos</span>
        </div>
        <div className="catalog-kpi">
          <span className="catalog-kpi-valor" style={{ color: semEstoque > 0 ? 'var(--warning)' : 'var(--success)' }}>{semEstoque}</span>
          <span className="catalog-kpi-label">Sem Estoque</span>
        </div>
        <div className="catalog-kpi">
          <span className="catalog-kpi-valor" style={{ color: 'var(--text-2)' }}>{produtosFiltrados.length}</span>
          <span className="catalog-kpi-label">Exibidos</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="filtros-painel">
        <div className="filtros-linha">
          <input
            type="text"
            className="input filtros-busca-input"
            placeholder="Buscar nome, categoria, SKU ou alias…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />

          <div className="filtros-grupo">
            {[
              { value: 'ativo',   label: 'Ativos' },
              { value: 'inativo', label: 'Inativos' },
              { value: 'todos',   label: 'Todos' },
            ].map((f) => (
              <button
                key={f.value}
                className={`filtro-btn ${filtroAtivo === f.value ? 'filtro-btn--ativo' : ''}`}
                onClick={() => setFiltroAtivo(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {categorias.length > 0 && (
            <select
              className="input"
              style={{ width: 'auto', minWidth: '160px' }}
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
            >
              <option value="">Todas as categorias</option>
              {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          {marcas.length > 0 && (
            <select
              className="input"
              style={{ width: 'auto', minWidth: '160px' }}
              value={filtroMarca}
              onChange={(e) => setFiltroMarca(e.target.value)}
            >
              <option value="">Todas as marcas</option>
              {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Tabela */}
      <div className="card">
        {carregando ? (
          <LoadingSpinner mensagem="Carregando catálogo..." />
        ) : produtosFiltrados.length === 0 ? (
          <EmptyState
            icone="🏷️"
            titulo="Nenhum produto encontrado"
            descricao={busca ? 'Tente outros termos de busca.' : 'Clique em "+ Novo Produto" para começar.'}
          />
        ) : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th className="tabela-th">Nome</th>
                  <th className="tabela-th">Categoria</th>
                  <th className="tabela-th">SKU</th>
                  <th className="tabela-th">Preço</th>
                  <th className="tabela-th">Estoque</th>
                  <th className="tabela-th">Aliases IA</th>
                  <th className="tabela-th">Status</th>
                  <th className="tabela-th"></th>
                </tr>
              </thead>
              <tbody>
                {produtosFiltrados.map((produto) => (
                  <tr key={produto.id} className={`tabela-row ${!produto.ativo ? 'tabela-row--inativo' : ''}`}>
                    <td className="tabela-cell">
                      <div className="catalog-produto-nome">
                        <strong>{produto.nome}</strong>
                        {produto.descricao && (
                          <span className="catalog-produto-desc">{produto.descricao}</span>
                        )}
                      </div>
                    </td>
                    <td className="tabela-cell">{produto.categoria}</td>
                    <td className="tabela-cell">
                      <code className="codigo">{produto.sku ?? '—'}</code>
                    </td>
                    <td className="tabela-cell">
                      <strong style={{ color: 'var(--success)' }}>{formatCurrency(produto.preco)}</strong>
                    </td>
                    <td className="tabela-cell">
                      <span className={`tag ${produto.estoque > 0 ? 'tag--sucesso' : 'tag--perigo'}`}>
                        {produto.estoque > 0 ? `${produto.estoque} un.` : 'Sem estoque'}
                      </span>
                    </td>
                    <td className="tabela-cell">
                      <div className="tags-lista">
                        {(produto.aliases ?? []).length > 0 ? (
                          (produto.aliases ?? []).slice(0, 2).map((a) => (
                            <span key={a} className="tag tag--info">{a}</span>
                          ))
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                        {(produto.aliases ?? []).length > 2 && (
                          <span className="tag tag--neutro">+{produto.aliases.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="tabela-cell">
                      <span className={`tag ${produto.ativo ? 'tag--sucesso' : 'tag--neutro'}`}>
                        {produto.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="tabela-cell tabela-cell--acoes">
                      <button
                        className="btn btn-ghost btn-xs"
                        title="Editar produto"
                        onClick={() => abrirEdicao(produto)}
                      >
                        ✏️
                      </button>
                      <button
                        className={`btn btn-xs ${produto.ativo ? 'btn-ghost' : 'btn-ghost'}`}
                        title={produto.ativo ? 'Desativar' : 'Ativar'}
                        onClick={() => handleToggleAtivo(produto)}
                      >
                        {produto.ativo ? '⏸' : '▶'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalAberto && (
        <ProdutoModal
          produto={produtoEditar}
          categorias={categorias}
          marcas={marcas}
          onSalvar={handleSalvar}
          onFechar={() => { setModalAberto(false); setProdutoEditar(null) }}
        />
      )}
    </div>
  )
}
