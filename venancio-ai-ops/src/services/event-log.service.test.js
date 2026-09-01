// Testes de event-log.service.js — trilha de auditoria manual (a maioria dos
// eventos hoje é gravada por trigger, mas .registrar() ainda existe pra quem
// precisa). Foco no contrato mais importante: registrar() NUNCA deve lançar,
// mesmo se o insert falhar — é side-channel, não pode derrubar o fluxo
// principal que chamou.
import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { supabase } from '@/supabase/client'
import { eventLogService } from './event-log.service'

const METODOS_CHAIN = ['select', 'eq', 'order', 'limit']

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

describe('registrar', () => {
  test('insere com os defaults documentados quando só o obrigatório é passado', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'eventos') throw new Error(`tabela inesperada: ${tabela}`)
      return { insert: insertMock }
    })

    await eventLogService.registrar({ tipoEvento: 'TESTE_MANUAL' })

    expect(insertMock).toHaveBeenCalledWith({
      tipo_evento: 'TESTE_MANUAL',
      entidade_tipo: null,
      entidade_id: null,
      ator_tipo: 'sistema',
      ator_id: null,
      descricao: null,
      payload: {},
    })
  })

  test('repassa todos os campos quando informados', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    supabase.from.mockImplementation(() => ({ insert: insertMock }))

    await eventLogService.registrar({
      tipoEvento: 'PEDIDO_CRIADO',
      entidadeTipo: 'pedido',
      entidadeId: 'p1',
      atorTipo: 'operador',
      atorId: 'op1',
      descricao: 'Pedido criado manualmente',
      payload: { origem: 'dashboard' },
    })

    expect(insertMock).toHaveBeenCalledWith({
      tipo_evento: 'PEDIDO_CRIADO',
      entidade_tipo: 'pedido',
      entidade_id: 'p1',
      ator_tipo: 'operador',
      ator_id: 'op1',
      descricao: 'Pedido criado manualmente',
      payload: { origem: 'dashboard' },
    })
  })

  test('erro no insert nunca é lançado — evento não pode quebrar o fluxo principal', async () => {
    supabase.from.mockImplementation(() => ({
      insert: vi.fn().mockRejectedValue(new Error('constraint violada')),
    }))

    await expect(eventLogService.registrar({ tipoEvento: 'X' })).resolves.toBeUndefined()
  })

  test('supabase.from lançando síncrono também não propaga', async () => {
    supabase.from.mockImplementation(() => {
      throw new Error('cliente supabase indisponível')
    })

    await expect(eventLogService.registrar({ tipoEvento: 'X' })).resolves.toBeUndefined()
  })
})

describe('listarParaEntidade', () => {
  test('filtra por entidade_tipo e entidade_id, ordena desc e limita', async () => {
    const c = chain({ data: [{ id: 'ev1' }], error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'eventos') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await eventLogService.listarParaEntidade('pedido', 'p1', 10)

    expect(c.eq).toHaveBeenCalledWith('entidade_tipo', 'pedido')
    expect(c.eq).toHaveBeenCalledWith('entidade_id', 'p1')
    expect(c.order).toHaveBeenCalledWith('criado_em', { ascending: false })
    expect(c.limit).toHaveBeenCalledWith(10)
    expect(resultado).toHaveLength(1)
  })

  test('limite default é 50 quando não informado', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await eventLogService.listarParaEntidade('pedido', 'p1')

    expect(c.limit).toHaveBeenCalledWith(50)
  })

  test('data null vira lista vazia', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: null }))

    expect(await eventLogService.listarParaEntidade('pedido', 'p1')).toEqual([])
  })

  test('erro do banco é propagado (aqui não é side-channel, é leitura direta)', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('timeout') }))

    await expect(eventLogService.listarParaEntidade('pedido', 'p1')).rejects.toThrow('timeout')
  })
})

describe('listarAtividadeFeed', () => {
  test('chama a RPC get_activity_feed com o limite informado', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ id: 'ev1' }], error: null })

    const resultado = await eventLogService.listarAtividadeFeed(15)

    expect(supabase.rpc).toHaveBeenCalledWith('get_activity_feed', { p_limit: 15 })
    expect(resultado).toHaveLength(1)
  })

  test('limite default é 30', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })

    await eventLogService.listarAtividadeFeed()

    expect(supabase.rpc).toHaveBeenCalledWith('get_activity_feed', { p_limit: 30 })
  })

  test('data null vira lista vazia', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    expect(await eventLogService.listarAtividadeFeed()).toEqual([])
  })

  test('erro da RPC é propagado', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('função não existe') })

    await expect(eventLogService.listarAtividadeFeed()).rejects.toThrow('função não existe')
  })
})
