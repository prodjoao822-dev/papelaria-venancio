// Testes de separacaoSeparador.service.js — lado do Separador dentro do
// próprio dashboard (rotas /separador/*, contexto de auth isolado). Usa
// separadorSupabase (client ISOLADO, storageKey diferente do Operador — ver
// separadorClient.js), nunca o client @/supabase/client. Mesmo padrão de
// separacao.service.test.js (o análogo do lado Operador): wrapper fino sobre
// RPCs, sem verificação hoje.
import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/supabase/separadorClient', () => ({ separadorSupabase: { from: vi.fn(), rpc: vi.fn() } }))

import { separadorSupabase } from '@/supabase/separadorClient'
import { separacaoSeparadorService } from './separacaoSeparador.service'

const METODOS_CHAIN = ['select', 'order', 'eq', 'in', 'limit']

function chain(result) {
  const c = {}
  METODOS_CHAIN.forEach((metodo) => { c[metodo] = vi.fn(() => c) })
  c.single = vi.fn(() => Promise.resolve(result))
  c.then = (resolve) => resolve(result)
  return c
}

beforeEach(() => {
  separadorSupabase.from.mockReset()
  separadorSupabase.rpc.mockReset()
})

describe('listarMinhas', () => {
  test('não filtra por funcionário manualmente — confia na RLS (separador_id = funcionario_atual_id())', async () => {
    const c = chain({ data: [{ id: 'sol1' }], error: null })
    separadorSupabase.from.mockImplementation((tabela) => {
      if (tabela !== 'solicitacoes_separacao') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await separacaoSeparadorService.listarMinhas()

    expect(c.eq).not.toHaveBeenCalled()
    expect(resultado).toHaveLength(1)
  })

  test('filtros.statusIn aplica in', async () => {
    const c = chain({ data: [], error: null })
    separadorSupabase.from.mockImplementation(() => c)

    await separacaoSeparadorService.listarMinhas({ statusIn: ['pendente', 'em_andamento'] })

    expect(c.in).toHaveBeenCalledWith('status', ['pendente', 'em_andamento'])
  })

  test('data null vira lista vazia', async () => {
    separadorSupabase.from.mockImplementation(() => chain({ data: null, error: null }))

    expect(await separacaoSeparadorService.listarMinhas()).toEqual([])
  })

  test('erro do banco é propagado', async () => {
    separadorSupabase.from.mockImplementation(() => chain({ data: null, error: new Error('sessão expirada') }))

    await expect(separacaoSeparadorService.listarMinhas()).rejects.toThrow('sessão expirada')
  })
})

describe('buscarPorId', () => {
  test('busca pelo id', async () => {
    separadorSupabase.from.mockImplementation((tabela) => {
      if (tabela !== 'solicitacoes_separacao') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({ data: { id: 'sol1' }, error: null })
    })

    const resultado = await separacaoSeparadorService.buscarPorId('sol1')

    expect(resultado.id).toBe('sol1')
  })

  test('erro (ex.: RLS bloqueando solicitação de outro separador) é propagado', async () => {
    separadorSupabase.from.mockImplementation(() => chain({ data: null, error: new Error('não encontrada') }))

    await expect(separacaoSeparadorService.buscarPorId('sol-de-outro')).rejects.toThrow('não encontrada')
  })
})

describe('listarMensagens', () => {
  test('filtra por solicitacao_id, ordena por criado_em asc', async () => {
    const c = chain({ data: [], error: null })
    separadorSupabase.from.mockImplementation((tabela) => {
      if (tabela !== 'solicitacoes_separacao_mensagens') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await separacaoSeparadorService.listarMensagens('sol1')

    expect(c.eq).toHaveBeenCalledWith('solicitacao_id', 'sol1')
    expect(c.order).toHaveBeenCalledWith('criado_em', { ascending: true })
  })
})

describe.each([
  ['assumir', 'assumir_separacao', ['sol1']],
  ['concluir', 'concluir_separacao', ['sol1']],
])('%s', (metodo, rpcEsperada) => {
  test(`chama ${rpcEsperada} com o id da solicitação`, async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: { id: 'sol1' }, error: null })

    await separacaoSeparadorService[metodo]('sol1')

    expect(separadorSupabase.rpc).toHaveBeenCalledWith(rpcEsperada, { p_solicitacao_id: 'sol1' })
  })

  test('erro da RPC é propagado', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: null, error: new Error('transição inválida') })

    await expect(separacaoSeparadorService[metodo]('sol1')).rejects.toThrow('transição inválida')
  })
})

describe('marcarItem', () => {
  test('grava exatamente o boolean recebido', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: { separado: true }, error: null })

    await separacaoSeparadorService.marcarItem('item1', true)

    expect(separadorSupabase.rpc).toHaveBeenCalledWith('marcar_item_separado_solicitacao', {
      p_solicitacao_item_id: 'item1',
      p_separado: true,
    })
  })
})

describe('cancelar', () => {
  test('repassa o motivo', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: { id: 'sol1' }, error: null })

    await separacaoSeparadorService.cancelar('sol1', 'não achei o item')

    expect(separadorSupabase.rpc).toHaveBeenCalledWith('cancelar_separacao', { p_solicitacao_id: 'sol1', p_motivo: 'não achei o item' })
  })

  test('sem motivo, manda null explícito', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: null, error: null })

    await separacaoSeparadorService.cancelar('sol1')

    expect(separadorSupabase.rpc).toHaveBeenCalledWith('cancelar_separacao', { p_solicitacao_id: 'sol1', p_motivo: null })
  })
})

describe('enviarMensagem', () => {
  test('repassa o texto exato', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: { id: 'msg1' }, error: null })

    await separacaoSeparadorService.enviarMensagem('sol1', 'Terminei os itens de papelaria')

    expect(separadorSupabase.rpc).toHaveBeenCalledWith('enviar_mensagem_separacao', {
      p_solicitacao_id: 'sol1',
      p_texto: 'Terminei os itens de papelaria',
    })
  })
})

describe('listarNotificacoes', () => {
  test('sempre filtra destinatario_tipo = separador (nunca "operador")', async () => {
    const c = chain({ data: [], error: null })
    separadorSupabase.from.mockImplementation((tabela) => {
      if (tabela !== 'notificacoes_internas') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await separacaoSeparadorService.listarNotificacoes()

    expect(c.eq).toHaveBeenCalledWith('destinatario_tipo', 'separador')
  })

  test('apenasNaoLidas=true soma o filtro lida=false', async () => {
    const c = chain({ data: [], error: null })
    separadorSupabase.from.mockImplementation(() => c)

    await separacaoSeparadorService.listarNotificacoes({ apenasNaoLidas: true })

    expect(c.eq).toHaveBeenCalledWith('lida', false)
  })
})

describe('marcarNotificacaoLida', () => {
  test('chama marcar_notificacao_lida com o id', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: null, error: null })

    await separacaoSeparadorService.marcarNotificacaoLida('notif1')

    expect(separadorSupabase.rpc).toHaveBeenCalledWith('marcar_notificacao_lida', { p_id: 'notif1' })
  })
})
