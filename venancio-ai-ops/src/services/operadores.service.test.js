// Testes de operadores.service.js — gestão de login por código+PIN pros
// demais operadores (01/09/2026). listar/atualizarAtivo são leitura/escrita
// direta (RLS já cobre); criarComCodigo/resetarPin sempre pelo backend do
// JS Bot (service key), nunca direto do dashboard — mesmo padrão de
// separadorAdmin.service.test.js.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/supabase/client', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}))

import { supabase } from '@/supabase/client'
import { operadoresService } from './operadores.service'

const METODOS_CHAIN = ['select', 'order', 'eq', 'update']

function chain(result) {
  const c = {}
  METODOS_CHAIN.forEach((metodo) => { c[metodo] = vi.fn(() => c) })
  c.then = (resolve) => resolve(result)
  return c
}

beforeEach(() => {
  supabase.from.mockReset()
  supabase.auth.getSession.mockReset()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('gerarPin', () => {
  test('sempre gera uma string de 6 dígitos', () => {
    for (let i = 0; i < 20; i++) {
      expect(operadoresService.gerarPin()).toMatch(/^\d{6}$/)
    }
  })
})

describe('listar', () => {
  test('devolve os operadores ordenados por nome', async () => {
    const linhas = [{ id: '1', nome: 'Ana', codigo: '1111', papel: 'operador', ativo: true }]
    const c = chain({ data: linhas, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'operadores') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await operadoresService.listar()

    expect(resultado).toEqual(linhas)
    expect(c.order).toHaveBeenCalledWith('nome')
  })

  test('data null não quebra — devolve lista vazia', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: null }))
    expect(await operadoresService.listar()).toEqual([])
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('timeout') }))
    await expect(operadoresService.listar()).rejects.toThrow('timeout')
  })
})

describe('atualizarAtivo', () => {
  test('atualiza a coluna ativo do operador certo', async () => {
    const c = chain({ data: null, error: null })
    supabase.from.mockImplementation(() => c)

    await operadoresService.atualizarAtivo('op1', false)

    expect(c.update).toHaveBeenCalledWith({ ativo: false })
    expect(c.eq).toHaveBeenCalledWith('id', 'op1')
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('falhou') }))
    await expect(operadoresService.atualizarAtivo('op1', true)).rejects.toThrow('falhou')
  })
})

describe('criarComCodigo', () => {
  test('sem sessão ativa, não chega a chamar fetch', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })

    await expect(operadoresService.criarComCodigo({ nome: 'Ana', codigo: '1111', pin: '123456' }))
      .rejects.toThrow('Sessão expirada. Faça login novamente.')
    expect(fetch).not.toHaveBeenCalled()
  })

  test('sucesso: manda Bearer do admin logado e os dados certos pro endpoint certo', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-admin' } } })
    fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, operador: { id: 'novo', nome: 'Ana' } }) })

    const resultado = await operadoresService.criarComCodigo({ nome: 'Ana', codigo: '1111', pin: '123456' })

    const [url, opcoes] = fetch.mock.calls[0]
    expect(url).toMatch(/\/operador\/criar-com-codigo$/)
    expect(opcoes.headers.Authorization).toBe('Bearer tok-admin')
    expect(JSON.parse(opcoes.body)).toEqual({ nome: 'Ana', codigo: '1111', pin: '123456', papel: 'operador' })
    expect(resultado).toEqual({ id: 'novo', nome: 'Ana' })
  })

  test('respeita papel explícito (admin)', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })

    await operadoresService.criarComCodigo({ nome: 'Beto', codigo: '2222', pin: '654321', papel: 'admin' })

    const opcoes = fetch.mock.calls[0][1]
    expect(JSON.parse(opcoes.body).papel).toBe('admin')
  })

  test('resposta de erro do bot (ex.: código já em uso) vira exceção com a mensagem do corpo', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
    fetch.mockResolvedValue({ ok: false, json: async () => ({ ok: false, erro: 'Já existe um operador com esse código.' }) })

    await expect(operadoresService.criarComCodigo({ nome: 'Ana', codigo: '1111', pin: '123456' }))
      .rejects.toThrow('Já existe um operador com esse código.')
  })
})

describe('resetarPin', () => {
  test('sem sessão ativa, não chega a chamar fetch', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })

    await expect(operadoresService.resetarPin('op1', '123456')).rejects.toThrow(
      'Sessão expirada. Faça login novamente.'
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  test('sucesso: manda Bearer do admin e o pin no corpo, pro endpoint certo com o id do operador', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-admin' } } })

    await operadoresService.resetarPin('op1', '654321')

    const [url, opcoes] = fetch.mock.calls[0]
    expect(url).toMatch(/\/operador\/op1\/reset-pin$/)
    expect(opcoes.headers.Authorization).toBe('Bearer tok-admin')
    expect(JSON.parse(opcoes.body)).toEqual({ pin: '654321' })
  })

  test('resposta de erro do bot vira exceção com a mensagem do corpo', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
    fetch.mockResolvedValue({ ok: false, json: async () => ({ ok: false, erro: 'Operador sem código de login definido.' }) })

    await expect(operadoresService.resetarPin('op1', '111111')).rejects.toThrow(
      'Operador sem código de login definido.'
    )
  })

  test('resposta sem corpo JSON válido cai no fallback de mensagem genérica', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
    fetch.mockResolvedValue({ ok: false, json: async () => { throw new Error('corpo vazio') } })

    await expect(operadoresService.resetarPin('op1', '111111')).rejects.toThrow('Falha ao definir o PIN.')
  })
})
