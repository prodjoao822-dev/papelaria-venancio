// Testes de entrega.service.js — status operacional real (solicitações de
// entrega). Wrapper fino sobre RPCs (delegar_entrega, assumir_entrega,
// concluir_entrega...) — mesmo padrão de separacao.service.test.js: sem
// verificação, um erro de digitação no nome/shape da RPC só aparece em
// produção. Mesmo dublê de supabase usado nos outros *.service.test.js.
import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { supabase } from '@/supabase/client'
import { entregaService } from './entrega.service'

const METODOS_CHAIN = ['select', 'order', 'eq', 'in']

function chain(result) {
  const c = {}
  METODOS_CHAIN.forEach((metodo) => { c[metodo] = vi.fn(() => c) })
  c.single = vi.fn(() => Promise.resolve(result))
  c.then = (resolve) => resolve(result)
  return c
}

beforeEach(() => {
  supabase.from.mockReset()
  supabase.rpc.mockReset()
})

describe('listar', () => {
  test('sem filtros, não aplica eq nem in', async () => {
    const c = chain({ data: [{ id: 'sol1' }], error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'solicitacoes_entrega') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await entregaService.listar()

    expect(c.eq).not.toHaveBeenCalled()
    expect(c.in).not.toHaveBeenCalled()
    expect(resultado).toHaveLength(1)
  })

  test('filtros.status usa eq; filtros.statusIn usa in', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await entregaService.listar({ status: 'pendente' })
    expect(c.eq).toHaveBeenCalledWith('status', 'pendente')

    c.eq.mockClear()
    await entregaService.listar({ statusIn: ['pendente', 'em_rota'] })
    expect(c.in).toHaveBeenCalledWith('status', ['pendente', 'em_rota'])
  })

  test('data null não quebra — devolve lista vazia', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: null }))

    const resultado = await entregaService.listar()

    expect(resultado).toEqual([])
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('timeout') }))

    await expect(entregaService.listar()).rejects.toThrow('timeout')
  })
})

describe('buscarPorId', () => {
  test('busca pelo id e devolve a linha', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'solicitacoes_entrega') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({ data: { id: 'sol1' }, error: null })
    })

    const resultado = await entregaService.buscarPorId('sol1')

    expect(resultado.id).toBe('sol1')
  })

  test('erro (ex.: id inexistente) é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('não encontrado') }))

    await expect(entregaService.buscarPorId('sol-invalida')).rejects.toThrow('não encontrado')
  })
})

describe('buscarPorPedido', () => {
  test('filtra por pedido_id e ordena por criado_em desc', async () => {
    const c = chain({ data: [{ id: 'sol1' }], error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'solicitacoes_entrega') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await entregaService.buscarPorPedido('p1')

    expect(c.eq).toHaveBeenCalledWith('pedido_id', 'p1')
    expect(c.order).toHaveBeenCalledWith('criado_em', { ascending: false })
    expect(resultado).toHaveLength(1)
  })

  test('data null vira lista vazia', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: null }))

    expect(await entregaService.buscarPorPedido('p1')).toEqual([])
  })
})

describe('delegar', () => {
  test('repassa pedido/entregador/horário pra RPC delegar_entrega', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'sol1' }, error: null })

    await entregaService.delegar({ pedidoId: 'p1', entregadorId: 'func1', horarioPrevisto: '2026-09-01T15:00:00Z' })

    expect(supabase.rpc).toHaveBeenCalledWith('delegar_entrega', {
      p_pedido_id: 'p1',
      p_entregador_id: 'func1',
      p_horario_previsto: '2026-09-01T15:00:00Z',
    })
  })

  test('sem horário previsto, manda null explícito', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'sol1' }, error: null })

    await entregaService.delegar({ pedidoId: 'p1', entregadorId: 'func1' })

    expect(supabase.rpc).toHaveBeenCalledWith('delegar_entrega', {
      p_pedido_id: 'p1',
      p_entregador_id: 'func1',
      p_horario_previsto: null,
    })
  })

  test('erro da RPC (ex.: forma_entrega não é entrega_propria) é propagado', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('pedido não é de entrega própria') })

    await expect(
      entregaService.delegar({ pedidoId: 'p1', entregadorId: 'func1' })
    ).rejects.toThrow('pedido não é de entrega própria')
  })
})

describe.each([
  ['assumir', 'assumir_entrega'],
  ['iniciarRota', 'iniciar_rota'],
  ['concluir', 'concluir_entrega'],
])('%s', (metodo, rpcEsperada) => {
  test(`chama ${rpcEsperada} só com o id da solicitação`, async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'sol1' }, error: null })

    await entregaService[metodo]('sol1')

    expect(supabase.rpc).toHaveBeenCalledWith(rpcEsperada, { p_solicitacao_id: 'sol1' })
  })

  test('erro da RPC é propagado', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('transição inválida') })

    await expect(entregaService[metodo]('sol1')).rejects.toThrow('transição inválida')
  })
})

describe('registrarInsucesso', () => {
  test('repassa o motivo pra RPC registrar_insucesso_entrega', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'sol1' }, error: null })

    await entregaService.registrarInsucesso('sol1', 'cliente ausente')

    expect(supabase.rpc).toHaveBeenCalledWith('registrar_insucesso_entrega', {
      p_solicitacao_id: 'sol1',
      p_motivo: 'cliente ausente',
    })
  })
})

describe('cancelar', () => {
  test('repassa o motivo pra RPC cancelar_entrega', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'sol1', status: 'cancelada' }, error: null })

    await entregaService.cancelar('sol1', 'cliente desistiu')

    expect(supabase.rpc).toHaveBeenCalledWith('cancelar_entrega', { p_solicitacao_id: 'sol1', p_motivo: 'cliente desistiu' })
  })

  test('sem motivo, manda null explícito', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    await entregaService.cancelar('sol1')

    expect(supabase.rpc).toHaveBeenCalledWith('cancelar_entrega', { p_solicitacao_id: 'sol1', p_motivo: null })
  })
})
