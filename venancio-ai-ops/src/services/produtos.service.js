import { supabase } from '@/supabase/client'

const SELECT_PRODUTO = '*, categorias (id, nome), marcas (id, nome)'

/** produtos.categoria_id/marca_id são FK — o dashboard trabalha com o nome
 * (string), então achatamos categorias.nome/marcas.nome em `categoria`/`marca`
 * pra não precisar mudar os componentes que já leem produto.categoria. */
function achatarProduto(p) {
  if (!p) return p
  const { categorias, marcas, ...resto } = p
  return {
    ...resto,
    categoria: categorias?.nome ?? null,
    categoria_id: p.categoria_id,
    marca: marcas?.nome ?? null,
    marca_id: p.marca_id,
  }
}

async function resolverLookupId(tabela, nome) {
  if (!nome) return null
  // .ilike (não .eq): "Faber-Castell" e "faber-castell" são a mesma marca —
  // sem isso, cada variação de maiúscula/minúscula virava uma linha nova,
  // fragmentando os filtros do Catálogo em duplicatas silenciosas.
  const { data: existente, error: errBusca } = await supabase
    .from(tabela)
    .select('id')
    .ilike('nome', nome)
    .maybeSingle()
  if (errBusca) throw errBusca
  if (existente) return existente.id

  const { data: novo, error: errCriar } = await supabase
    .from(tabela)
    .insert({ nome })
    .select('id')
    .single()
  if (errCriar) throw errCriar
  return novo.id
}

async function listarNomes(tabela) {
  const { data, error } = await supabase
    .from(tabela)
    .select('id, nome')
    .order('nome', { ascending: true })

  if (error) throw error
  return data ?? []
}

async function criarLookup(tabela, nome) {
  const { data, error } = await supabase
    .from(tabela)
    .insert({ nome: nome.trim() })
    .select()
    .single()

  if (error) throw error
  return data
}

async function renomearLookup(tabela, id, novoNome) {
  const { data, error } = await supabase
    .from(tabela)
    .update({ nome: novoNome.trim() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

async function excluirLookup(tabela, id, labelSingular) {
  const { error } = await supabase.from(tabela).delete().eq('id', id)
  if (error) {
    if (error.code === '23503') {
      throw new Error(`${labelSingular} em uso por um ou mais produtos — remova ou reatribua os produtos antes de excluir.`)
    }
    throw error
  }
}

// Resolve duplicatas (ex.: "Faber-Castell" x "faber castell" criadas antes do
// match ficar case-insensitive em resolverLookupId): reatribui todo produto
// da origem pro destino, depois apaga a origem. Nunca perde produto — o
// update roda antes do delete, e se o update falhar o delete não acontece.
async function mesclarLookup(tabela, colunaFk, origemId, destinoId) {
  if (origemId === destinoId) throw new Error('Escolha um destino diferente da origem.')
  const { error: errUpdate } = await supabase
    .from('produtos')
    .update({ [colunaFk]: destinoId })
    .eq(colunaFk, origemId)
  if (errUpdate) throw errUpdate

  const { error: errDelete } = await supabase.from(tabela).delete().eq('id', origemId)
  if (errDelete) throw errDelete
}

export const produtosService = {
  async listar(filtros = {}) {
    let query = supabase
      .from('produtos')
      .select(SELECT_PRODUTO)
      .order('nome', { ascending: true })

    if (filtros.ativo !== undefined) {
      query = query.eq('ativo', filtros.ativo)
    }
    if (filtros.busca) {
      query = query.or(`nome.ilike.%${filtros.busca}%,sku.ilike.%${filtros.busca}%`)
    }

    const { data, error } = await query
    if (error) throw error
    let produtos = (data ?? []).map(achatarProduto)
    if (filtros.categoria) produtos = produtos.filter((p) => p.categoria === filtros.categoria)
    if (filtros.marca) produtos = produtos.filter((p) => p.marca === filtros.marca)
    return produtos
  },

  async buscarPorId(id) {
    const { data, error } = await supabase
      .from('produtos')
      .select(SELECT_PRODUTO)
      .eq('id', id)
      .single()

    if (error) throw error
    return achatarProduto(data)
  },

  async listarCategorias() {
    const rows = await listarNomes('categorias')
    return rows.map((c) => c.nome)
  },

  async listarMarcas() {
    const rows = await listarNomes('marcas')
    return rows.map((m) => m.nome)
  },

  // ── Gerenciamento explícito (tela Marcas & Categorias) ──────────────────────
  async listarCategoriasDetalhado() { return listarNomes('categorias') },
  async criarCategoria(nome) { return criarLookup('categorias', nome) },
  async renomearCategoria(id, novoNome) { return renomearLookup('categorias', id, novoNome) },
  async excluirCategoria(id) { return excluirLookup('categorias', id, 'Categoria') },
  async mesclarCategoria(origemId, destinoId) { return mesclarLookup('categorias', 'categoria_id', origemId, destinoId) },

  async listarMarcasDetalhado() { return listarNomes('marcas') },
  async criarMarca(nome) { return criarLookup('marcas', nome) },
  async renomearMarca(id, novoNome) { return renomearLookup('marcas', id, novoNome) },
  async excluirMarca(id) { return excluirLookup('marcas', id, 'Marca') },
  async mesclarMarca(origemId, destinoId) { return mesclarLookup('marcas', 'marca_id', origemId, destinoId) },

  async criar(dados) {
    const { categoria, marca, ...resto } = dados
    const [categoria_id, marca_id] = await Promise.all([
      resolverLookupId('categorias', categoria),
      resolverLookupId('marcas', marca),
    ])

    const { data, error } = await supabase
      .from('produtos')
      .insert({ ...resto, categoria_id, marca_id })
      .select(SELECT_PRODUTO)
      .single()

    if (error) throw error
    return achatarProduto(data)
  },

  async atualizar(id, dados) {
    const { categoria, marca, ...resto } = dados
    const payload = { ...resto }
    if (categoria !== undefined) {
      payload.categoria_id = await resolverLookupId('categorias', categoria)
    }
    if (marca !== undefined) {
      payload.marca_id = await resolverLookupId('marcas', marca)
    }

    const { data, error } = await supabase
      .from('produtos')
      .update(payload)
      .eq('id', id)
      .select(SELECT_PRODUTO)
      .single()

    if (error) throw error
    return achatarProduto(data)
  },

  async atualizarEstoque(id, quantidade) {
    const { data, error } = await supabase
      .from('produtos')
      .update({ estoque: quantidade })
      .eq('id', id)
      .select(SELECT_PRODUTO)
      .single()

    if (error) throw error
    return achatarProduto(data)
  },
}
