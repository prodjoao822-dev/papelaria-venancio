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
}
