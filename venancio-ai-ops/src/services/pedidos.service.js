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
  responsavel_separacao:funcionarios!responsavel_separacao_id (id, nome),
  responsavel_entrega:funcionarios!responsavel_entrega_id (id, nome),
  listas_modelo (id, ano, escolas (id, nome)),
  itens_pedido (
    id, nome_item, quantidade, valor_unitario, valor_total, separado, produto_id,
    tipo_observacao, observacao,
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
      // PostgREST não aceita referenciar coluna de tabela embutida
      // (clientes.nome) dentro de um .or() — nem com clientes!inner (testado
      // ao vivo contra a API real: sempre retorna PGRST100 "failed to parse
      // logic tree", erro que quem chama engolia e mostrava lista vazia,
      // parecendo "busca não encontra por nome"). Único jeito é buscar
      // clientes primeiro e depois filtrar pedidos só por colunas da própria
      // tabela (protocolo, cliente_id) — os dois lados do .or() abaixo nunca
      // tocam uma tabela embutida.
      const termoBusca = filtros.busca.trim()
      const { data: clientesMatch, error: errClientes } = await supabase
        .from('clientes')
        .select('id')
        .or(`nome.ilike.%${termoBusca}%,telefone.ilike.%${termoBusca}%`)
      if (errClientes) throw errClientes
      const clienteIds = (clientesMatch ?? []).map((c) => c.id)

      query = supabase
        .from('pedidos')
        .select(SELECT_PEDIDO_COMPLETO)
        .order('criado_em', { ascending: false })
        .limit(PEDIDOS_POR_PAGINA)
      if (filtros.status && filtros.status !== 'TODOS') {
        query = aplicarFiltroStatusDashboard(query, filtros.status)
      }
      query = clienteIds.length > 0
        ? query.or(`protocolo.ilike.%${termoBusca}%,cliente_id.in.(${clienteIds.join(',')})`)
        : query.ilike('protocolo', `%${termoBusca}%`)
      if (filtros.dataInicio) query = query.gte('criado_em', filtros.dataInicio)
      if (filtros.dataFim) {
        const fim = new Date(filtros.dataFim)
        fim.setDate(fim.getDate() + 1)
        query = query.lt('criado_em', fim.toISOString())
      }
      const { data, error } = await query
      if (error) throw error
      return (data ?? []).map(normalizarPedido)
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

  /** Busca rápida pra autocomplete global (Header): protocolo, nome ou telefone do cliente. */
  async buscarRapido(termo) {
    if (!termo || termo.trim().length < 2) return []

    const t = termo.trim()
    // Mesma limitação do PostgREST documentada em `listar()`: não dá pra
    // referenciar clientes.nome/telefone dentro de um .or() (mesmo com
    // !inner) — busca clientes primeiro, filtra pedidos só por colunas
    // próprias (protocolo, cliente_id).
    const { data: clientesMatch, error: errClientes } = await supabase
      .from('clientes')
      .select('id')
      .or(`nome.ilike.%${t}%,telefone.ilike.%${t}%`)
    if (errClientes) throw errClientes
    const clienteIds = (clientesMatch ?? []).map((c) => c.id)

    let query = supabase
      .from('pedidos')
      .select(`
        id, protocolo, valor_total, criado_em, status, forma_entrega,
        pronto_para_retirada_em, saiu_para_entrega_em,
        clientes (nome, telefone)
      `)
      .order('criado_em', { ascending: false })
      .limit(8)

    query = clienteIds.length > 0
      ? query.or(`protocolo.ilike.%${t}%,cliente_id.in.(${clienteIds.join(',')})`)
      : query.ilike('protocolo', `%${t}%`)

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
    const {
      itens, cliente_id, forma_entrega, endereco_entrega, observacoes,
      // RF-02 (Fase 3): campos de pagamento, opcionais — sem eles o pedido
      // nasce com status_pagamento default ('pendente') e forma_pagamento nula.
      forma_pagamento, status_pagamento, horario_previsto,
    } = dadosPedido

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

    const camposExtras = {}
    if (forma_entrega || endereco_entrega) {
      camposExtras.forma_entrega = forma_entrega ?? 'retirada'
      camposExtras.endereco_entrega = endereco_entrega ?? null
    }
    if (forma_pagamento) camposExtras.forma_pagamento = forma_pagamento
    if (status_pagamento) camposExtras.status_pagamento = status_pagamento
    if (horario_previsto) camposExtras.horario_previsto = horario_previsto

    if (Object.keys(camposExtras).length > 0) {
      const { error } = await supabase
        .from('pedidos')
        .update(camposExtras)
        .eq('id', pedido.id)
      if (error) throw error
    }

    await notificarN8n('NOVO_PEDIDO', { pedidoId: pedido.id })

    return pedidosService.buscarPorId(pedido.id)
  },

  /**
   * Edita os 3 campos de pagamento (RF-02) de um pedido já existente —
   * UPDATE comum via supabase-js (não é status crítico de fluxo, não tem
   * RPC dedicada; a policy `operadores_atualizacao` já cobre).
   */
  async atualizarPagamento(pedidoId, { forma_pagamento, status_pagamento, horario_previsto }) {
    const { data, error } = await supabase
      .from('pedidos')
      .update({ forma_pagamento, status_pagamento, horario_previsto })
      .eq('id', pedidoId)
      .select()
      .single()

    if (error) throw error
    return data
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

  /** tipo: 'separacao' | 'entrega'. Chama a RPC (registra no histórico do pedido). */
  async atribuirResponsavel(pedidoId, tipo, funcionarioId, operadorId = null) {
    const { data, error } = await supabase.rpc('atribuir_responsavel_pedido', {
      p_pedido_id: pedidoId,
      p_tipo: tipo,
      p_funcionario_id: funcionarioId,
      p_operador_id: operadorId,
    })
    if (error) throw error
    return data
  },

  /** Campos da Ficha de Separação por item: { tipo_observacao?, observacao? }. */
  async atualizarItemFicha(itemId, dados) {
    const { data, error } = await supabase
      .from('itens_pedido')
      .update(dados)
      .eq('id', itemId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /** Sequência/Operação do ShopControl, sempre opcionais e editáveis a qualquer momento. */
  async atualizarSequencia(pedidoId, { sequencia, operacao }) {
    const { data, error } = await supabase
      .from('pedidos')
      .update({ sequencia, operacao })
      .eq('id', pedidoId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Retiradas agendadas: pedidos com horario_retirada_previsto preenchido e
   * status 'pronto' ou 'em_separacao'. Ordenados por horário (mais próximo primeiro).
   * Inclui apenas retiradas das últimas 4 horas em diante (evita acumular histórico).
   *
   * MIGRATION SQL necessária (executar no Supabase, uma vez):
   *   ALTER TABLE pedidos
   *     ADD COLUMN IF NOT EXISTS horario_retirada_previsto timestamptz DEFAULT NULL;
   */
  async listarRetiradas() {
    const { data, error } = await supabase
      .from('pedidos')
      .select(`
        id, protocolo, valor_total, status, forma_entrega,
        horario_retirada_previsto,
        pronto_para_retirada_em, saiu_para_entrega_em,
        clientes (id, nome, telefone),
        itens_pedido (id, nome_item, quantidade)
      `)
      .not('horario_retirada_previsto', 'is', null)
      .in('status', ['pronto', 'em_separacao'])
      .gte(
        'horario_retirada_previsto',
        new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
      )
      .order('horario_retirada_previsto', { ascending: true })

    if (error) throw error
    return (data ?? []).map(normalizarPedido)
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
  const token = import.meta.env.VITE_N8N_STATUS_WEBHOOK_TOKEN
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // O webhook de status-atualizado passou a exigir auth (AUDITORIA_INTEGRACAO.md,
        // item 4). Como isto roda no navegador, este token é público (qualquer VITE_*
        // é visível no bundle) — barra flood/scan automatizado, não é segredo forte.
        ...(token ? { 'x-n8n-webhook-token': token } : {}),
      },
      body: JSON.stringify({ evento, ...payload, timestamp: new Date().toISOString() }),
    })
  } catch {
    // n8n offline não deve bloquear a operação
  }
}
