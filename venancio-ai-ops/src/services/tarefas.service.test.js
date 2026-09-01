// Testes de tarefas.service.js (RF-03) — mesmo dublê de supabase usado nos
// outros *.service.test.js do projeto (chain thenable + rpc mockado).
import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn() } }))

import { supabase } from '@/supabase/client'
import { tarefasService } from './tarefas.service'

const METODOS_CHAIN = ['select', 'eq', 'order']

function chain(result) {
  const c = {}
  METODOS_CHAIN.forEach((metodo) => { c[metodo] = vi.fn(() => c) })
  c.then = (resolve) => resolve(result)
  return c
}

beforeEach(() => {
  supabase.from.mockReset()
  supabase.rpc.mockReset()
})

describe('listar', () => {
  test('ordena por data_execucao ascendente, sem filtro nenhum por padrão', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'tarefas') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await tarefasService.listar()

    expect(c.order).toHaveBeenCalledWith('data_execucao', { ascending: true })
    expect(c.eq).not.toHaveBeenCalled()
  })

  test('aplica filtro de status quando informado', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await tarefasService.listar({ status: 'pendente' })

    expect(c.eq).toHaveBeenCalledWith('status', 'pendente')
  })

  test('aplica filtro de responsavelId quando informado', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await tarefasService.listar({ responsavelId: 'func1' })

    expect(c.eq).toHaveBeenCalledWith('responsavel_id', 'func1')
  })

  test('data null (RLS/sem linhas) devolve lista vazia, não quebra', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: null }))

    const resultado = await tarefasService.listar()

    expect(resultado).toEqual([])
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('RLS negou acesso a tarefas') }))

    await expect(tarefasService.listar()).rejects.toThrow('RLS negou acesso a tarefas')
  })
})

describe('listarPendentes', () => {
  test('é um atalho de listar({ status: "pendente" })', async () => {
    const c = chain({ data: [{ id: 't1' }], error: null })
    supabase.from.mockImplementation(() => c)

    const resultado = await tarefasService.listarPendentes()

    expect(c.eq).toHaveBeenCalledWith('status', 'pendente')
    expect(resultado).toEqual([{ id: 't1' }])
  })
})

describe('criar', () => {
  test('repassa responsável/descrição/data pra RPC, com pedidoId default null', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'tar1' }, error: null })

    await tarefasService.criar({ responsavelId: 'func1', descricao: 'Organizar prateleira', dataExecucao: '2026-09-02T10:00:00Z' })

    expect(supabase.rpc).toHaveBeenCalledWith('criar_tarefa', {
      p_responsavel_id: 'func1',
      p_descricao: 'Organizar prateleira',
      p_data_execucao: '2026-09-02T10:00:00Z',
      p_pedido_id: null,
    })
  })

  test('repassa pedidoId quando a tarefa está amarrada a um pedido', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'tar2' }, error: null })

    await tarefasService.criar({
      responsavelId: 'func1',
      descricao: 'Conferir pedido antes da retirada',
      dataExecucao: '2026-09-02T10:00:00Z',
      pedidoId: 'ped1',
    })

    expect(supabase.rpc).toHaveBeenCalledWith('criar_tarefa', expect.objectContaining({ p_pedido_id: 'ped1' }))
  })

  test('erro da RPC é propagado, não é engolido', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('responsável não existe ou está inativo') })

    await expect(
      tarefasService.criar({ responsavelId: 'func-invalido', descricao: 'x', dataExecucao: '2026-09-02T10:00:00Z' })
    ).rejects.toThrow('responsável não existe ou está inativo')
  })
})

describe('concluir', () => {
  test('repassa só o id da tarefa — o ator é resolvido no banco via auth.uid()', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'tar1', status: 'concluida' }, error: null })

    const resultado = await tarefasService.concluir('tar1')

    expect(supabase.rpc).toHaveBeenCalledWith('concluir_tarefa', { p_tarefa_id: 'tar1' })
    expect(resultado.status).toBe('concluida')
  })

  test('erro da RPC é propagado', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('tarefa já concluída') })

    await expect(tarefasService.concluir('tar1')).rejects.toThrow('tarefa já concluída')
  })
})

describe('reatribuir', () => {
  test('repassa tarefa e novo responsável pra RPC', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'tar1', responsavel_id: 'func2' }, error: null })

    const resultado = await tarefasService.reatribuir('tar1', 'func2')

    expect(supabase.rpc).toHaveBeenCalledWith('reatribuir_tarefa', {
      p_tarefa_id: 'tar1',
      p_novo_responsavel_id: 'func2',
    })
    expect(resultado.responsavel_id).toBe('func2')
  })

  test('erro da RPC é propagado', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('funcionário inativo') })

    await expect(tarefasService.reatribuir('tar1', 'func-inativo')).rejects.toThrow('funcionário inativo')
  })
})

describe('contarPendentes', () => {
  test('conta tarefas com status pendente', async () => {
    const c = { select: vi.fn(() => c), eq: vi.fn(() => Promise.resolve({ count: 3, error: null })) }
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'tarefas') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await tarefasService.contarPendentes()

    expect(c.select).toHaveBeenCalledWith('*', { count: 'exact', head: true })
    expect(c.eq).toHaveBeenCalledWith('status', 'pendente')
    expect(resultado).toBe(3)
  })

  test('count null devolve 0, não null/undefined', async () => {
    const c = { select: vi.fn(() => c), eq: vi.fn(() => Promise.resolve({ count: null, error: null })) }
    supabase.from.mockImplementation(() => c)

    const resultado = await tarefasService.contarPendentes()

    expect(resultado).toBe(0)
  })
})
