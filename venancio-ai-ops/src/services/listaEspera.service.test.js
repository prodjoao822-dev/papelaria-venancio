// Testes de listaEspera.service.js (RF-04) — mesmo dublê de supabase usado
// nos outros *.service.test.js do projeto.
import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { supabase } from '@/supabase/client'
import { listaEsperaService } from './listaEspera.service'

const METODOS_CHAIN = ['select', 'eq']

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

describe('listarProdutosComEspera', () => {
  test('agrupa várias linhas do mesmo produto numa única entrada, contando qtd_interessados', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'lista_espera') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({
        data: [
          { produto_id: 'prod1', produtos: { id: 'prod1', nome: 'Caderno 10 matérias', sku: 'CAD-10', estoque: 0 } },
          { produto_id: 'prod1', produtos: { id: 'prod1', nome: 'Caderno 10 matérias', sku: 'CAD-10', estoque: 0 } },
          { produto_id: 'prod2', produtos: { id: 'prod2', nome: 'Apontador', sku: null, estoque: 5 } },
        ],
        error: null,
      })
    })

    const resultado = await listaEsperaService.listarProdutosComEspera()

    expect(resultado).toEqual([
      { id: 'prod2', nome: 'Apontador', sku: null, estoque: 5, qtd_interessados: 1 },
      { id: 'prod1', nome: 'Caderno 10 matérias', sku: 'CAD-10', estoque: 0, qtd_interessados: 2 },
    ])
  })

  test('filtra status=aguardando na query', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await listaEsperaService.listarProdutosComEspera()

    expect(c.eq).toHaveBeenCalledWith('status', 'aguardando')
  })

  test('linha sem produto_id é ignorada', async () => {
    supabase.from.mockImplementation(() => chain({
      data: [{ produto_id: null, produtos: null }, { produto_id: 'prod1', produtos: { nome: 'X' } }],
      error: null,
    }))

    const resultado = await listaEsperaService.listarProdutosComEspera()

    expect(resultado).toEqual([{ id: 'prod1', nome: 'X', sku: null, estoque: 0, qtd_interessados: 1 }])
  })

  test('data null (sem linhas) devolve lista vazia', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: null }))

    const resultado = await listaEsperaService.listarProdutosComEspera()

    expect(resultado).toEqual([])
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('RLS negou acesso') }))

    await expect(listaEsperaService.listarProdutosComEspera()).rejects.toThrow('RLS negou acesso')
  })
})

describe('listarInteressados', () => {
  test('repassa produtoId e incluirNotificados=false por padrão', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ nome: 'Maria' }], error: null })

    const resultado = await listaEsperaService.listarInteressados('prod1')

    expect(supabase.rpc).toHaveBeenCalledWith('listar_interessados_produto', {
      p_produto_id: 'prod1',
      p_incluir_notificados: false,
    })
    expect(resultado).toEqual([{ nome: 'Maria' }])
  })

  test('repassa incluirNotificados=true quando pedido explicitamente', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })

    await listaEsperaService.listarInteressados('prod1', true)

    expect(supabase.rpc).toHaveBeenCalledWith('listar_interessados_produto', {
      p_produto_id: 'prod1',
      p_incluir_notificados: true,
    })
  })

  test('data null devolve lista vazia', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    const resultado = await listaEsperaService.listarInteressados('prod1')

    expect(resultado).toEqual([])
  })

  test('erro da RPC é propagado', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('produto não encontrado') })

    await expect(listaEsperaService.listarInteressados('prod-invalido')).rejects.toThrow('produto não encontrado')
  })
})

describe('registrarInteresse', () => {
  test('repassa os 4 parâmetros com defaults de quantidade/observação', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'le1' }, error: null })

    await listaEsperaService.registrarInteresse({ produtoId: 'prod1', clienteId: 'cli1' })

    expect(supabase.rpc).toHaveBeenCalledWith('registrar_interesse_lista_espera', {
      p_produto_id: 'prod1',
      p_cliente_id: 'cli1',
      p_quantidade_desejada: 1,
      p_observacao: null,
    })
  })

  test('repassa quantidadeDesejada/observacao explícitos', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'le1' }, error: null })

    await listaEsperaService.registrarInteresse({
      produtoId: 'prod1', clienteId: 'cli1', quantidadeDesejada: 3, observacao: 'quer cor azul',
    })

    expect(supabase.rpc).toHaveBeenCalledWith('registrar_interesse_lista_espera', {
      p_produto_id: 'prod1',
      p_cliente_id: 'cli1',
      p_quantidade_desejada: 3,
      p_observacao: 'quer cor azul',
    })
  })

  test('erro da RPC é propagado', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('cliente informado não existe') })

    await expect(
      listaEsperaService.registrarInteresse({ produtoId: 'prod1', clienteId: 'cli-invalido' })
    ).rejects.toThrow('cliente informado não existe')
  })
})

describe('marcarNotificado', () => {
  test('repassa o id do registro de lista de espera', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'le1', status: 'notificado' }, error: null })

    const resultado = await listaEsperaService.marcarNotificado('le1')

    expect(supabase.rpc).toHaveBeenCalledWith('marcar_cliente_notificado', { p_lista_espera_id: 'le1' })
    expect(resultado.status).toBe('notificado')
  })

  test('erro da RPC é propagado', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('registro já notificado') })

    await expect(listaEsperaService.marcarNotificado('le1')).rejects.toThrow('registro já notificado')
  })
})
