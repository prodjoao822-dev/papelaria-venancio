import { supabase } from '@/supabase/client'

const SELECT_PRODUTO = '*, categorias (id, nome)'

/** produtos.categoria_id é FK pra categorias — o dashboard trabalha com o
 * nome da categoria (string), então achatamos categorias.nome em `categoria`
 * pra não precisar mudar os componentes que já leem produto.categoria. */
function achatarCategoria(p) {
  if (!p) return p
  const { categorias, ...resto } = p
  return { ...resto, categoria: categorias?.nome ?? null, categoria_id: p.categoria_id }
}

async function resolverCategoriaId(nomeCategoria) {
  if (!nomeCategoria) return null
  const { data: existente, error: errBusca } = await supabase
    .from('categorias')
    .select('id')
    .eq('nome', nomeCategoria)
    .maybeSingle()
  if (errBusca) throw errBusca
  if (existente) return existente.id

  const { data: nova, error: errCriar } = await supabase
    .from('categorias')
    .insert({ nome: nomeCategoria })
    .select('id')
    .single()
  if (errCriar) throw errCriar
  return nova.id
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
    const produtos = (data ?? []).map(achatarCategoria)
    return filtros.categoria
      ? produtos.filter((p) => p.categoria === filtros.categoria)
      : produtos
  },

  async buscarPorId(id) {
    const { data, error } = await supabase
      .from('produtos')
      .select(SELECT_PRODUTO)
      .eq('id', id)
      .single()

    if (error) throw error
    return achatarCategoria(data)
  },

  async listarCategorias() {
    const { data, error } = await supabase
      .from('categorias')
      .select('nome')
      .order('nome', { ascending: true })

    if (error) throw error
    return (data ?? []).map((c) => c.nome)
  },

  async criar(dados) {
    const { categoria, ...resto } = dados
    const categoria_id = await resolverCategoriaId(categoria)

    const { data, error } = await supabase
      .from('produtos')
      .insert({ ...resto, categoria_id })
      .select(SELECT_PRODUTO)
      .single()

    if (error) throw error
    return achatarCategoria(data)
  },

  async atualizar(id, dados) {
    const { categoria, ...resto } = dados
    const payload = { ...resto }
    if (categoria !== undefined) {
      payload.categoria_id = await resolverCategoriaId(categoria)
    }

    const { data, error } = await supabase
      .from('produtos')
      .update(payload)
      .eq('id', id)
      .select(SELECT_PRODUTO)
      .single()

    if (error) throw error
    return achatarCategoria(data)
  },

  async atualizarEstoque(id, quantidade) {
    const { data, error } = await supabase
      .from('produtos')
      .update({ estoque: quantidade })
      .eq('id', id)
      .select(SELECT_PRODUTO)
      .single()

    if (error) throw error
    return achatarCategoria(data)
  },
}
