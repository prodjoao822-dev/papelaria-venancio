// Testes de separadorAdmin.service.js — provisionamento/reset de PIN do
// Separador. Sensível: só o backend do JS Bot (service key) pode gravar o
// PIN, o dashboard nunca grava direto — o service só chama o endpoint com o
// Bearer do operador logado. Mesmo padrão de fetch de
// orcamentos.service.test.js#enviarPdf.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/supabase/client', () => ({ supabase: { auth: { getSession: vi.fn() } } }))

import { supabase } from '@/supabase/client'
import { separadorAdminService } from './separadorAdmin.service'

beforeEach(() => {
  supabase.auth.getSession.mockReset()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('gerarPin', () => {
  test('sempre gera uma string de 6 dígitos', () => {
    for (let i = 0; i < 20; i++) {
      const pin = separadorAdminService.gerarPin()
      expect(pin).toMatch(/^\d{6}$/)
    }
  })

  test('nunca começa com dígitos que dariam menos de 6 caracteres (mínimo 100000)', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(separadorAdminService.gerarPin()).toBe('100000')
    spy.mockRestore()
  })

  test('valor máximo possível ainda tem 6 dígitos', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.999999999)
    expect(separadorAdminService.gerarPin()).toMatch(/^\d{6}$/)
    spy.mockRestore()
  })
})

describe('resetarPin', () => {
  test('sem sessão ativa, não chega a chamar fetch', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })

    await expect(separadorAdminService.resetarPin('func1', '123456')).rejects.toThrow(
      'Sessão expirada. Faça login novamente.'
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  test('sucesso: manda Bearer do operador e o pin no corpo, pro endpoint certo com o id do funcionário', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-operador' } } })

    await separadorAdminService.resetarPin('func1', '654321')

    const [url, opcoes] = fetch.mock.calls[0]
    expect(url).toMatch(/\/operador\/separador\/func1\/reset-pin$/)
    expect(opcoes.headers.Authorization).toBe('Bearer tok-operador')
    expect(JSON.parse(opcoes.body)).toEqual({ pin: '654321' })
  })

  test('resposta de erro do bot (ex.: quem chama não é admin) vira exceção com a mensagem do corpo', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
    fetch.mockResolvedValue({ ok: false, json: async () => ({ ok: false, erro: 'Apenas administradores podem resetar PIN.' }) })

    await expect(separadorAdminService.resetarPin('func1', '111111')).rejects.toThrow(
      'Apenas administradores podem resetar PIN.'
    )
  })

  test('resposta 200 mas corpo.ok=false também é tratado como erro', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
    fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: false, erro: 'funcionário não é separador' }) })

    await expect(separadorAdminService.resetarPin('func1', '111111')).rejects.toThrow('funcionário não é separador')
  })

  test('resposta sem corpo JSON válido cai no fallback de mensagem genérica', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
    fetch.mockResolvedValue({ ok: false, json: async () => { throw new Error('corpo vazio') } })

    await expect(separadorAdminService.resetarPin('func1', '111111')).rejects.toThrow('Falha ao definir o PIN.')
  })
})
