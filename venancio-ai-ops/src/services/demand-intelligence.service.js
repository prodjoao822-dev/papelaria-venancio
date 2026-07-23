import { supabase } from '@/supabase/client'

function assertSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
}

export const demandIntelligenceService = {
  // Top produtos mais procurados nos últimos N dias, com % sem estoque e % conversão
  async topDemanda(dias = 7, limite = 10) {
    assertSupabase()
    const { data, error } = await supabase.rpc('get_top_demanda', {
      p_dias:  dias,
      p_limit: limite,
    })
    if (error) throw error
    return (data ?? []).map((r) => ({
      produto_nome: r.produto_nome,
      produto_id: r.produto_id,
      total_consultas: r.total_consultas,
      sem_estoque_pct: r.total_consultas > 0 ? Math.round((r.sem_estoque_count / r.total_consultas) * 100) : 0,
      converteu_pct: r.total_consultas > 0 ? Math.round((r.converteu_count / r.total_consultas) * 100) : 0,
    }))
  },

  // Oportunidades perdidas: muito procurado mas sem estoque/sem registro
  async oportunidadesPerdidas(dias = 30, limite = 10) {
    assertSupabase()
    const { data, error } = await supabase.rpc('get_oportunidades_perdidas', {
      p_dias:  dias,
      p_limit: limite,
    })
    if (error) throw error
    // Sem estimativa de receita: o produto muitas vezes nem está no catálogo
    // (é justamente por isso que virou "oportunidade perdida"), então não há
    // preço confiável pra multiplicar — melhor omitir do que inventar um número.
    return (data ?? []).map((r) => ({ produto_nome: r.produto_nome, total_consultas: r.total, receita_estimada: 0 }))
  },

  // Lista alertas de demanda
  async listarAlertas(status = 'novo') {
    assertSupabase()
    let query = supabase
      .from('alertas_demanda')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(50)

    if (status !== 'todos') query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map((a) => ({ ...a, created_at: a.criado_em }))
  },

  // Conta alertas novos (para badge no dashboard)
  async contarAlertasNovos() {
    if (!supabase) return 0
    try {
      const { count, error } = await supabase
        .from('alertas_demanda')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'novo')
      if (error) return 0
      return count ?? 0
    } catch {
      return 0
    }
  },

  // Marca alerta como visto
  async marcarVisto(id) {
    assertSupabase()
    const { error } = await supabase
      .from('alertas_demanda')
      .update({ status: 'visto' })
      .eq('id', id)
    if (error) throw error
  },

  // Marca alerta como resolvido
  async marcarResolvido(id) {
    assertSupabase()
    const { error } = await supabase
      .from('alertas_demanda')
      .update({ status: 'resolvido' })
      .eq('id', id)
    if (error) throw error
  },

  // Busca configuração de alertas
  async buscarConfig() {
    assertSupabase()
    const { data, error } = await supabase
      .from('config_alerta_demanda')
      .select('*')
      .eq('nome', 'global')
      .single()
    if (error) throw error
    return data
  },

  // Atualiza configuração de alertas
  async atualizarConfig(dados) {
    assertSupabase()
    const { data, error } = await supabase
      .from('config_alerta_demanda')
      .update({
        limite_consultas: dados.limite_consultas,
        janela_horas:     dados.janela_horas,
        canal_alerta:     dados.canal_alerta,
      })
      .eq('nome', 'global')
      .select()
      .single()
    if (error) throw error
    return data
  },

  // Registra consulta de produto diretamente
  async registrarConsulta(dados) {
    if (!supabase) return null
    try {
      const { data, error } = await supabase
        .from('consultas_demanda')
        .insert({
          produto_nome:      dados.produto_nome,
          produto_id:        dados.produto_id ?? null,
          memoria_produto_id: dados.memory_id ?? null,
          cliente_id:        dados.customer_id ?? null,
          conversa_id:       dados.conversation_id ?? null,
          origem:            dados.source ?? 'dashboard',
          resultado:         dados.resultado ?? 'nao_encontrado',
        })
        .select()
        .single()
      if (error) throw error
      return data
    } catch {
      return null
    }
  },

  // Resumo geral de demanda para KPIs
  async resumo(dias = 7) {
    assertSupabase()
    const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('consultas_demanda')
      .select('resultado, converteu')
      .gte('criado_em', corte)
    if (error) throw error
    const rows = data ?? []
    return {
      total:           rows.length,
      respondidos:     rows.filter((r) => r.resultado === 'respondido_ia').length,
      consultados:     rows.filter((r) => r.resultado === 'consultou_operador').length,
      nao_encontrados: rows.filter((r) => r.resultado === 'nao_encontrado').length,
      sem_estoque:     rows.filter((r) => r.resultado === 'sem_estoque').length,
      convertidos:     rows.filter((r) => r.converteu).length,
    }
  },

  subscribeAlertas(callback) {
    if (!supabase) return { unsubscribe: () => {} }
    const channel = supabase
      .channel('alertas-demanda-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas_demanda' }, callback)
    channel.subscribe()
    return channel
  },
}
