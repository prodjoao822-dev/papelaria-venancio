// Testes de formatters.js — funções puras de exibição usadas em toda a UI
// do dashboard. TZ fixado em America/Sao_Paulo (mesmo fuso da loja) pra
// datas não mudarem de dia dependendo de onde o teste rodar.
process.env.TZ = 'America/Sao_Paulo'

import { describe, test, expect, vi, afterEach } from 'vitest'
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatTimeAgo,
  formatPhone,
  formatEntrega,
  truncateText,
} from './formatters'

describe('formatCurrency', () => {
  test('formata valor positivo em reais', () => {
    expect(formatCurrency(1234.5)).toMatch(/R\$\s*1\.234,50/)
  })

  test('valor undefined/null vira R$ 0,00 (nunca "R$ undefined")', () => {
    expect(formatCurrency(undefined)).toMatch(/R\$\s*0,00/)
    expect(formatCurrency(null)).toMatch(/R\$\s*0,00/)
  })

  test('zero formata normalmente', () => {
    expect(formatCurrency(0)).toMatch(/R\$\s*0,00/)
  })
})

describe('formatDate', () => {
  test('data válida formata dd/mm/aaaa', () => {
    expect(formatDate('2026-08-31T12:00:00Z')).toBe('31/08/2026')
  })

  test('string vazia/null/undefined vira travessão, não "Invalid Date"', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('')).toBe('—')
  })

  test('aceita opções extras do Intl.DateTimeFormat (ex.: sem ano)', () => {
    const resultado = formatDate('2026-08-31T12:00:00Z', { year: undefined })
    expect(resultado).toContain('31/08')
  })
})

describe('formatDateTime', () => {
  test('data válida formata dd/mm/aaaa hh:mm', () => {
    expect(formatDateTime('2026-08-31T14:30:00Z')).toMatch(/31\/08\/2026,?\s+\d{2}:\d{2}/)
  })

  test('vazio vira travessão', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime('')).toBe('—')
  })
})

describe('formatTimeAgo', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('string vazia devolve string vazia (não travessão, não erro)', () => {
    expect(formatTimeAgo(null)).toBe('')
    expect(formatTimeAgo('')).toBe('')
  })

  test('menos de 60s → "agora há pouco"', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T12:00:30Z'))
    expect(formatTimeAgo('2026-08-31T12:00:00Z')).toBe('agora há pouco')
  })

  test('entre 1 e 59min → "há Xmin"', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T12:10:00Z'))
    expect(formatTimeAgo('2026-08-31T12:00:00Z')).toBe('há 10min')
  })

  test('entre 1 e 23h → "há Xh"', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T15:00:00Z'))
    expect(formatTimeAgo('2026-08-31T12:00:00Z')).toBe('há 3h')
  })

  test('24h ou mais cai pro formato de data (formatDate)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z'))
    expect(formatTimeAgo('2026-08-31T12:00:00Z')).toBe(formatDate('2026-08-31T12:00:00Z'))
  })
})

describe('formatPhone', () => {
  test('13 dígitos (com 55 + DDI) formata +55 (DD) NNNNN-NNNN', () => {
    expect(formatPhone('5527998489094')).toBe('+55 (27) 99848-9094')
  })

  test('11 dígitos (celular sem 55) formata (DD) NNNNN-NNNN', () => {
    expect(formatPhone('27998489094')).toBe('(27) 99848-9094')
  })

  test('10 dígitos (fixo sem 55) formata (DD) NNNN-NNNN', () => {
    expect(formatPhone('2733334444')).toBe('(27) 3333-4444')
  })

  test('quantidade de dígitos fora do esperado devolve o valor original, sem quebrar', () => {
    expect(formatPhone('123')).toBe('123')
  })

  test('vazio/null vira travessão', () => {
    expect(formatPhone(null)).toBe('—')
    expect(formatPhone('')).toBe('—')
  })

  test('ignora caracteres não-numéricos já formatados na entrada', () => {
    expect(formatPhone('+55 (27) 99848-9094')).toBe('+55 (27) 99848-9094')
  })
})

describe('formatEntrega', () => {
  test('mapeia as 3 formas conhecidas pro rótulo em português', () => {
    expect(formatEntrega('retirada')).toBe('Retirada na loja')
    expect(formatEntrega('entrega_propria')).toBe('Entrega própria')
    expect(formatEntrega('uber_flash')).toBe('Uber Flash / Motoboy')
  })

  test('valor desconhecido devolve o próprio valor (não inventa rótulo)', () => {
    expect(formatEntrega('correios')).toBe('correios')
  })

  test('null/undefined vira travessão', () => {
    expect(formatEntrega(null)).toBe('—')
    expect(formatEntrega(undefined)).toBe('—')
  })
})

describe('truncateText', () => {
  test('texto menor que o limite não é alterado', () => {
    expect(truncateText('texto curto', 40)).toBe('texto curto')
  })

  test('texto maior que o limite é cortado com reticências', () => {
    const texto = 'a'.repeat(50)
    const resultado = truncateText(texto, 10)
    expect(resultado).toBe('a'.repeat(10) + '…')
    expect(resultado.length).toBe(11)
  })

  test('usa 40 como limite padrão quando não informado', () => {
    const texto = 'a'.repeat(41)
    expect(truncateText(texto)).toBe('a'.repeat(40) + '…')
  })

  test('vazio/null devolve string vazia', () => {
    expect(truncateText(null)).toBe('')
    expect(truncateText('')).toBe('')
  })
})
