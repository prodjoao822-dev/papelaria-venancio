// Testes de funcionarios.service.js — cadastro de Separador/Entregador.
// Foco em listarPorPapel (usado nos dropdowns de delegação de
// separação/entrega — separacao.service/entrega.service) e em toggleAtivo,
// que é ler-antes-de-gravar (2 idas ao banco) e pode dar corrida se o
// segundo erro não for tratado.
import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/supabase/client', () => ({ supabase: { from: vi.fn() } }))

import { supabase } from '@/supabase/client'
import { funcionariosService } from './funcionarios.service'

const METODOS_CHAIN = ['select', 'order', 'eq', 'contains', 'insert', 'update']

function chain(result) {
  const c = {}
  METODOS_CHAIN.forEach((metodo) => { c[metodo] = vi.fn(() => c) })
  c.single = vi.fn(() => Promise.resolve(result))
  c.then = (resolve) => resolve(result)
  return c
}

beforeEach(() => {
  supabase.from.mockReset()
})

describe('listar', () => {
  test('sem filtros, ordena por nome e não aplica eq/contains', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'funcionarios') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await funcionariosService.listar()

    expect(c.order).toHaveBeenCalledWith('nome', { ascending: true })
    expect(c.eq).not.toHaveBeenCalled()
    expect(c.contains).not.toHaveBeenCalled()
  })

  test('filtros.ativo=false é aplicado (não é tratado como "sem filtro" por falsy)', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await funcionariosService.listar({ ativo: false })

    expect(c.eq).toHaveBeenCalledWith('ativo', false)
  })

  test('filtros.papel usa contains no array papeis', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await funcionariosService.listar({ papel: 'separacao' })

    expect(c.contains).toHaveBeenCalledWith('papeis', ['separacao'])
  })

  test('data null vira lista vazia', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: null }))

    expect(await funcionariosService.listar()).toEqual([])
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('timeout') }))

    await expect(funcionariosService.listar()).rejects.toThrow('timeout')
  })
})

describe('listarPorPapel', () => {
  test('é um atalho de listar({ ativo: true, papel })', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await funcionariosService.listarPorPapel('entrega')

    expect(c.eq).toHaveBeenCalledWith('ativo', true)
    expect(c.contains).toHaveBeenCalledWith('papeis', ['entrega'])
  })
})

describe('criar', () => {
  test('insere nome e papeis, com papeis [] como default', async () => {
    const c = chain({ data: { id: 'func1', nome: 'João' }, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'funcionarios') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await funcionariosService.criar({ nome: 'João' })

    expect(c.insert).toHaveBeenCalledWith({ nome: 'João', papeis: [] })
  })

  test('repassa os papeis informados', async () => {
    const c = chain({ data: { id: 'func1' }, error: null })
    supabase.from.mockImplementation(() => c)

    await funcionariosService.criar({ nome: 'João', papeis: ['separacao', 'entrega'] })

    expect(c.insert).toHaveBeenCalledWith({ nome: 'João', papeis: ['separacao', 'entrega'] })
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('nome obrigatório') }))

    await expect(funcionariosService.criar({ nome: '' })).rejects.toThrow('nome obrigatório')
  })
})

describe('atualizar', () => {
  test('grava os dados exatos pelo id', async () => {
    const c = chain({ data: { id: 'func1', nome: 'João Editado' }, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'funcionarios') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await funcionariosService.atualizar('func1', { nome: 'João Editado' })

    expect(c.update).toHaveBeenCalledWith({ nome: 'João Editado' })
    expect(c.eq).toHaveBeenCalledWith('id', 'func1')
    expect(resultado.nome).toBe('João Editado')
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('funcionário não encontrado') }))

    await expect(funcionariosService.atualizar('func-invalido', { nome: 'X' })).rejects.toThrow('funcionário não encontrado')
  })
})

describe('toggleAtivo', () => {
  test('inverte o ativo atual (true → false)', async () => {
    let chamada = 0
    const updateChain = chain({ data: { id: 'func1', ativo: false }, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'funcionarios') throw new Error(`tabela inesperada: ${tabela}`)
      chamada += 1
      if (chamada === 1) return chain({ data: { ativo: true }, error: null })
      return updateChain
    })

    const resultado = await funcionariosService.toggleAtivo('func1')

    expect(updateChain.update).toHaveBeenCalledWith({ ativo: false })
    expect(resultado.ativo).toBe(false)
  })

  test('inverte o ativo atual (false → true)', async () => {
    let chamada = 0
    const updateChain = chain({ data: { id: 'func1', ativo: true }, error: null })
    supabase.from.mockImplementation(() => {
      chamada += 1
      if (chamada === 1) return chain({ data: { ativo: false }, error: null })
      return updateChain
    })

    await funcionariosService.toggleAtivo('func1')

    expect(updateChain.update).toHaveBeenCalledWith({ ativo: true })
  })

  test('erro ao buscar o estado atual é propagado, sem tentar o update', async () => {
    const tabelasConsultadas = []
    supabase.from.mockImplementation((tabela) => {
      tabelasConsultadas.push(tabela)
      return chain({ data: null, error: new Error('funcionário não encontrado') })
    })

    await expect(funcionariosService.toggleAtivo('func-invalido')).rejects.toThrow('funcionário não encontrado')
    expect(tabelasConsultadas).toHaveLength(1)
  })

  test('erro no update (depois de buscar com sucesso) é propagado', async () => {
    let chamada = 0
    supabase.from.mockImplementation(() => {
      chamada += 1
      if (chamada === 1) return chain({ data: { ativo: true }, error: null })
      return chain({ data: null, error: new Error('conflito de concorrência') })
    })

    await expect(funcionariosService.toggleAtivo('func1')).rejects.toThrow('conflito de concorrência')
  })
})
