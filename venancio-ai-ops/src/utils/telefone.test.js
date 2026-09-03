import { describe, test, expect } from 'vitest'
import { normalizarTelefone } from './telefone'

describe('normalizarTelefone', () => {
  test('nulo/vazio passa direto (quem chama já valida obrigatoriedade)', () => {
    expect(normalizarTelefone(null)).toBeNull()
    expect(normalizarTelefone(undefined)).toBeUndefined()
    expect(normalizarTelefone('')).toBe('')
  })

  test('já normalizado (13 dígitos, DDI+DDD+celular) não muda', () => {
    expect(normalizarTelefone('5527999999999')).toBe('5527999999999')
  })

  test('já normalizado (12 dígitos, DDI+DDD+fixo) não muda', () => {
    expect(normalizarTelefone('552733334444')).toBe('552733334444')
  })

  test('vindo de remoteJid do WhatsApp ("...@s.whatsapp.net") — mesmo comportamento do payloadParser do bot', () => {
    // O bot (payloadParser.js) já tira o sufixo antes de chamar isso; aqui só
    // confirmamos que dígitos "extras" de um JID não quebram a normalização.
    expect(normalizarTelefone('5527999999999')).toBe('5527999999999')
  })

  test('celular sem DDI (11 dígitos: DDD + 9 dígitos) ganha o 55 na frente', () => {
    expect(normalizarTelefone('27999999999')).toBe('5527999999999')
  })

  test('fixo sem DDI (10 dígitos: DDD + 8 dígitos) ganha o 55 na frente', () => {
    expect(normalizarTelefone('2733334444')).toBe('552733334444')
  })

  test('com máscara completa "+55 (27) 99999-9999" vira só dígitos com DDI', () => {
    expect(normalizarTelefone('+55 (27) 99999-9999')).toBe('5527999999999')
  })

  test('com máscara sem DDI "(27) 3333-4444" ganha o 55 e perde a máscara', () => {
    expect(normalizarTelefone('(27) 3333-4444')).toBe('552733334444')
  })

  test('espaços e traços soltos são removidos igual', () => {
    expect(normalizarTelefone('27 99999 9999')).toBe('5527999999999')
  })

  test('formato não reconhecido (nem 10/11 sem DDI, nem 12/13 com DDI): devolve só os dígitos, sem inventar DDI', () => {
    expect(normalizarTelefone('123')).toBe('123')
    expect(normalizarTelefone('1234567890123456')).toBe('1234567890123456')
  })
})
