// Testes de separadorAuth.service.js — login do Separador (código+PIN,
// RF-01 correto — diferente do login do Operador, que ainda é e-mail/senha).
// Ponto sensível: o dashboard NUNCA decide se o PIN bate — só repassa pro
// bot e aplica a sessão devolvida via setSession() no client ISOLADO
// (separadorSupabase), nunca no client do Operador.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/supabase/separadorClient', () => ({
  separadorSupabase: { auth: { setSession: vi.fn(), signOut: vi.fn() } },
}))

import { separadorSupabase } from '@/supabase/separadorClient'
import { separadorAuthService } from './separadorAuth.service'

beforeEach(() => {
  separadorSupabase.auth.setSession.mockReset()
  separadorSupabase.auth.signOut.mockReset()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('login', () => {
  test('sucesso: manda código+PIN pro bot, aplica a sessão devolvida no client isolado e devolve o funcionário', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        sessao: { access_token: 'tok123', refresh_token: 'ref123' },
        funcionario: { id: 'func1', nome: 'João Separador' },
      }),
    })
    separadorSupabase.auth.setSession.mockResolvedValue({ error: null })

    const funcionario = await separadorAuthService.login('SEP-001', '123456')

    const [url, opcoes] = fetch.mock.calls[0]
    expect(url).toMatch(/\/operador\/separador\/login$/)
    expect(JSON.parse(opcoes.body)).toEqual({ codigo_funcionario: 'SEP-001', pin: '123456' })
    expect(separadorSupabase.auth.setSession).toHaveBeenCalledWith({
      access_token: 'tok123',
      refresh_token: 'ref123',
    })
    expect(funcionario).toEqual({ id: 'func1', nome: 'João Separador' })
  })

  test('PIN errado: o bot devolve erro, e o service nunca chega a chamar setSession', async () => {
    fetch.mockResolvedValue({ ok: false, json: async () => ({ ok: false, erro: 'Código ou PIN inválido.' }) })

    await expect(separadorAuthService.login('SEP-001', '000000')).rejects.toThrow('Código ou PIN inválido.')
    expect(separadorSupabase.auth.setSession).not.toHaveBeenCalled()
  })

  test('bloqueio por tentativas (rate limit do bot) propaga a mensagem exata do bot', async () => {
    fetch.mockResolvedValue({ ok: false, json: async () => ({ ok: false, erro: 'Muitas tentativas. Tente novamente em 5 minutos.' }) })

    await expect(separadorAuthService.login('SEP-001', '123456')).rejects.toThrow(
      'Muitas tentativas. Tente novamente em 5 minutos.'
    )
  })

  test('resposta sem corpo JSON válido cai no fallback "Falha no login."', async () => {
    fetch.mockResolvedValue({ ok: false, json: async () => { throw new Error('corpo vazio') } })

    await expect(separadorAuthService.login('SEP-001', '123456')).rejects.toThrow('Falha no login.')
  })

  test('bot autoriza mas setSession falha (token inválido/expirado): erro é propagado', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, sessao: { access_token: 'tok-invalido', refresh_token: 'ref' }, funcionario: { id: 'func1' } }),
    })
    separadorSupabase.auth.setSession.mockResolvedValue({ error: new Error('token inválido') })

    await expect(separadorAuthService.login('SEP-001', '123456')).rejects.toThrow('token inválido')
  })
})

describe('logout', () => {
  test('desloga do client isolado do separador (não mexe no client do Operador)', async () => {
    separadorSupabase.auth.signOut.mockResolvedValue({ error: null })

    await separadorAuthService.logout()

    expect(separadorSupabase.auth.signOut).toHaveBeenCalledTimes(1)
  })
})
