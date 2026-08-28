import { supabase } from '@/supabase/client'

function assertSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
}

// ── Confidence ────────────────────────────────────────────────────────────────

const CONFIDENCE_ALTA  = 75
const CONFIDENCE_MEDIA = 45

export function calcularNivelConfianca(score) {
  if (score >= CONFIDENCE_ALTA)  return 'alta'
  if (score >= CONFIDENCE_MEDIA) return 'media'
  return 'baixa'
}

// Extrai preço de texto de resposta do operador
// Ex: "Tem sim, R$159,90. Temos 3 unidades."
export function extrairPrecoDeTexto(texto) {
  if (!texto) return null
  const match = texto.match(/R\$\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/)
  if (!match) return null
  const raw = match[1].replace(/\./g, '').replace(',', '.')
  const num = parseFloat(raw)
  return isNaN(num) ? null : num
}

// Extrai disponibilidade de texto de resposta do operador
export function extrairDisponibilidadeDeTexto(texto) {
  if (!texto) return null
  const t = texto.toLowerCase()
  if (/\b(tem\s|temos|disponív|disponiv|sim,|tenho|há\s|ha\s|acabou de chegar)\b/.test(t) &&
      !/\b(não\s*tem|nao\s*tem|sem\s*estoque|esgotado|indisponív|acabou\b)\b/.test(t)) {
    return 'disponivel'
  }
  if (/\b(não\s*tem|nao\s*tem|esgotado|sem\s*estoque|indisponív|indisponiv|acabou\b)\b/.test(t)) {
    return 'indisponivel'
  }
  return null
}

// `memoria_produtos.confirmado_por` é uuid (FK pra operadores), não mais texto
// livre — normaliza pro nome do operador só pra exibição.
const SELECT_MEMORIA = `
  *,
  produto_ref:produtos(id, nome, preco, estoque),
  confirmado_por_op:operadores!confirmado_por(nome),
  confirmacoes:confirmacoes_produto(id, disponibilidade, preco_confirmado, criado_em, operador:operadores(nome))
`

function normalizarMemoria(m) {
  if (!m) return m
  return {
    ...m,
    confirmado_por: m.confirmado_por_op?.nome ?? null,
    confirmacoes: (m.confirmacoes ?? []).map((c) => ({
      ...c,
      operador: c.operador?.nome ?? 'sistema',
      created_at: c.criado_em,
    })),
    nivel_confianca: calcularNivelConfianca(m.confidence_score ?? 50),
  }
}

export const productEngineService = {
  // Busca produto por nome no catálogo com score de similaridade (pg_trgm)
  async buscarProduto(nome) {
    assertSupabase()
    const { data, error } = await supabase.rpc('buscar_produto_fuzzy', {
      p_nome:  nome,
      p_limit: 5,
    })
    if (error) throw error
    return (data ?? []).map((r) => ({
      ...r,
      nivel_confianca: calcularNivelConfianca(r.confidence_score ?? 50),
    }))
  },

  // Registra interesse de produto para demand tracking (upserta memoria_produtos)
  async registrarConsulta(dados) {
    if (!supabase) return null
    try {
      const { data, error } = await supabase.rpc('registrar_demanda_produto', {
        p_produto_nome: dados.nome,
        p_produto_id:   dados.produto_id ?? null,
        p_cliente_id:   dados.customer_id ?? null,
        p_conversa_id:  dados.conversation_id ?? null,
        p_origem:       dados.source ?? 'dashboard',
        p_resultado:    dados.resultado ?? 'nao_encontrado',
      })
      if (error) throw error
      return data
    } catch {
      return null
    }
  },

  // Aprende de resposta do operador — resolve/cria a memoria_produtos por
  // nome e grava a confirmação (aprender_de_resposta_operador espera o id
  // da memória, não o nome — resolve isso aqui pra manter a chamada simples
  // pra quem usa o service).
  async aprenderDeResposta(dados) {
    assertSupabase()
    let { data: memoria, error: errBusca } = await supabase
      .from('memoria_produtos')
      .select('id')
      .ilike('nome', dados.produto_nome)
      .maybeSingle()
    if (errBusca) throw errBusca

    if (!memoria) {
      const { data: nova, error: errCriar } = await supabase
        .from('memoria_produtos')
        .insert({ nome: dados.produto_nome })
        .select('id')
        .single()
      if (errCriar) throw errCriar
      memoria = nova
    }

    const { data, error } = await supabase.rpc('aprender_de_resposta_operador', {
      p_memoria_produto_id: memoria.id,
      p_disponibilidade:    dados.disponibilidade ?? 'disponivel',
      p_preco:              dados.preco ?? null,
      p_operador_id:        dados.operadorId ?? null,
      p_observacao:         dados.observacao ?? null,
      p_origem:             dados.origem ?? 'manual',
    })
    if (error) throw error
    return data
  },

  // Lista toda a memória de produtos (para a página de gerenciamento)
  async listarMemoria(filtros = {}) {
    assertSupabase()
    let query = supabase
      .from('memoria_produtos')
      .select(SELECT_MEMORIA)
      .order('atualizado_em', { ascending: false })
      .limit(filtros.limite ?? 100)

    if (filtros.disponibilidade) query = query.eq('disponibilidade', filtros.disponibilidade)
    if (filtros.confiancaMinima)  query = query.gte('confidence_score', filtros.confiancaMinima)
    if (filtros.busca) query = query.ilike('nome', `%${filtros.busca}%`)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(normalizarMemoria)
  },

  // Atualiza entrada de memória manualmente (disponibilidade/preço/score/observações
  // — confirmado_por passa a ser preenchido só via aprenderDeResposta, com o
  // operador logado, não mais digitado à mão)
  async atualizarMemoria(id, dados) {
    assertSupabase()
    const payload = {}
    if (dados.disponibilidade !== undefined) {
      payload.disponibilidade = dados.disponibilidade
      payload.ultima_confirmacao = new Date().toISOString()
    }
    if (dados.ultimo_preco !== undefined) payload.ultimo_preco = dados.ultimo_preco
    if (dados.observacoes !== undefined) payload.observacoes = dados.observacoes
    if (dados.confidence_score !== undefined) payload.confidence_score = dados.confidence_score

    const { data, error } = await supabase
      .from('memoria_produtos')
      .update(payload)
      .eq('id', id)
      .select(SELECT_MEMORIA)
      .single()
    if (error) throw error
    return normalizarMemoria(data)
  },

  // Vincula entrada de memória a produto do catálogo
  async vincularAoCatalogo(memoryId, produtoId) {
    assertSupabase()
    const { data, error } = await supabase
      .from('memoria_produtos')
      .update({ produto_id: produtoId })
      .eq('id', memoryId)
      .select(SELECT_MEMORIA)
      .single()
    if (error) throw error
    return normalizarMemoria(data)
  },

  // Adiciona relacionamento entre produtos (similar/substituto) — produtoId é
  // obrigatório (produtos_relacionados.produto_id é NOT NULL no schema real).
  async adicionarRelacionamento(dados) {
    assertSupabase()
    const { data, error } = await supabase
      .from('produtos_relacionados')
      .insert({
        produto_id: dados.produto_id,
        relacionado_id: dados.relacionado_id ?? null,
        relacionado_nome_livre: dados.relacionado_nome_livre ?? null,
        tipo: dados.tipo ?? 'similar',
        criado_por: dados.criado_por ?? null,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async buscarRelacionamentos(produtoId) {
    assertSupabase()
    const { data, error } = await supabase
      .from('produtos_relacionados')
      .select('*, relacionado:produtos!relacionado_id(id, nome)')
      .eq('produto_id', produtoId)
      .order('criado_em', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async removerRelacionamento(id) {
    assertSupabase()
    const { error } = await supabase
      .from('produtos_relacionados')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  subscribe(callback) {
    if (!supabase) return { unsubscribe: () => {} }
    const channel = supabase
      .channel('memoria-produtos-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memoria_produtos' }, callback)
    channel.subscribe()
    return channel
  },
}
