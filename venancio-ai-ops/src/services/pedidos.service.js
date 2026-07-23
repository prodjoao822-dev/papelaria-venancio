import { supabase } from '@/supabase/client'
import { PEDIDOS_POR_PAGINA } from '@/utils/constants'
import {
  derivarStatusDashboard,
  mapStatusRealParaDashboard,
  aplicarFiltroStatusDashboard,
  STATUS_DASHBOARD_PARA_REAL,
} from '@/utils/statusDerivado'
import { orcamentosService } from './orcamentos.service'

const SELECT_PEDIDO_COMPLETO = `
  *,
  clientes (id, nome, telefone, observacoes),
  operadores (id, nome),
  itens_pedido (
    id, nome_item, quantidade, valor_unitario, valor_total, separado, produto_id,
    produtos (id, nome, sku, imagem_url)
  )
`

/** Anexa o status "de vitrine" (8 valores) derivado das colunas reais. */
function normalizarPedido(pedido) {
  if (!pedido) return pedido
  return { ...pedido, status_real: pedido.status, status: derivarStatusDashboard(pedido) }
}

export const pedidosService = {
  async listar(filtros = {}) {
    let query = supabase
      .from('pedidos')
      .select(SELECT_PEDIDO_COMPLETO)
      .order('criado_em', { ascending: false })
      .limit(PEDIDOS_POR_PAGINA)

    if (filtros.status && filtros.status !== 'TODOS') {
      query = aplicarFiltroStatusDashboard(query, filtros.status)
    }
    if (filtros.busca) {
      query = query.or(
        `clientes.nome.ilike.%${filtros.busca}%,clientes.telefone.ilike.%${filtros.busca}%`
      )
    }
    if (filtros.dataInicio) {
      query = query.gte('criado_em', filtros.dataInicio)
    }
    if (filtros.dataFim) {
      const fim = new Date(filtros.dataFim)
      fim.setDate(fim.getDate() + 1)
      query = query.lt('criado_em', fim.toISOString())
    }

    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(normalizarPedido)
  },

  async buscarPorId(id) {
    const { data, error } = await supabase
      .from('pedidos')
      .select(`
        ${SELECT_PEDIDO_COMPLETO},
        pedidos_status_historico (
          id, status_anterior, status_novo, origem, observacao, criado_em,
          operadores (id, nome)
        )
      `)
      .eq('id', id)
      .order('criado_em', { referencedTable: 'pedidos_status_historico', ascending: true })
      .single()

    if (error) throw error
    return normalizarPedido(data)
  },

  /**
   * novoStatusDashboard é um dos 8 valores de vitrine (STATUS em utils/status.js).
   * Internamente escolhe a função certa: RPC de transição de status_pedido
   * (enum de 5 estados) ou as funções de metadado de logística (que não são
   * transição de status, só registram quando ficou pronto/saiu).
   */
  async atualizarStatus(id, novoStatusDashboard, operadorId = null, observacao = null) {
    if (novoStatusDashboard === 'AGUARDANDO_CONFIRMACAO') {
      // Não existe como estado persistido (o checkout do bot já é síncrono) —
      // é só um rótulo de vitrine que dobra em cima de NOVO_PEDIDO.
      return pedidosService.buscarPorId(id)
    }

    if (novoStatusDashboard === 'PRONTO_RETIRADA' || novoStatusDashboard === 'SAIU_ENTREGA') {
      const atual = await pedidosService.buscarPorId(id)
      if (atual.status_real !== 'pronto') {
        const { error: errTransicao } = await supabase.rpc('atualizar_status_pedido_dashboard', {
          p_pedido_id: id,
          p_novo_status: 'pronto',
          p_operador_id: operadorId,
          p_observacao: observacao,
        })
        if (errTransicao) throw errTransicao
      }
      const funcao = novoStatusDashboard === 'PRONTO_RETIRADA'
        ? 'marcar_pronto_retirada_pedido'
        : 'marcar_saiu_entrega_pedido'
      const { error } = await supabase.rpc(funcao, { p_pedido_id: id })
      if (error) throw error
    } else {
      const statusReal = STATUS_DASHBOARD_PARA_REAL[novoStatusDashboard]
      if (!statusReal) throw new Error(`Status "${novoStatusDashboard}" desconhecido`)
      const { error } = await supabase.rpc('atualizar_status_pedido_dashboard', {
        p_pedido_id: id,
        p_novo_status: statusReal,
        p_operador_id: operadorId,
        p_observacao: observacao,
      })
      if (error) throw error
    }

    await notificarN8n('STATUS_ATUALIZADO', { pedidoId: id, novoStatus: novoStatusDashboard, observacao })

    return pedidosService.buscarPorId(id)
  },

  /**
   * "Criar pedido manual" no dashboard não insere em `pedidos` diretamente
   * (orcamento_id é NOT NULL — todo pedido nasce de aceitar_orcamento()).
   * Cria um orçamento tipo venda_geral e aceita na hora.
   */
  async criar(dadosPedido, operadorId = null) {
    const { itens, cliente_id, forma_entrega, endereco_entrega, observacoes } = dadosPedido

    const orcamento = await orcamentosService.criar({
      cliente_id,
      tipo: 'venda_geral',
      status: 'rascunho',
      observacoes,
      itens: (itens ?? []).map((item) => ({
        produto_id: item.produto_id ?? null,
        descricao_livre: item.descricao_livre ?? item.nome_item ?? null,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario ?? item.preco_unitario,
      })),
    })

    const pedido = await orcamentosService.aceitar(orcamento.id, operadorId)

    if (forma_entrega || endereco_entrega) {
      const { error } = await supabase
        .from('pedidos')
        .update({ forma_entrega: forma_entrega ?? 'retirada', endereco_entrega: endereco_entrega ?? null })
        .eq('id', pedido.id)
      if (error) throw error
    }

    await notificarN8n('NOVO_PEDIDO', { pedidoId: pedido.id })

    return pedidosService.buscarPorId(pedido.id)
  },

  async buscarKpis() {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('pedidos')
      .select('status, forma_entrega, pronto_para_retirada_em, saiu_para_entrega_em, criado_em')
      .gte('criado_em', hoje.toISOString())

    if (error) throw error

    const contadores = {}
    ;(data ?? []).forEach((p) => {
      const statusDashboard = derivarStatusDashboard(p)
      contadores[statusDashboard] = (contadores[statusDashboard] ?? 0) + 1
    })

    const { data: total, error: errTotal } = await supabase
      .from('pedidos')
      .select('valor_total')
      .gte('criado_em', hoje.toISOString())
      .eq('status', 'concluido')

    if (errTotal) throw errTotal

    const faturamentoHoje = (total ?? []).reduce((acc, p) => acc + (p.valor_total ?? 0), 0)

    return { contadores, faturamentoHoje }
  },

  async marcarItemSeparado(itemId, separado) {
    const { data, error } = await supabase
      .from('itens_pedido')
      .update({ separado })
      .eq('id', itemId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async marcarTodosItens(pedidoId, separado) {
    const { error } = await supabase
      .from('itens_pedido')
      .update({ separado })
      .eq('pedido_id', pedidoId)

    if (error) throw error
  },
}

export { mapStatusRealParaDashboard }

async function notificarN8n(evento, payload) {
  const base = import.meta.env.VITE_N8N_WEBHOOK_BASE
  if (!base) return

  const endpoints = {
    NOVO_PEDIDO: '/novo-pedido',
    STATUS_ATUALIZADO: '/status-atualizado',
  }

  const url = `${base}${endpoints[evento] ?? ''}`
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evento, ...payload, timestamp: new Date().toISOString() }),
    })
  } catch {
    // n8n offline não deve bloquear a operação
  }
}
