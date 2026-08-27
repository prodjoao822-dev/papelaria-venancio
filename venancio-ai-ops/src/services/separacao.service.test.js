// Testes de separacao.service.js — foco nas áreas sensíveis (T4.2, plano de
// 26-08). É quase inteiramente um wrapper fino sobre RPCs de status
// (delegar_separacao, concluir_separacao, cancelar_separacao...) — sem
// verificação, um erro de digitação no nome da função ou no shape dos
// parâmetros só aparece em produção, na hora do clique. Não há chamada de
// rede real (fetch) neste service, só supabase.rpc/from.
import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { supabase } from '@/supabase/client'
import { separacaoService } from './separacao.service'

const METODOS_CHAIN = ['select', 'order', 'eq', 'in', 'limit']

function chain(result) {
  const c = {}
  METODOS_CHAIN.forEach((metodo) => { c[metodo] = vi.fn(() => c) })
  c.single = vi.fn(() => Promise.resolve(result))
  c.then = (resolve) => resolve(result)
  return c
}

beforeEach(() => {
  supabase.from.mockReset()
  supabase.rpc.mockReset()
})

describe('delegar', () => {
  test('repassa todos os campos pra RPC delegar_separacao com os nomes p_* certos', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'sol1' }, error: null })

    const resultado = await separacaoService.delegar({
      pedidoId: 'p1',
      separadorId: 'func1',
      prioridade: 'alta',
      horarioRetirada: '2026-08-27T15:00:00Z',
      observacao: 'cliente vem buscar cedo',
    })

    expect(supabase.rpc).toHaveBeenCalledWith('delegar_separacao', {
      p_pedido_id: 'p1',
      p_separador_id: 'func1',
      p_prioridade: 'alta',
      p_horario_retirada: '2026-08-27T15:00:00Z',
      p_observacao: 'cliente vem buscar cedo',
    })
    expect(resultado.id).toBe('sol1')
  })

  test('sem horário/observação, manda null explícito (não undefined)', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'sol1' }, error: null })

    await separacaoService.delegar({ pedidoId: 'p1', separadorId: 'func1', prioridade: 'normal' })

    expect(supabase.rpc).toHaveBeenCalledWith('delegar_separacao', {
      p_pedido_id: 'p1',
      p_separador_id: 'func1',
      p_prioridade: 'normal',
      p_horario_retirada: null,
      p_observacao: null,
    })
  })

  test('erro da RPC (ex.: separador ocupado) é propagado', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('separador já tem 3 solicitações abertas') })

    await expect(
      separacaoService.delegar({ pedidoId: 'p1', separadorId: 'func1', prioridade: 'normal' })
    ).rejects.toThrow('separador já tem 3 solicitações abertas')
  })
})

describe('separacaoRapida', () => {
  test('chama separacao_rapida com pedido e observação opcional', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'sol2' }, error: null })

    await separacaoService.separacaoRapida({ pedidoId: 'p2', observacao: null })

    expect(supabase.rpc).toHaveBeenCalledWith('separacao_rapida', { p_pedido_id: 'p2', p_observacao: null })
  })

  test('erro da RPC (ex.: mais de 7 itens — LIMITE_ITENS da separação rápida) é propagado', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('Separação rápida permite no máximo 7 itens') })

    await expect(separacaoService.separacaoRapida({ pedidoId: 'p2' })).rejects.toThrow(
      'Separação rápida permite no máximo 7 itens'
    )
  })
})

describe('marcarItem', () => {
  test('grava exatamente o boolean recebido, não inverte', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'item1', separado: true }, error: null })

    await separacaoService.marcarItem('item1', true)

    expect(supabase.rpc).toHaveBeenCalledWith('marcar_item_separado_solicitacao', {
      p_solicitacao_item_id: 'item1',
      p_separado: true,
    })
  })
})

describe('concluir', () => {
  test('chama concluir_separacao só com o id da solicitação', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'sol1', status: 'pronta' }, error: null })

    const resultado = await separacaoService.concluir('sol1')

    expect(supabase.rpc).toHaveBeenCalledWith('concluir_separacao', { p_solicitacao_id: 'sol1' })
    expect(resultado.status).toBe('pronta')
  })

  test('erro (ex.: ainda há item não separado) é propagado, não é regra de UI', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('Ainda há 2 item(ns) não separado(s)') })

    await expect(separacaoService.concluir('sol1')).rejects.toThrow('Ainda há 2 item(ns) não separado(s)')
  })
})

describe('cancelar', () => {
  test('repassa o motivo pra RPC cancelar_separacao', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'sol1', status: 'cancelada' }, error: null })

    await separacaoService.cancelar('sol1', 'cliente desistiu')

    expect(supabase.rpc).toHaveBeenCalledWith('cancelar_separacao', { p_solicitacao_id: 'sol1', p_motivo: 'cliente desistiu' })
  })

  test('sem motivo, manda null explícito', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    await separacaoService.cancelar('sol1')

    expect(supabase.rpc).toHaveBeenCalledWith('cancelar_separacao', { p_solicitacao_id: 'sol1', p_motivo: null })
  })
})

describe('enviarMensagem', () => {
  test('repassa o texto exato pra RPC enviar_mensagem_separacao', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'msg1' }, error: null })

    await separacaoService.enviarMensagem('sol1', 'Já terminei os itens de papelaria')

    expect(supabase.rpc).toHaveBeenCalledWith('enviar_mensagem_separacao', {
      p_solicitacao_id: 'sol1',
      p_texto: 'Já terminei os itens de papelaria',
    })
  })
})

describe('marcarNotificacaoLida', () => {
  test('chama marcar_notificacao_lida com o id da notificação', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    await separacaoService.marcarNotificacaoLida('notif1')

    expect(supabase.rpc).toHaveBeenCalledWith('marcar_notificacao_lida', { p_id: 'notif1' })
  })
})

describe('listar', () => {
  test('sem filtros, não aplica eq nem in', async () => {
    const c = chain({ data: [{ id: 'sol1' }], error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'solicitacoes_separacao') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await separacaoService.listar()

    expect(c.eq).not.toHaveBeenCalled()
    expect(c.in).not.toHaveBeenCalled()
    expect(resultado).toHaveLength(1)
  })

  test('filtros.status usa eq; filtros.statusIn usa in — não são a mesma coisa', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await separacaoService.listar({ status: 'pendente' })
    expect(c.eq).toHaveBeenCalledWith('status', 'pendente')

    c.eq.mockClear()
    c.in.mockClear()
    await separacaoService.listar({ statusIn: ['pendente', 'em_andamento'] })
    expect(c.in).toHaveBeenCalledWith('status', ['pendente', 'em_andamento'])
    expect(c.eq).not.toHaveBeenCalled()
  })

  test('lista vazia quando data vem null (não quebra em .map em quem chama)', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: null }))

    const resultado = await separacaoService.listar()

    expect(resultado).toEqual([])
  })
})

describe('listarNotificacoes', () => {
  test('sempre filtra destinatario_tipo = operador', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'notificacoes_internas') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await separacaoService.listarNotificacoes()

    expect(c.eq).toHaveBeenCalledWith('destinatario_tipo', 'operador')
  })

  test('apenasNaoLidas=true soma o filtro lida=false ao filtro de destinatário', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await separacaoService.listarNotificacoes({ apenasNaoLidas: true })

    expect(c.eq).toHaveBeenCalledWith('destinatario_tipo', 'operador')
    expect(c.eq).toHaveBeenCalledWith('lida', false)
  })
})
