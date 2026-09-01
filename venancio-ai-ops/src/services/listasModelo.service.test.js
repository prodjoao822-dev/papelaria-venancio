// Testes de listasModelo.service.js — service novo (31/08), prioridade máxima
// porque já teve 2 bugs reais em produção que teste teria pego (origem de
// cliente inválida, RLS bloqueando escola). Mesmo dublê de supabase usado nos
// outros *.service.test.js do projeto.
import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { supabase } from '@/supabase/client'
import { listasModeloService } from './listasModelo.service'

const METODOS_CHAIN = ['select', 'eq', 'order', 'limit']

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

describe('listarEscolasComListas', () => {
  test('agrupa várias listas da mesma escola numa única entrada, contando qtd_listas', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'listas_modelo') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({
        data: [
          { escola_id: 'esc1', escolas: { nome: 'Escola B' } },
          { escola_id: 'esc1', escolas: { nome: 'Escola B' } },
          { escola_id: 'esc2', escolas: { nome: 'Escola A' } },
        ],
        error: null,
      })
    })

    const resultado = await listasModeloService.listarEscolasComListas()

    expect(resultado).toEqual([
      { id: 'esc2', nome: 'Escola A', qtd_listas: 1 },
      { id: 'esc1', nome: 'Escola B', qtd_listas: 2 },
    ])
  })

  test('filtra ativo=true na query', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await listasModeloService.listarEscolasComListas()

    expect(c.eq).toHaveBeenCalledWith('ativo', true)
  })

  test('linha sem escola_id é ignorada (não vira entrada "—" solta)', async () => {
    supabase.from.mockImplementation(() => chain({
      data: [{ escola_id: null, escolas: null }, { escola_id: 'esc1', escolas: { nome: 'Escola X' } }],
      error: null,
    }))

    const resultado = await listasModeloService.listarEscolasComListas()

    expect(resultado).toEqual([{ id: 'esc1', nome: 'Escola X', qtd_listas: 1 }])
  })

  test('escola sem nome (join falhou) cai no fallback "—" em vez de quebrar', async () => {
    supabase.from.mockImplementation(() => chain({
      data: [{ escola_id: 'esc1', escolas: null }],
      error: null,
    }))

    const resultado = await listasModeloService.listarEscolasComListas()

    expect(resultado).toEqual([{ id: 'esc1', nome: '—', qtd_listas: 1 }])
  })

  test('data null (RLS bloqueando/sem linhas) devolve lista vazia, não quebra', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: null }))

    const resultado = await listasModeloService.listarEscolasComListas()

    expect(resultado).toEqual([])
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('RLS negou acesso a listas_modelo') }))

    await expect(listasModeloService.listarEscolasComListas()).rejects.toThrow('RLS negou acesso a listas_modelo')
  })
})

describe('listarPorEscola', () => {
  test('filtra pela escola e por ativo=true, ordenando por ano', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'listas_modelo') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await listasModeloService.listarPorEscola('esc1')

    expect(c.eq).toHaveBeenCalledWith('escola_id', 'esc1')
    expect(c.eq).toHaveBeenCalledWith('ativo', true)
    expect(c.order).toHaveBeenCalledWith('ano')
  })

  test('calcula qtd_itens a partir do array de itens da lista', async () => {
    supabase.from.mockImplementation(() => chain({
      data: [
        { id: 'lm1', ano: '1º ano', valor_total: 150, arquivo_origem: 'x.pdf', listas_modelo_itens: [{ id: 'i1' }, { id: 'i2' }] },
        { id: 'lm2', ano: '2º ano', valor_total: 200, arquivo_origem: null, listas_modelo_itens: [] },
      ],
      error: null,
    }))

    const resultado = await listasModeloService.listarPorEscola('esc1')

    // Nota: arquivo_origem é buscado no select mas não é repassado no mapeamento
    // desta função (só em buscarComItens) — não é usado pela tela de listagem hoje.
    expect(resultado).toEqual([
      { id: 'lm1', ano: '1º ano', valor_total: 150, qtd_itens: 2 },
      { id: 'lm2', ano: '2º ano', valor_total: 200, qtd_itens: 0 },
    ])
  })

  test('listas_modelo_itens ausente (não veio no select) não quebra — qtd_itens vira 0', async () => {
    supabase.from.mockImplementation(() => chain({
      data: [{ id: 'lm1', ano: '3º ano', valor_total: 0, arquivo_origem: null }],
      error: null,
    }))

    const resultado = await listasModeloService.listarPorEscola('esc1')

    expect(resultado[0].qtd_itens).toBe(0)
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('escola inexistente') }))


    await expect(listasModeloService.listarPorEscola('esc-invalida')).rejects.toThrow('escola inexistente')
  })
})

describe('buscarComItens', () => {
  test('busca a lista modelo pelo id e devolve os dados completos (escola + itens)', async () => {
    const c = chain({ data: { id: 'lm1', ano: '1º ano', escolas: { id: 'esc1', nome: 'Escola X' }, listas_modelo_itens: [] }, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'listas_modelo') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await listasModeloService.buscarComItens('lm1')

    expect(c.eq).toHaveBeenCalledWith('id', 'lm1')
    expect(resultado.id).toBe('lm1')
  })

  test('erro do banco (ex.: lista inexistente) é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('lista modelo não encontrada') }))

    await expect(listasModeloService.buscarComItens('lm-invalida')).rejects.toThrow('lista modelo não encontrada')
  })
})

describe('criarPedido', () => {
  test('repassa listaModeloId/clienteId pra RPC com os defaults de entrega/horário', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'ped1', protocolo: 'PED-010' }, error: null })

    const resultado = await listasModeloService.criarPedido({ listaModeloId: 'lm1', clienteId: 'cli1' })

    expect(supabase.rpc).toHaveBeenCalledWith('criar_pedido_de_lista_modelo', {
      p_lista_modelo_id: 'lm1',
      p_cliente_id: 'cli1',
      p_forma_entrega: 'retirada',
      p_endereco_entrega: null,
      p_horario_retirada_desejado: null,
    })
    expect(resultado.protocolo).toBe('PED-010')
  })

  test('repassa forma_entrega/endereco/horário explícitos, sem aplicar defaults', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'ped2' }, error: null })

    await listasModeloService.criarPedido({
      listaModeloId: 'lm1',
      clienteId: 'cli1',
      formaEntrega: 'entrega_propria',
      enderecoEntrega: 'Rua das Flores, 10',
      horarioRetiradaDesejado: '2026-09-01T15:00:00Z',
    })

    expect(supabase.rpc).toHaveBeenCalledWith('criar_pedido_de_lista_modelo', {
      p_lista_modelo_id: 'lm1',
      p_cliente_id: 'cli1',
      p_forma_entrega: 'entrega_propria',
      p_endereco_entrega: 'Rua das Flores, 10',
      p_horario_retirada_desejado: '2026-09-01T15:00:00Z',
    })
  })

  test('erro da RPC (ex.: cliente inválido) é propagado, não é engolido', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('cliente informado não existe') })

    await expect(
      listasModeloService.criarPedido({ listaModeloId: 'lm1', clienteId: 'cli-invalido' })
    ).rejects.toThrow('cliente informado não existe')
  })
})
