import { supabase } from '@/supabase/client'

export const metricasService = {
  async buscarHistorico7Dias() {
    const dias = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      d.setHours(0, 0, 0, 0)
      return d
    })

    const resultados = await Promise.all(
      dias.map(async (dia) => {
        const inicio = dia.toISOString()
        const fim = new Date(dia.getTime() + 86400000).toISOString()
        const { data } = await supabase
          .from('pedidos')
          .select('valor_total')
          .gte('criado_em', inicio)
          .lt('criado_em', fim)
          .eq('status', 'concluido')
        const valor = (data ?? []).reduce((acc, p) => acc + (p.valor_total ?? 0), 0)
        return {
          dia,
          label: dia.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }),
          valor,
        }
      })
    )

    return resultados
  },

  async buscarMetricasComerciais() {
    const { data, error } = await supabase.rpc('get_metricas_comerciais')
    if (!error && data) return data
    return metricasService._calcularClientSide()
  },

  async _calcularClientSide() {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    const ontem = new Date(hoje)
    ontem.setDate(ontem.getDate() - 1)

    const mesInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)

    const [pedidosHoje, pedidosOntem, pedidosMes, clientes, orcamentosMes] = await Promise.all([
      supabase
        .from('pedidos')
        .select('status, valor_total')
        .gte('criado_em', hoje.toISOString()),
      supabase
        .from('pedidos')
        .select('status, valor_total')
        .gte('criado_em', ontem.toISOString())
        .lt('criado_em', hoje.toISOString()),
      supabase
        .from('pedidos')
        .select('status, valor_total')
        .gte('criado_em', mesInicio.toISOString()),
      supabase
        .from('clientes')
        .select('id, status'),
      supabase
        .from('orcamentos')
        .select('status')
        .gte('criado_em', mesInicio.toISOString()),
    ])

    const calc = (rows, statusFilter = null) =>
      (rows ?? []).filter((p) => !statusFilter || p.status === statusFilter)

    const ph = pedidosHoje.data ?? []
    const po = pedidosOntem.data ?? []
    const pm = pedidosMes.data ?? []
    const om = orcamentosMes.data ?? []

    const fatHoje = calc(ph, 'concluido').reduce((a, p) => a + (p.valor_total ?? 0), 0)
    const fatOntem = calc(po, 'concluido').reduce((a, p) => a + (p.valor_total ?? 0), 0)
    const fatMes = calc(pm, 'concluido').reduce((a, p) => a + (p.valor_total ?? 0), 0)

    const finalizadosTodos = pm.filter((p) => p.status === 'concluido')
    const ticketMedio = finalizadosTodos.length
      ? finalizadosTodos.reduce((a, p) => a + (p.valor_total ?? 0), 0) / finalizadosTodos.length
      : 0

    const totalOrc = om.length
    const aceitos = om.filter((o) => o.status === 'aceito').length
    const conversaoRate = totalOrc > 0 ? Math.round((aceitos / totalOrc) * 100 * 10) / 10 : 0

    return {
      pedidos_hoje:     ph.length,
      pedidos_ontem:    po.length,
      pedidos_mes:      pm.length,
      fat_hoje:         fatHoje,
      fat_ontem:        fatOntem,
      fat_mes:          fatMes,
      finalizados_hoje: calc(ph, 'concluido').length,
      cancelados_hoje:  calc(ph, 'cancelado').length,
      clientes_ativos:  (clientes.data ?? []).filter((c) => c.status === 'ativo').length,
      ticket_medio:     Math.round(ticketMedio * 100) / 100,
      orcamentos_hoje:  (orcamentosMes.data ?? []).length,
      conversao_rate:   conversaoRate,
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MÉTRICAS DE CAPACIDADE OPERACIONAL (PROMPT-01)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Taxa de resolução IA — % de conversas encerradas 100% pelo bot/agentes IA,
   * sem nenhuma intervenção humana.
   *
   * Fonte: tabela `mensagens` (remetente='humano'), não `conversas.operador_id` —
   * esse campo é zerado sempre que a conversa é liberada de volta pra IA
   * (liberarConversa/toggleIA em atendimento.service.js e definirBotAtivo no bot),
   * então uma conversa que JÁ teve atendimento humano e foi devolvida à IA voltaria
   * a contar como "resolvida por IA" se usássemos operador_id como critério.
   *
   * @param {'dia'|'semana'} granularidade
   * @returns {Promise<{ total: number, resolvidas_ia: number, taxa: number }>}
   */
  async getTaxaResolucaoIA(granularidade = 'dia') {
    const agora = new Date()
    const inicio = new Date(agora)

    if (granularidade === 'semana') {
      inicio.setDate(inicio.getDate() - 7)
    } else {
      inicio.setHours(0, 0, 0, 0)
    }

    // Conversas com atividade no período
    const { data: todas, error: errTodas } = await supabase
      .from('conversas')
      .select('id')
      .gte('ultima_interacao_em', inicio.toISOString())

    if (errTodas) throw errTodas

    const ids = (todas ?? []).map((c) => c.id)
    const total = ids.length
    if (total === 0) return { total: 0, resolvidas_ia: 0, taxa: 0 }

    // Conversas do período que tiveram ao menos 1 mensagem de operador
    const { data: comHumano, error: errMsg } = await supabase
      .from('mensagens')
      .select('conversa_id')
      .eq('remetente', 'humano')
      .in('conversa_id', ids)

    if (errMsg) throw errMsg

    const conversasComHumano = new Set((comHumano ?? []).map((m) => m.conversa_id))
    const resolvidasIA = total - conversasComHumano.size
    const taxa = Math.round((resolvidasIA / total) * 1000) / 10

    return { total, resolvidas_ia: resolvidasIA, taxa }
  },

  /**
   * Tempo médio de atendimento por operador — intervalo entre criação do pedido
   * e a chegada ao status 'concluido' em pedidos_status_historico.
   *
   * @returns {Promise<Array<{ operador_nome: string, tempo_medio_min: number, total_pedidos: number }>>}
   */
  async getTempoMedioAtendimento() {
    // Busca pedidos concluídos com seu histórico de status
    const { data: historico, error: errHist } = await supabase
      .from('pedidos_status_historico')
      .select('pedido_id, status_novo, criado_em, pedidos(id, criado_em, operador_id, operadores(nome))')
      .eq('status_novo', 'concluido')

    if (errHist) throw errHist

    // Agrupa por operador
    const porOperador = {}
    for (const h of (historico ?? [])) {
      const pedido = h.pedidos
      if (!pedido) continue

      const operadorNome = pedido.operadores?.nome ?? 'Sem operador'
      const inicio = new Date(pedido.criado_em)
      const fim = new Date(h.criado_em)
      const diffMin = (fim - inicio) / (1000 * 60)

      if (!porOperador[operadorNome]) {
        porOperador[operadorNome] = { soma: 0, count: 0 }
      }
      porOperador[operadorNome].soma += diffMin
      porOperador[operadorNome].count += 1
    }

    return Object.entries(porOperador).map(([nome, { soma, count }]) => ({
      operador_nome: nome,
      tempo_medio_min: Math.round(soma / count),
      total_pedidos: count,
    }))
  },

  /**
   * Tempo médio de separação — intervalo entre o separador iniciar (iniciada_em,
   * setado por `iniciar_separacao` no banco) e concluir (concluida_em, setado por
   * `concluir_separacao`). Não usa criado_em/atualizado_em: criado_em é o momento
   * da delegação (antes do separador sequer começar) e atualizado_em pode mudar por
   * qualquer edição — nenhum dos dois mede o tempo de separação em si.
   *
   * @returns {Promise<{ tempo_medio_min: number, total_separacoes: number }>}
   */
  async getTempoMedioSeparacao() {
    const { data, error } = await supabase
      .from('solicitacoes_separacao')
      .select('iniciada_em, concluida_em, status')
      .eq('status', 'pronta')

    if (error) throw error

    const separacoes = (data ?? []).filter((s) => s.iniciada_em && s.concluida_em)

    if (separacoes.length === 0) {
      return { tempo_medio_min: 0, total_separacoes: 0 }
    }

    const somaMin = separacoes.reduce((acc, s) => {
      const diff = (new Date(s.concluida_em) - new Date(s.iniciada_em)) / (1000 * 60)
      return acc + diff
    }, 0)

    return {
      tempo_medio_min: Math.round(somaMin / separacoes.length),
      total_separacoes: separacoes.length,
    }
  },

  /**
   * Volume por período — mensagens/dia, conversas únicas/dia, pedidos/dia.
   * Retorna os últimos 7 dias com contadores por dia.
   *
   * @returns {Promise<Array<{ dia: string, label: string, conversas: number, pedidos: number }>>}
   */
  async getVolumePeriodo() {
    const dias = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      d.setHours(0, 0, 0, 0)
      return d
    })

    const resultados = await Promise.all(
      dias.map(async (dia) => {
        const inicio = dia.toISOString()
        const fim = new Date(dia.getTime() + 86400000).toISOString()

        const [conversasRes, pedidosRes] = await Promise.all([
          supabase
            .from('conversas')
            .select('id', { count: 'exact', head: true })
            .gte('ultima_interacao_em', inicio)
            .lt('ultima_interacao_em', fim),
          supabase
            .from('pedidos')
            .select('id', { count: 'exact', head: true })
            .gte('criado_em', inicio)
            .lt('criado_em', fim),
        ])

        return {
          dia: dia.toISOString().slice(0, 10),
          label: dia.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }),
          conversas: conversasRes.count ?? 0,
          pedidos: pedidosRes.count ?? 0,
        }
      })
    )

    return resultados
  },
}
