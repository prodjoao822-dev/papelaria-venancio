// Testes das queries de métricas de capacidade operacional (PROMPT-01,
// Entrega 1: taxa de resolução IA, tempo médio de atendimento por operador,
// tempo médio de separação, volume por período).
//
// Dublê do Supabase: `supabase.from(tabela)` retorna uma chain "thenable"
// (select/eq/gte/lt/in encadeiam e devolvem a própria chain; `await` nela
// dispara `.then()`), configurada por teste via `supabase.from.mockImplementation`.
import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/supabase/client', () => ({ supabase: { from: vi.fn() } }))

import { supabase } from '@/supabase/client'
import { metricasService } from './metricas.service'

function chain(result) {
  const c = {
    select: () => c,
    eq: () => c,
    gte: () => c,
    lt: () => c,
    in: () => c,
    then: (resolve) => resolve(result),
  }
  return c
}

beforeEach(() => {
  supabase.from.mockReset()
})

describe('getTaxaResolucaoIA', () => {
  test('conversas sem nenhuma mensagem de operador contam como resolvidas por IA', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela === 'conversas') {
        return chain({ data: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }], error: null })
      }
      if (tabela === 'mensagens') {
        // só c1 teve mensagem de operador
        return chain({ data: [{ conversa_id: 'c1' }], error: null })
      }
      throw new Error(`tabela inesperada: ${tabela}`)
    })

    const resultado = await metricasService.getTaxaResolucaoIA('semana')

    expect(resultado.total).toBe(3)
    expect(resultado.resolvidas_ia).toBe(2)
    expect(resultado.taxa).toBeCloseTo(66.7, 1)
  })

  test('operador_id zerado por liberarConversa não conta como intervenção humana perdida — usa mensagens, não conversas.operador_id', async () => {
    // Cenário do bug corrigido: uma conversa que já teve um operador e foi
    // liberada de volta à IA (operador_id = null hoje) só é excluída da taxa
    // de resolução por IA se existir mensagem remetente='humano' registrada.
    supabase.from.mockImplementation((tabela) => {
      if (tabela === 'conversas') return chain({ data: [{ id: 'c1' }], error: null })
      if (tabela === 'mensagens') return chain({ data: [{ conversa_id: 'c1' }], error: null })
      throw new Error(`tabela inesperada: ${tabela}`)
    })

    const resultado = await metricasService.getTaxaResolucaoIA()

    expect(resultado.resolvidas_ia).toBe(0)
    expect(resultado.taxa).toBe(0)
  })

  test('sem conversas no período, retorna zeros sem consultar mensagens', async () => {
    const fromMock = vi.fn((tabela) => {
      if (tabela === 'conversas') return chain({ data: [], error: null })
      throw new Error(`não deveria consultar ${tabela} sem conversas`)
    })
    supabase.from.mockImplementation(fromMock)

    const resultado = await metricasService.getTaxaResolucaoIA()

    expect(resultado).toEqual({ total: 0, resolvidas_ia: 0, taxa: 0 })
  })
})

describe('getTempoMedioAtendimento', () => {
  test('agrupa por operador e calcula a média em minutos', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'pedidos_status_historico') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({
        data: [
          {
            criado_em: '2026-08-20T10:20:00Z',
            pedidos: { criado_em: '2026-08-20T10:00:00Z', operadores: { nome: 'Ana' } },
          },
          {
            criado_em: '2026-08-20T11:40:00Z',
            pedidos: { criado_em: '2026-08-20T11:00:00Z', operadores: { nome: 'Ana' } },
          },
          {
            criado_em: '2026-08-20T09:30:00Z',
            pedidos: { criado_em: '2026-08-20T09:00:00Z', operadores: null },
          },
        ],
        error: null,
      })
    })

    const resultado = await metricasService.getTempoMedioAtendimento()

    const ana = resultado.find((r) => r.operador_nome === 'Ana')
    expect(ana.total_pedidos).toBe(2)
    expect(ana.tempo_medio_min).toBe(30) // média de 20min e 40min

    const semOperador = resultado.find((r) => r.operador_nome === 'Sem operador')
    expect(semOperador.tempo_medio_min).toBe(30)
  })
})

describe('getTempoMedioSeparacao', () => {
  test('usa iniciada_em/concluida_em, não criado_em/atualizado_em', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'solicitacoes_separacao') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({
        data: [
          // 15min de separação de fato, mesmo que criado_em (não retornado
          // pela query) tivesse ficado horas na fila antes de começar.
          { iniciada_em: '2026-08-20T10:00:00Z', concluida_em: '2026-08-20T10:15:00Z', status: 'pronta' },
          { iniciada_em: '2026-08-20T11:00:00Z', concluida_em: '2026-08-20T11:25:00Z', status: 'pronta' },
        ],
        error: null,
      })
    })

    const resultado = await metricasService.getTempoMedioSeparacao()

    expect(resultado.total_separacoes).toBe(2)
    expect(resultado.tempo_medio_min).toBe(20) // média de 15min e 25min
  })

  test('sem separações concluídas, retorna zeros', async () => {
    supabase.from.mockImplementation(() => chain({ data: [], error: null }))

    const resultado = await metricasService.getTempoMedioSeparacao()

    expect(resultado).toEqual({ tempo_medio_min: 0, total_separacoes: 0 })
  })
})

describe('getVolumePeriodo', () => {
  test('retorna 7 dias com contagem de conversas e pedidos', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela === 'conversas') return chain({ count: 2, error: null })
      if (tabela === 'pedidos') return chain({ count: 1, error: null })
      throw new Error(`tabela inesperada: ${tabela}`)
    })

    const resultado = await metricasService.getVolumePeriodo()

    expect(resultado).toHaveLength(7)
    for (const dia of resultado) {
      expect(dia.conversas).toBe(2)
      expect(dia.pedidos).toBe(1)
      expect(dia.dia).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
