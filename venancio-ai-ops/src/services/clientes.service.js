import { supabase } from '@/supabase/client'
import { normalizarTelefone } from '@/utils/telefone'

const SELECT_CRM = `
  id, nome, telefone, observacoes, origem, status, criado_em, atualizado_em,
  pedidos (id, protocolo, status, valor_total, criado_em),
  orcamentos (id, protocolo, status, valor_total, criado_em)
`

export const clientesService = {
  /** Lista clientes com dados CRM calculados client-side (fallback de listarCrm) */
  async listar(filtros = {}) {
    let query = supabase
      .from('clientes')
      .select(SELECT_CRM)
      .order('criado_em', { ascending: false })
      .limit(200)

    if (filtros.busca) {
      query = query.or(
        `nome.ilike.%${filtros.busca}%,telefone.ilike.%${filtros.busca}%`
      )
    }
    if (filtros.status) {
      query = query.eq('status', filtros.status)
    }

    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(enriquecerCliente)
  },

  /** Lista via view v_clientes_crm (agregados calculados no banco) */
  async listarCrm(filtros = {}) {
    try {
      let query = supabase
        .from('v_clientes_crm')
        .select('*')
        .order('total_gasto', { ascending: false })
        .limit(200)

      if (filtros.busca) {
        query = query.or(`nome.ilike.%${filtros.busca}%,telefone.ilike.%${filtros.busca}%`)
      }
      if (filtros.status) {
        query = query.eq('status', filtros.status)
      }

      const { data, error } = await query
      if (error) throw error
      return data ?? []
    } catch {
      return clientesService.listar(filtros)
    }
  },

  async buscarPorTelefone(telefone) {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('telefone', normalizarTelefone(telefone))
      .maybeSingle()

    if (error) throw error
    return data
  },

  async buscarPorId(id) {
    const { data, error } = await supabase
      .from('clientes')
      .select(`
        *,
        pedidos (
          id, protocolo, status, valor_total, forma_entrega, criado_em
        ),
        orcamentos (
          id, protocolo, status, valor_total, criado_em
        )
      `)
      .eq('id', id)
      .order('criado_em', { referencedTable: 'pedidos', ascending: false })
      .order('criado_em', { referencedTable: 'orcamentos', ascending: false })
      .single()

    if (error) throw error
    return enriquecerCliente(data)
  },

  async criarOuAtualizar(telefone, dadosCliente) {
    const telefoneNormalizado = normalizarTelefone(telefone)
    const existente = await clientesService.buscarPorTelefone(telefoneNormalizado)

    if (existente) {
      const { data, error } = await supabase
        .from('clientes')
        .update(dadosCliente)
        .eq('id', existente.id)
        .select()
        .single()

      if (error) throw error
      return data
    }

    const { data, error } = await supabase
      .from('clientes')
      .insert({ telefone: telefoneNormalizado, ...dadosCliente })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async atualizar(id, dados) {
    const { data, error } = await supabase
      .from('clientes')
      .update(dados)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },
}

function enriquecerCliente(c) {
  if (!c) return c
  const pedidos = c.pedidos ?? []
  const finalizados = pedidos.filter((p) => p.status === 'concluido')

  const total_gasto = finalizados.reduce((a, p) => a + (p.valor_total ?? 0), 0)
  const qtd_pedidos = pedidos.length
  const qtd_finalizados = finalizados.length
  const ticket_medio = qtd_finalizados > 0 ? total_gasto / qtd_finalizados : 0
  const ultima_compra_em = finalizados.length > 0
    ? finalizados.reduce((latest, p) =>
        p.criado_em > latest ? p.criado_em : latest, finalizados[0].criado_em)
    : null
  const ultimo_pedido_em = pedidos.length > 0
    ? pedidos.reduce((latest, p) =>
        p.criado_em > latest ? p.criado_em : latest, pedidos[0].criado_em)
    : null

  return {
    ...c,
    total_gasto,
    qtd_pedidos,
    qtd_finalizados,
    ticket_medio: Math.round(ticket_medio * 100) / 100,
    ultima_compra_em,
    ultimo_pedido_em,
  }
}
