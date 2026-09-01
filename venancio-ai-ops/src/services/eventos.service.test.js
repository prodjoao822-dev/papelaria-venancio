// Testes de eventos.service.js — trilha de auditoria (timeline unificada).
// Foco no ponto mais delicado do próprio comentário do arquivo: eventos de
// pedido/entrega/ocorrência guardam pedido_id no payload, e eventos de
// orçamento guardam orcamento_id — buscarPorPedido tem que filtrar pelos
// dois quando um orcamentoId é passado, e só pelo primeiro quando não é.
import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/supabase/client', () => ({ supabase: { from: vi.fn() } }))

import { supabase } from '@/supabase/client'
import { eventosService } from './eventos.service'

const METODOS_CHAIN = ['select', 'or', 'order']

function chain(result) {
  const c = {}
  METODOS_CHAIN.forEach((metodo) => { c[metodo] = vi.fn(() => c) })
  c.then = (resolve) => resolve(result)
  return c
}

beforeEach(() => {
  supabase.from.mockReset()
})

describe('buscarPorPedido', () => {
  test('sem pedidoId, nem chega a consultar o banco — devolve lista vazia direto', async () => {
    const resultado = await eventosService.buscarPorPedido(null)

    expect(resultado).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  test('só com pedidoId, filtra apenas por payload->>pedido_id', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'eventos') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await eventosService.buscarPorPedido('p1')

    expect(c.or).toHaveBeenCalledWith('payload->>pedido_id.eq.p1')
  })

  test('com orcamentoId também, filtra pelos dois payloads (pedido_id OU orcamento_id)', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await eventosService.buscarPorPedido('p1', 'orc1')

    expect(c.or).toHaveBeenCalledWith('payload->>pedido_id.eq.p1,payload->>orcamento_id.eq.orc1')
  })

  test('ordena por criado_em ascendente (linha do tempo cronológica, não mais recente primeiro)', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await eventosService.buscarPorPedido('p1')

    expect(c.order).toHaveBeenCalledWith('criado_em', { ascending: true })
  })

  test('data null não quebra — devolve lista vazia', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: null }))

    expect(await eventosService.buscarPorPedido('p1')).toEqual([])
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('timeout') }))

    await expect(eventosService.buscarPorPedido('p1')).rejects.toThrow('timeout')
  })
})
