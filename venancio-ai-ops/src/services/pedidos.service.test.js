// Testes de pedidos.service.js — foco nas áreas sensíveis (T4.2, plano de
// 26-08): a máquina de status "de vitrine" (atualizarStatus) e o dinheiro
// (buscarKpis), mais o fluxo de criação manual (orçamento → pedido).
//
// Dublê do Supabase: `supabase.from(tabela)` devolve uma chain "thenable"
// (métodos encadeiam e devolvem a própria chain; `await` nela dispara
// `.then()`; `.single()` devolve uma Promise à parte, como o cliente real).
// Cada método é um vi.fn() pra permitir inspecionar os argumentos recebidos
// (ex.: qual UPDATE foi feito, qual RPC e com quais parâmetros).
//
// notificarN8n() usa fetch direto pra uma URL que HOJE está preenchida no
// .env real (VITE_N8N_WEBHOOK_BASE aponta pra produção) — vitest carrega o
// .env de verdade (confirmado ao vivo). Sem stub de fetch, estes testes
// disparariam requisições reais contra o n8n de produção. `fetch` é sempre
// mockado globalmente por isso, mesmo nos testes que não verificam a chamada.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('./orcamentos.service', () => ({
  orcamentosService: { criar: vi.fn(), aceitar: vi.fn() },
}))

import { supabase } from '@/supabase/client'
import { orcamentosService } from './orcamentos.service'
import { pedidosService } from './pedidos.service'

const METODOS_CHAIN = [
  'select', 'order', 'limit', 'eq', 'in', 'not', 'gte', 'lt', 'lte',
  'ilike', 'or', 'is', 'update', 'insert', 'delete',
]

function chain(result) {
  const c = {}
  METODOS_CHAIN.forEach((metodo) => { c[metodo] = vi.fn(() => c) })
  c.single = vi.fn(() => Promise.resolve(result))
  c.then = (resolve) => resolve(result)
  return c
}

function pedidoRow(overrides = {}) {
  return {
    id: 'p1',
    status: 'em_separacao',
    forma_entrega: 'retirada',
    pronto_para_retirada_em: null,
    saiu_para_entrega_em: null,
    clientes: null,
    operadores: null,
    itens_pedido: [],
    pedidos_status_historico: [],
    ...overrides,
  }
}

beforeEach(() => {
  supabase.from.mockReset()
  supabase.rpc.mockReset()
  orcamentosService.criar.mockReset()
  orcamentosService.aceitar.mockReset()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('atualizarStatus', () => {
  test('AGUARDANDO_CONFIRMACAO não persiste nada — é só rótulo de vitrine sobre NOVO_PEDIDO', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'pedidos') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({ data: pedidoRow({ status: 'confirmado' }), error: null })
    })

    const resultado = await pedidosService.atualizarStatus('p1', 'AGUARDANDO_CONFIRMACAO')

    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(resultado.status).toBe('NOVO_PEDIDO')
  })

  test('PRONTO_RETIRADA a partir de em_separacao: transiciona pra "pronto" e depois marca a retirada', async () => {
    let chamada = 0
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'pedidos') throw new Error(`tabela inesperada: ${tabela}`)
      chamada += 1
      // 1ª chamada: buscarPorId("atual") ainda em separação. 2ª: buscarPorId final, já pronto.
      return chain({
        data: pedidoRow(chamada === 1 ? { status: 'em_separacao' } : { status: 'pronto', pronto_para_retirada_em: '2026-08-27T10:00:00Z' }),
        error: null,
      })
    })
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    await pedidosService.atualizarStatus('p1', 'PRONTO_RETIRADA', 'op1', 'obs')

    expect(supabase.rpc).toHaveBeenCalledTimes(2)
    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'atualizar_status_pedido_dashboard', {
      p_pedido_id: 'p1',
      p_novo_status: 'pronto',
      p_operador_id: 'op1',
      p_observacao: 'obs',
    })
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'marcar_pronto_retirada_pedido', { p_pedido_id: 'p1' })
  })

  test('PRONTO_RETIRADA quando o pedido já está "pronto": não repete a transição de status', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'pedidos') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({ data: pedidoRow({ status: 'pronto' }), error: null })
    })
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    await pedidosService.atualizarStatus('p1', 'PRONTO_RETIRADA')

    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('marcar_pronto_retirada_pedido', { p_pedido_id: 'p1' })
  })

  test('SAIU_ENTREGA a partir de em_separacao: transiciona pra "pronto" e depois marca a saída', async () => {
    let chamada = 0
    supabase.from.mockImplementation((tabela) => {
      chamada += 1
      return chain({
        data: pedidoRow(chamada === 1 ? { status: 'em_separacao', forma_entrega: 'entrega_propria' } : { status: 'pronto', forma_entrega: 'entrega_propria', saiu_para_entrega_em: '2026-08-27T10:00:00Z' }),
        error: null,
      })
    })
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    await pedidosService.atualizarStatus('p1', 'SAIU_ENTREGA')

    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'atualizar_status_pedido_dashboard', expect.objectContaining({ p_novo_status: 'pronto' }))
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'marcar_saiu_entrega_pedido', { p_pedido_id: 'p1' })
  })

  test.each([
    ['EM_SEPARACAO', 'em_separacao'],
    ['SEPARADO', 'pronto'],
    ['FINALIZADO', 'concluido'],
    ['CANCELADO', 'cancelado'],
  ])('%s grava o status real "%s" via atualizar_status_pedido_dashboard', async (statusDashboard, statusReal) => {
    supabase.from.mockImplementation(() => chain({ data: pedidoRow({ status: statusReal }), error: null }))
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    await pedidosService.atualizarStatus('p1', statusDashboard, 'op1')

    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('atualizar_status_pedido_dashboard', {
      p_pedido_id: 'p1',
      p_novo_status: statusReal,
      p_operador_id: 'op1',
      p_observacao: null,
    })
  })

  test('status de vitrine desconhecido não chama RPC nenhuma — lança erro explícito', async () => {
    await expect(pedidosService.atualizarStatus('p1', 'STATUS_INVENTADO')).rejects.toThrow(
      'Status "STATUS_INVENTADO" desconhecido'
    )
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })

  test('erro devolvido pela RPC de transição é propagado (não é engolido)', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('violação de transição de status') })

    await expect(pedidosService.atualizarStatus('p1', 'EM_SEPARACAO')).rejects.toThrow(
      'violação de transição de status'
    )
  })

  test('avisa o n8n com o status de vitrine (não o status real) depois de gravar', async () => {
    supabase.from.mockImplementation(() => chain({ data: pedidoRow({ status: 'concluido' }), error: null }))
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    await pedidosService.atualizarStatus('p1', 'FINALIZADO')

    expect(fetch).toHaveBeenCalledTimes(1)
    const [, opcoes] = fetch.mock.calls[0]
    const corpo = JSON.parse(opcoes.body)
    expect(corpo).toMatchObject({ evento: 'STATUS_ATUALIZADO', pedidoId: 'p1', novoStatus: 'FINALIZADO' })
  })
})

describe('buscarKpis', () => {
  test('soma valor_total só dos pedidos com status real "concluido" — pedidos em outros status não entram no faturamento', async () => {
    let chamada = 0
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'pedidos') throw new Error(`tabela inesperada: ${tabela}`)
      chamada += 1
      if (chamada === 1) {
        // primeira query: todos os pedidos de hoje (pra contadores), qualquer status
        return chain({
          data: [
            { status: 'confirmado', forma_entrega: 'retirada', pronto_para_retirada_em: null, saiu_para_entrega_em: null },
            { status: 'concluido', forma_entrega: 'retirada', pronto_para_retirada_em: null, saiu_para_entrega_em: null },
            { status: 'concluido', forma_entrega: 'retirada', pronto_para_retirada_em: null, saiu_para_entrega_em: null },
          ],
          error: null,
        })
      }
      // segunda query: só os concluídos, com valor_total
      return chain({ data: [{ valor_total: 150.5 }, { valor_total: 49.5 }], error: null })
    })

    const resultado = await pedidosService.buscarKpis()

    expect(resultado.contadores.NOVO_PEDIDO).toBe(1)
    expect(resultado.contadores.FINALIZADO).toBe(2)
    expect(resultado.faturamentoHoje).toBe(200)
  })

  test('sem nenhum pedido hoje, faturamento é 0 (não NaN nem undefined)', async () => {
    supabase.from.mockImplementation(() => chain({ data: [], error: null }))

    const resultado = await pedidosService.buscarKpis()

    expect(resultado).toEqual({ contadores: {}, faturamentoHoje: 0 })
  })

  test('valor_total nulo num pedido concluído não quebra a soma (trata como 0)', async () => {
    let chamada = 0
    supabase.from.mockImplementation(() => {
      chamada += 1
      if (chamada === 1) return chain({ data: [], error: null })
      return chain({ data: [{ valor_total: null }, { valor_total: 30 }], error: null })
    })

    const resultado = await pedidosService.buscarKpis()

    expect(resultado.faturamentoHoje).toBe(30)
  })

  test('erro na query de contadores é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('conexão caiu') }))

    await expect(pedidosService.buscarKpis()).rejects.toThrow('conexão caiu')
  })
})

describe('criar (pedido manual do dashboard)', () => {
  test('monta um orçamento tipo venda_geral a partir dos itens e aceita na hora — nunca insere direto em pedidos', async () => {
    orcamentosService.criar.mockResolvedValue({ id: 'orc1' })
    orcamentosService.aceitar.mockResolvedValue({ id: 'ped1' })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'pedidos') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({ data: pedidoRow({ id: 'ped1' }), error: null })
    })

    const resultado = await pedidosService.criar(
      {
        cliente_id: 'cli1',
        itens: [{ produto_id: 'prod1', quantidade: 2, valor_unitario: 10 }],
      },
      'op1'
    )

    expect(orcamentosService.criar).toHaveBeenCalledWith({
      cliente_id: 'cli1',
      tipo: 'venda_geral',
      status: 'rascunho',
      observacoes: undefined,
      itens: [{ produto_id: 'prod1', descricao_livre: null, quantidade: 2, valor_unitario: 10 }],
    })
    expect(orcamentosService.aceitar).toHaveBeenCalledWith('orc1', 'op1')
    expect(resultado.id).toBe('ped1')
  })

  test('item sem produto_id usa nome_item como descrição livre e preco_unitario como fallback de valor_unitario', async () => {
    orcamentosService.criar.mockResolvedValue({ id: 'orc1' })
    orcamentosService.aceitar.mockResolvedValue({ id: 'ped1' })
    supabase.from.mockImplementation(() => chain({ data: pedidoRow({ id: 'ped1' }), error: null }))

    await pedidosService.criar({
      cliente_id: 'cli1',
      itens: [{ nome_item: 'Caderno avulso', quantidade: 1, preco_unitario: 25 }],
    })

    expect(orcamentosService.criar).toHaveBeenCalledWith(
      expect.objectContaining({
        itens: [{ produto_id: null, descricao_livre: 'Caderno avulso', quantidade: 1, valor_unitario: 25 }],
      })
    )
  })

  test('sem forma_entrega nem endereco_entrega, não faz UPDATE extra em pedidos', async () => {
    orcamentosService.criar.mockResolvedValue({ id: 'orc1' })
    orcamentosService.aceitar.mockResolvedValue({ id: 'ped1' })
    const tabelasConsultadas = []
    supabase.from.mockImplementation((tabela) => {
      tabelasConsultadas.push(tabela)
      return chain({ data: pedidoRow({ id: 'ped1' }), error: null })
    })

    await pedidosService.criar({ cliente_id: 'cli1', itens: [] })

    // só a busca final do pedido (buscarPorId) — nenhum update
    expect(tabelasConsultadas).toEqual(['pedidos'])
  })

  test('com forma_entrega definida, atualiza forma_entrega/endereco_entrega do pedido recém-aceito', async () => {
    orcamentosService.criar.mockResolvedValue({ id: 'orc1' })
    orcamentosService.aceitar.mockResolvedValue({ id: 'ped1' })
    const updateChain = chain({ error: null })
    let chamada = 0
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'pedidos') throw new Error(`tabela inesperada: ${tabela}`)
      chamada += 1
      if (chamada === 1) return updateChain
      return chain({ data: pedidoRow({ id: 'ped1' }), error: null })
    })

    await pedidosService.criar({
      cliente_id: 'cli1',
      itens: [],
      forma_entrega: 'uber_flash',
      endereco_entrega: 'Rua X, 123',
    })

    expect(updateChain.update).toHaveBeenCalledWith({ forma_entrega: 'uber_flash', endereco_entrega: 'Rua X, 123' })
    expect(updateChain.eq).toHaveBeenCalledWith('id', 'ped1')
  })

  test('com forma_pagamento/status_pagamento/horario_previsto, atualiza os 3 campos no pedido recém-aceito', async () => {
    orcamentosService.criar.mockResolvedValue({ id: 'orc1' })
    orcamentosService.aceitar.mockResolvedValue({ id: 'ped1' })
    const updateChain = chain({ error: null })
    let chamada = 0
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'pedidos') throw new Error(`tabela inesperada: ${tabela}`)
      chamada += 1
      if (chamada === 1) return updateChain
      return chain({ data: pedidoRow({ id: 'ped1' }), error: null })
    })

    await pedidosService.criar({
      cliente_id: 'cli1',
      itens: [],
      forma_pagamento: 'pix',
      status_pagamento: 'pago',
      horario_previsto: '2026-09-01T15:00:00.000Z',
    })

    expect(updateChain.update).toHaveBeenCalledWith({
      forma_pagamento: 'pix',
      status_pagamento: 'pago',
      horario_previsto: '2026-09-01T15:00:00.000Z',
    })
  })

  test('sem nenhum campo de pagamento nem entrega, não faz UPDATE extra', async () => {
    orcamentosService.criar.mockResolvedValue({ id: 'orc1' })
    orcamentosService.aceitar.mockResolvedValue({ id: 'ped1' })
    const tabelasConsultadas = []
    supabase.from.mockImplementation((tabela) => {
      tabelasConsultadas.push(tabela)
      return chain({ data: pedidoRow({ id: 'ped1' }), error: null })
    })

    await pedidosService.criar({ cliente_id: 'cli1', itens: [], status_pagamento: '' })

    expect(tabelasConsultadas).toEqual(['pedidos'])
  })
})

describe('atualizarPagamento', () => {
  test('atualiza forma_pagamento/status_pagamento/horario_previsto do pedido pelo id', async () => {
    const c = chain({ data: { id: 'p1', forma_pagamento: 'cartao_credito', status_pagamento: 'pago', horario_previsto: '2026-09-01T15:00:00Z' }, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'pedidos') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await pedidosService.atualizarPagamento('p1', {
      forma_pagamento: 'cartao_credito',
      status_pagamento: 'pago',
      horario_previsto: '2026-09-01T15:00:00Z',
    })

    expect(c.update).toHaveBeenCalledWith({
      forma_pagamento: 'cartao_credito',
      status_pagamento: 'pago',
      horario_previsto: '2026-09-01T15:00:00Z',
    })
    expect(c.eq).toHaveBeenCalledWith('id', 'p1')
    expect(resultado.status_pagamento).toBe('pago')
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('coluna inválida') }))

    await expect(
      pedidosService.atualizarPagamento('p1', { forma_pagamento: 'pix', status_pagamento: 'pago', horario_previsto: null })
    ).rejects.toThrow('coluna inválida')
  })
})

describe('marcarItemSeparado', () => {
  test('grava exatamente o boolean recebido — não inverte nem assume true', async () => {
    const c = chain({ data: { id: 'i1', separado: false }, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'itens_pedido') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await pedidosService.marcarItemSeparado('i1', false)

    expect(c.update).toHaveBeenCalledWith({ separado: false })
    expect(resultado.separado).toBe(false)
  })
})

describe('atribuirResponsavel', () => {
  test('repassa tipo, pedido e funcionário pra RPC atribuir_responsavel_pedido', async () => {
    supabase.rpc.mockResolvedValue({ data: { ok: true }, error: null })

    await pedidosService.atribuirResponsavel('p1', 'entrega', 'func1', 'op1')

    expect(supabase.rpc).toHaveBeenCalledWith('atribuir_responsavel_pedido', {
      p_pedido_id: 'p1',
      p_tipo: 'entrega',
      p_funcionario_id: 'func1',
      p_operador_id: 'op1',
    })
  })
})
