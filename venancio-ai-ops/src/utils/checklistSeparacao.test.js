// Testes de checklistSeparacao.js — cobre o bug real encontrado em
// PedidoModal.jsx: um pedido separado via Separação Delegada/Rápida nunca
// grava em itens_pedido.separado (grava numa tabela paralela e avança
// pedidos.status direto pra 'pronto'), então o checklist deste modal
// mostrava "0/N separados" mesmo pra pedido já pronto.
import { describe, test, expect } from 'vitest'
import { calcularProgressoChecklist } from './checklistSeparacao'

describe('calcularProgressoChecklist', () => {
  test('lista vazia: total 0, progresso 0, nunca "tudo separado"', () => {
    expect(calcularProgressoChecklist([], 'em_separacao')).toEqual({
      total: 0,
      separados: 0,
      progresso: 0,
      tudoSeparado: false,
      separacaoConfirmadaPeloStatus: false,
    })
  })

  test('itens undefined/null tratados como lista vazia', () => {
    expect(calcularProgressoChecklist(undefined, 'em_separacao').total).toBe(0)
    expect(calcularProgressoChecklist(null, 'em_separacao').total).toBe(0)
  })

  test('nem todos separados: conta reais, não é "tudo separado"', () => {
    const itens = [{ separado: true }, { separado: false }, { separado: true }]
    const r = calcularProgressoChecklist(itens, 'em_separacao')
    expect(r).toEqual({
      total: 3,
      separados: 2,
      progresso: 67,
      tudoSeparado: false,
      separacaoConfirmadaPeloStatus: false,
    })
  })

  test('todos separados manualmente (checklist normal, sem depender do status)', () => {
    const itens = [{ separado: true }, { separado: true }]
    const r = calcularProgressoChecklist(itens, 'em_separacao')
    expect(r.tudoSeparado).toBe(true)
    expect(r.separados).toBe(2)
    expect(r.progresso).toBe(100)
    expect(r.separacaoConfirmadaPeloStatus).toBe(false)
  })

  test('separado=null/undefined em item não conta como separado', () => {
    const itens = [{ separado: null }, { separado: undefined }, {}]
    const r = calcularProgressoChecklist(itens, 'em_separacao')
    expect(r.separados).toBe(0)
    expect(r.tudoSeparado).toBe(false)
  })

  describe('bug real: pedido já "pronto" via Separação Delegada/Rápida', () => {
    test('status_real="pronto" força tudoSeparado mesmo com itens_pedido.separado todos false', () => {
      const itens = [{ separado: false }, { separado: false }, { separado: false }]
      const r = calcularProgressoChecklist(itens, 'pronto')
      expect(r.separacaoConfirmadaPeloStatus).toBe(true)
      expect(r.separados).toBe(3) // não fica "0/3" pra um pedido já pronto
      expect(r.total).toBe(3)
      expect(r.progresso).toBe(100)
      expect(r.tudoSeparado).toBe(true)
    })

    test('status_real="concluido" também confirma (pedido já passou de "pronto")', () => {
      const itens = [{ separado: false }]
      const r = calcularProgressoChecklist(itens, 'concluido')
      expect(r.separacaoConfirmadaPeloStatus).toBe(true)
      expect(r.tudoSeparado).toBe(true)
    })

    test('status_real="em_separacao" ou "confirmado" NÃO confirma — checklist reflete os itens de verdade', () => {
      const itens = [{ separado: false }, { separado: false }]
      expect(calcularProgressoChecklist(itens, 'em_separacao').tudoSeparado).toBe(false)
      expect(calcularProgressoChecklist(itens, 'confirmado').tudoSeparado).toBe(false)
    })

    test('status_real ausente/null não quebra e não confirma indevidamente', () => {
      const itens = [{ separado: false }]
      const r = calcularProgressoChecklist(itens, null)
      expect(r.separacaoConfirmadaPeloStatus).toBe(false)
      expect(r.tudoSeparado).toBe(false)
    })
  })
})
