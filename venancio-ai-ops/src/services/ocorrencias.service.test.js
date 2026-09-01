// Testes de ocorrencias.service.js — status operacional real. Wrapper fino
// sobre RPCs (abrir_ocorrencia/resolver_ocorrencia), mesmo padrão de
// entrega.service.test.js. Mesmo dublê de supabase usado nos outros
// *.service.test.js do projeto.
import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { supabase } from '@/supabase/client'
import { ocorrenciasService } from './ocorrencias.service'

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
  test('sem filtros, não aplica eq de status nem tipo', async () => {
    const c = chain({ data: [{ id: 'oc1' }], error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'ocorrencias') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await ocorrenciasService.listar()

    expect(c.eq).not.toHaveBeenCalled()
    expect(resultado).toHaveLength(1)
  })

  test('filtros.status e filtros.tipo aplicam eq independentes', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await ocorrenciasService.listar({ status: 'aberta', tipo: 'item_faltante' })

    expect(c.eq).toHaveBeenCalledWith('status', 'aberta')
    expect(c.eq).toHaveBeenCalledWith('tipo', 'item_faltante')
  })

  test('data null vira lista vazia', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: null }))

    expect(await ocorrenciasService.listar()).toEqual([])
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('timeout') }))

    await expect(ocorrenciasService.listar()).rejects.toThrow('timeout')
  })
})

describe('listarAbertas', () => {
  test('é um atalho de listar({ status: "aberta" })', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await ocorrenciasService.listarAbertas()

    expect(c.eq).toHaveBeenCalledWith('status', 'aberta')
  })
})

describe('buscarPorPedido', () => {
  test('filtra por pedido_id e ordena por criado_em desc', async () => {
    const c = chain({ data: [{ id: 'oc1' }], error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'ocorrencias') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await ocorrenciasService.buscarPorPedido('p1')

    expect(c.eq).toHaveBeenCalledWith('pedido_id', 'p1')
    expect(c.order).toHaveBeenCalledWith('criado_em', { ascending: false })
  })

  test('data null vira lista vazia', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: null }))

    expect(await ocorrenciasService.buscarPorPedido('p1')).toEqual([])
  })
})

describe('buscarPorId', () => {
  test('busca pelo id', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'ocorrencias') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({ data: { id: 'oc1' }, error: null })
    })

    const resultado = await ocorrenciasService.buscarPorId('oc1')

    expect(resultado.id).toBe('oc1')
  })

  test('erro (ex.: id inexistente) é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('não encontrada') }))

    await expect(ocorrenciasService.buscarPorId('oc-invalida')).rejects.toThrow('não encontrada')
  })
})

describe('abrir', () => {
  test('repassa todos os campos, incluindo os opcionais de contexto de separação/entrega', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'oc1' }, error: null })

    await ocorrenciasService.abrir({
      pedidoId: 'p1',
      tipo: 'item_faltante',
      descricao: 'Faltou 1 caderno',
      solicitacaoSeparacaoId: 'sep1',
      solicitacaoEntregaId: null,
    })

    expect(supabase.rpc).toHaveBeenCalledWith('abrir_ocorrencia', {
      p_pedido_id: 'p1',
      p_tipo: 'item_faltante',
      p_descricao: 'Faltou 1 caderno',
      p_solicitacao_separacao_id: 'sep1',
      p_solicitacao_entrega_id: null,
    })
  })

  test('sem contexto de separação/entrega, manda ambos null', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'oc1' }, error: null })

    await ocorrenciasService.abrir({ pedidoId: 'p1', tipo: 'troca', descricao: 'Cliente quer trocar' })

    expect(supabase.rpc).toHaveBeenCalledWith('abrir_ocorrencia', {
      p_pedido_id: 'p1',
      p_tipo: 'troca',
      p_descricao: 'Cliente quer trocar',
      p_solicitacao_separacao_id: null,
      p_solicitacao_entrega_id: null,
    })
  })

  test('erro da RPC (ex.: tipo inválido) é propagado', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('tipo de ocorrência desconhecido') })

    await expect(
      ocorrenciasService.abrir({ pedidoId: 'p1', tipo: 'tipo_inventado', descricao: 'x' })
    ).rejects.toThrow('tipo de ocorrência desconhecido')
  })
})

describe('resolver', () => {
  test('repassa o texto de resolução pra RPC resolver_ocorrencia', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'oc1', status: 'resolvida' }, error: null })

    const resultado = await ocorrenciasService.resolver('oc1', 'Reembolso feito')

    expect(supabase.rpc).toHaveBeenCalledWith('resolver_ocorrencia', {
      p_ocorrencia_id: 'oc1',
      p_resolucao_texto: 'Reembolso feito',
    })
    expect(resultado.status).toBe('resolvida')
  })

  test('erro da RPC (ex.: ocorrência já resolvida) é propagado', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('ocorrência já está resolvida') })

    await expect(ocorrenciasService.resolver('oc1', 'x')).rejects.toThrow('ocorrência já está resolvida')
  })
})

describe('contarAbertas', () => {
  test('conta com filtro status=aberta usando count exact/head', async () => {
    const c = chain({ count: 3, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'ocorrencias') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await ocorrenciasService.contarAbertas()

    expect(c.select).toHaveBeenCalledWith('*', { count: 'exact', head: true })
    expect(c.eq).toHaveBeenCalledWith('status', 'aberta')
    expect(resultado).toBe(3)
  })

  test('count null vira 0, não null/undefined', async () => {
    supabase.from.mockImplementation(() => chain({ count: null, error: null }))

    expect(await ocorrenciasService.contarAbertas()).toBe(0)
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ count: null, error: new Error('timeout') }))

    await expect(ocorrenciasService.contarAbertas()).rejects.toThrow('timeout')
  })
})
