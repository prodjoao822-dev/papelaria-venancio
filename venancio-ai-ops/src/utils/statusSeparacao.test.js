// Testes de statusSeparacao.js — config visual (cor/ícone/label) dos status
// de solicitacoes_separacao e da prioridade imediata/agendada (RN-02).
import { describe, test, expect } from 'vitest'
import {
  STATUS_SEPARACAO_CONFIG,
  getStatusSeparacaoConfig,
  PRIORIDADE_SEPARACAO_CONFIG,
  getPrioridadeSeparacaoConfig,
} from './statusSeparacao'

describe('getStatusSeparacaoConfig', () => {
  test('devolve a config exata pros 4 status reais conhecidos', () => {
    for (const status of ['pendente', 'em_andamento', 'pronta', 'cancelada']) {
      expect(getStatusSeparacaoConfig(status)).toBe(STATUS_SEPARACAO_CONFIG[status])
    }
  })

  test('cada config conhecida tem todos os campos visuais preenchidos', () => {
    for (const status of Object.keys(STATUS_SEPARACAO_CONFIG)) {
      const config = STATUS_SEPARACAO_CONFIG[status]
      expect(config).toMatchObject({
        label: expect.any(String),
        labelCurto: expect.any(String),
        cor: expect.stringMatching(/^#[0-9A-Fa-f]{6}$/),
        bg: expect.any(String),
        borda: expect.any(String),
        icone: expect.any(String),
      })
    }
  })

  test('status desconhecido cai no fallback neutro, usando o próprio valor como label (nunca "undefined")', () => {
    const config = getStatusSeparacaoConfig('status_que_nao_existe')
    expect(config.label).toBe('status_que_nao_existe')
    expect(config.labelCurto).toBe('status_que_nao_existe')
    expect(config.icone).toBe('❓')
    expect(config.cor).toBe('#8A90A6')
  })

  test('status undefined/null também cai no fallback sem quebrar', () => {
    expect(() => getStatusSeparacaoConfig(undefined)).not.toThrow()
    expect(() => getStatusSeparacaoConfig(null)).not.toThrow()
  })
})

describe('getPrioridadeSeparacaoConfig', () => {
  test('devolve a config exata pras 2 prioridades conhecidas', () => {
    expect(getPrioridadeSeparacaoConfig('imediata')).toBe(PRIORIDADE_SEPARACAO_CONFIG.imediata)
    expect(getPrioridadeSeparacaoConfig('agendada')).toBe(PRIORIDADE_SEPARACAO_CONFIG.agendada)
  })

  test('prioridade desconhecida cai no fallback "imediata" (nunca undefined) — prioridade errada deve chamar atenção, não passar despercebida', () => {
    expect(getPrioridadeSeparacaoConfig('nao_existe')).toBe(PRIORIDADE_SEPARACAO_CONFIG.imediata)
  })

  test('prioridade undefined/null também cai no fallback "imediata"', () => {
    expect(getPrioridadeSeparacaoConfig(undefined)).toBe(PRIORIDADE_SEPARACAO_CONFIG.imediata)
    expect(getPrioridadeSeparacaoConfig(null)).toBe(PRIORIDADE_SEPARACAO_CONFIG.imediata)
  })
})
