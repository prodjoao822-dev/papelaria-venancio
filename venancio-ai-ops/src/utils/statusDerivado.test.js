// Testes de statusDerivado.js — a lógica mais sensível do dashboard: o
// status "de vitrine" (8 valores) nunca é um campo próprio, é sempre
// derivado de status_pedido + forma_entrega + as duas datas de logística
// (ver comentário no topo do arquivo). Um erro aqui mostra o pedido na
// coluna errada do quadro pro operador, sem nenhum erro visível.
import { describe, test, expect, vi } from 'vitest'
import {
  derivarStatusDashboard,
  mapStatusRealParaDashboard,
  aplicarFiltroStatusDashboard,
  STATUS_DASHBOARD_PARA_REAL,
} from './statusDerivado'

describe('derivarStatusDashboard', () => {
  test('pedido nulo/undefined devolve null', () => {
    expect(derivarStatusDashboard(null)).toBeNull()
    expect(derivarStatusDashboard(undefined)).toBeNull()
  })

  test('status simples (sem ambiguidade de retirada/entrega) mapeia direto', () => {
    expect(derivarStatusDashboard({ status: 'confirmado' })).toBe('NOVO_PEDIDO')
    expect(derivarStatusDashboard({ status: 'em_separacao' })).toBe('EM_SEPARACAO')
    expect(derivarStatusDashboard({ status: 'concluido' })).toBe('FINALIZADO')
    expect(derivarStatusDashboard({ status: 'cancelado' })).toBe('CANCELADO')
  })

  test('status desconhecido/não mapeado devolve o próprio valor (fallback), não null', () => {
    expect(derivarStatusDashboard({ status: 'aguardando_pagamento' })).toBe('aguardando_pagamento')
  })

  describe('status "pronto" — o único ambíguo, depende de forma_entrega + datas', () => {
    test('retirada com pronto_para_retirada_em preenchido → PRONTO_RETIRADA', () => {
      expect(
        derivarStatusDashboard({ status: 'pronto', forma_entrega: 'retirada', pronto_para_retirada_em: '2026-08-31T10:00:00Z' })
      ).toBe('PRONTO_RETIRADA')
    })

    test('entrega própria com saiu_para_entrega_em preenchido → SAIU_ENTREGA', () => {
      expect(
        derivarStatusDashboard({ status: 'pronto', forma_entrega: 'entrega_propria', saiu_para_entrega_em: '2026-08-31T10:00:00Z' })
      ).toBe('SAIU_ENTREGA')
    })

    test('uber_flash com saiu_para_entrega_em preenchido também → SAIU_ENTREGA', () => {
      expect(
        derivarStatusDashboard({ status: 'pronto', forma_entrega: 'uber_flash', saiu_para_entrega_em: '2026-08-31T10:00:00Z' })
      ).toBe('SAIU_ENTREGA')
    })

    test('retirada SEM pronto_para_retirada_em ainda → SEPARADO (ainda não avisou o cliente)', () => {
      expect(
        derivarStatusDashboard({ status: 'pronto', forma_entrega: 'retirada', pronto_para_retirada_em: null })
      ).toBe('SEPARADO')
    })

    test('entrega SEM saiu_para_entrega_em ainda → SEPARADO (separado mas não saiu pra rua)', () => {
      expect(
        derivarStatusDashboard({ status: 'pronto', forma_entrega: 'entrega_propria', saiu_para_entrega_em: null })
      ).toBe('SEPARADO')
    })

    test('retirada com saiu_para_entrega_em preenchido (dado inconsistente) NÃO vira SAIU_ENTREGA — a condição exige forma_entrega != retirada', () => {
      expect(
        derivarStatusDashboard({ status: 'pronto', forma_entrega: 'retirada', saiu_para_entrega_em: '2026-08-31T10:00:00Z' })
      ).toBe('SEPARADO')
    })
  })
})

describe('mapStatusRealParaDashboard (versão do histórico, sem forma_entrega/datas)', () => {
  test('"pronto" sempre vira SEPARADO, mesmo sem contexto de entrega/retirada', () => {
    expect(mapStatusRealParaDashboard('pronto')).toBe('SEPARADO')
  })

  test('demais status usam o mesmo mapa simples', () => {
    expect(mapStatusRealParaDashboard('confirmado')).toBe('NOVO_PEDIDO')
    expect(mapStatusRealParaDashboard('em_separacao')).toBe('EM_SEPARACAO')
    expect(mapStatusRealParaDashboard('concluido')).toBe('FINALIZADO')
    expect(mapStatusRealParaDashboard('cancelado')).toBe('CANCELADO')
  })

  test('status desconhecido devolve o próprio valor', () => {
    expect(mapStatusRealParaDashboard('estado_esquisito')).toBe('estado_esquisito')
  })
})

describe('aplicarFiltroStatusDashboard', () => {
  // Query builder falso — cada método devolve `this` (encadeável) e registra
  // as chamadas pra podermos inspecionar o filtro final montado.
  function queryFalsa() {
    const chamadas = []
    const q = {}
    ;['eq', 'is', 'not', 'in'].forEach((metodo) => {
      q[metodo] = vi.fn((...args) => {
        chamadas.push([metodo, ...args])
        return q
      })
    })
    q._chamadas = chamadas
    return q
  }

  test('NOVO_PEDIDO e AGUARDANDO_CONFIRMACAO filtram por status=confirmado (mesmo alias)', () => {
    const q1 = queryFalsa()
    aplicarFiltroStatusDashboard(q1, 'NOVO_PEDIDO')
    expect(q1._chamadas).toEqual([['eq', 'status', 'confirmado']])

    const q2 = queryFalsa()
    aplicarFiltroStatusDashboard(q2, 'AGUARDANDO_CONFIRMACAO')
    expect(q2._chamadas).toEqual([['eq', 'status', 'confirmado']])
  })

  test('EM_SEPARACAO filtra por status=em_separacao', () => {
    const q = queryFalsa()
    aplicarFiltroStatusDashboard(q, 'EM_SEPARACAO')
    expect(q._chamadas).toEqual([['eq', 'status', 'em_separacao']])
  })

  test('SEPARADO filtra pronto + as duas datas de logística nulas', () => {
    const q = queryFalsa()
    aplicarFiltroStatusDashboard(q, 'SEPARADO')
    expect(q._chamadas).toEqual([
      ['eq', 'status', 'pronto'],
      ['is', 'pronto_para_retirada_em', null],
      ['is', 'saiu_para_entrega_em', null],
    ])
  })

  test('PRONTO_RETIRADA filtra pronto + retirada + data preenchida', () => {
    const q = queryFalsa()
    aplicarFiltroStatusDashboard(q, 'PRONTO_RETIRADA')
    expect(q._chamadas).toEqual([
      ['eq', 'status', 'pronto'],
      ['eq', 'forma_entrega', 'retirada'],
      ['not', 'pronto_para_retirada_em', 'is', null],
    ])
  })

  test('SAIU_ENTREGA filtra pronto + as 2 formas de entrega + data preenchida', () => {
    const q = queryFalsa()
    aplicarFiltroStatusDashboard(q, 'SAIU_ENTREGA')
    expect(q._chamadas).toEqual([
      ['eq', 'status', 'pronto'],
      ['in', 'forma_entrega', ['entrega_propria', 'uber_flash']],
      ['not', 'saiu_para_entrega_em', 'is', null],
    ])
  })

  test('FINALIZADO e CANCELADO mapeiam 1:1', () => {
    const q1 = queryFalsa()
    aplicarFiltroStatusDashboard(q1, 'FINALIZADO')
    expect(q1._chamadas).toEqual([['eq', 'status', 'concluido']])

    const q2 = queryFalsa()
    aplicarFiltroStatusDashboard(q2, 'CANCELADO')
    expect(q2._chamadas).toEqual([['eq', 'status', 'cancelado']])
  })

  test('status desconhecido devolve a query sem filtrar nada (não quebra, não filtra à toa)', () => {
    const q = queryFalsa()
    const resultado = aplicarFiltroStatusDashboard(q, 'ALGO_QUE_NAO_EXISTE')
    expect(resultado).toBe(q)
    expect(q._chamadas).toEqual([])
  })
})

describe('STATUS_DASHBOARD_PARA_REAL', () => {
  test('só cobre as 4 ações de escrita reais (não inclui NOVO_PEDIDO/AGUARDANDO_CONFIRMACAO, que não são gravadas por essa via)', () => {
    expect(STATUS_DASHBOARD_PARA_REAL).toEqual({
      EM_SEPARACAO: 'em_separacao',
      SEPARADO: 'pronto',
      FINALIZADO: 'concluido',
      CANCELADO: 'cancelado',
    })
  })
})
