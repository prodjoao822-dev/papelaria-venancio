// Testes de atendimento.service.js — assumir/liberar conversa mexe em
// concorrência entre operadores (RPC resolve o ator via auth.uid(), nunca
// confia em id vindo do client — B1 do plano mestre). Foco também nos dois
// normalizadores (normalizarConversa/normalizarMensagem), que traduzem o
// vocabulário novo do banco pro vocabulário antigo que a UI espera.
//
// enviarMensagem() chama fetch de verdade contra BOT_API_URL — mesmo motivo
// de orcamentos.service.test.js: o .env real tem VITE_BOT_API_URL apontando
// pra infra real, então fetch é sempre mockado.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/supabase/client', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getSession: vi.fn() } },
}))

import { supabase } from '@/supabase/client'
import { atendimentoService } from './atendimento.service'

const METODOS_CHAIN = ['select', 'order', 'limit', 'eq', 'not', 'is', 'update']

function chain(result) {
  const c = {}
  METODOS_CHAIN.forEach((metodo) => { c[metodo] = vi.fn(() => c) })
  c.single = vi.fn(() => Promise.resolve(result))
  c.then = (resolve) => resolve(result)
  return c
}

function conversaRow(overrides = {}) {
  return {
    id: 'conv1',
    bot_ativo: true,
    operador_id: null,
    ultima_mensagem_preview: 'Oi, tudo bem?',
    ultima_interacao_em: '2026-09-01T10:00:00Z',
    clientes: { id: 'cli1', nome: 'Fulano', telefone: '2799999999' },
    operadores: null,
    ...overrides,
  }
}

beforeEach(() => {
  supabase.from.mockReset()
  supabase.rpc.mockReset()
  supabase.auth.getSession.mockReset()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('listar', () => {
  test('normaliza cada conversa pro vocabulário antigo da UI', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'conversas') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({ data: [conversaRow()], error: null })
    })

    const [conversa] = await atendimentoService.listar()

    expect(conversa).toMatchObject({
      nome_cliente: 'Fulano',
      telefone: '2799999999',
      ia_ativa: true,
      operador_nome: null,
      ultima_mensagem: 'Oi, tudo bem?',
      ultima_msg_at: '2026-09-01T10:00:00Z',
    })
  })

  test('ordena por prioridade_score desc e depois ultima_interacao_em desc (nulls por último)', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await atendimentoService.listar()

    expect(c.order).toHaveBeenCalledWith('prioridade_score', { ascending: false })
    expect(c.order).toHaveBeenCalledWith('ultima_interacao_em', { ascending: false, nullsFirst: false })
  })

  test('data null não quebra — devolve lista vazia', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: null }))

    expect(await atendimentoService.listar()).toEqual([])
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('timeout') }))

    await expect(atendimentoService.listar()).rejects.toThrow('timeout')
  })
})

describe('buscarPorId / buscarMensagemPorId', () => {
  test('buscarPorId normaliza a conversa completa', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'conversas') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({ data: conversaRow({ operadores: { id: 'op1', nome: 'Ana' }, operador_id: 'op1' }), error: null })
    })

    const conversa = await atendimentoService.buscarPorId('conv1')

    expect(conversa.operador_nome).toBe('Ana')
  })

  test('buscarMensagemPorId traduz remetente bot/humano pra ia/operador', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'mensagens') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({ data: { id: 'm1', remetente: 'humano', operadores: { nome: 'Ana' }, enviado_em: '2026-09-01T10:05:00Z' }, error: null })
    })

    const mensagem = await atendimentoService.buscarMensagemPorId('m1')

    expect(mensagem.remetente).toBe('operador')
    expect(mensagem.operador_nome).toBe('Ana')
    expect(mensagem.created_at).toBe('2026-09-01T10:05:00Z')
  })

  test('remetente "bot" vira "ia"', async () => {
    supabase.from.mockImplementation(() => chain({ data: { id: 'm2', remetente: 'bot', operadores: null }, error: null }))

    const mensagem = await atendimentoService.buscarMensagemPorId('m2')

    expect(mensagem.remetente).toBe('ia')
    expect(mensagem.operador_nome).toBeNull()
  })
})

describe('buscarMensagens', () => {
  test('filtra pela conversa, ordena por enviado_em asc e normaliza cada mensagem', async () => {
    const c = chain({ data: [{ id: 'm1', remetente: 'bot', operadores: null, enviado_em: '2026-09-01T10:00:00Z' }], error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'mensagens') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const [mensagem] = await atendimentoService.buscarMensagens('conv1')

    expect(c.eq).toHaveBeenCalledWith('conversa_id', 'conv1')
    expect(c.order).toHaveBeenCalledWith('enviado_em', { ascending: true })
    expect(mensagem.remetente).toBe('ia')
  })

  test('data null vira lista vazia', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: null }))

    expect(await atendimentoService.buscarMensagens('conv1')).toEqual([])
  })
})

describe('assumirConversa', () => {
  test('chama a RPC só com o id da conversa (ator resolvido via auth.uid(), nunca client-supplied) e rebusca a linha completa', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'conv1' }, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'conversas') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({ data: conversaRow({ operador_id: 'op1', operadores: { id: 'op1', nome: 'Ana' } }), error: null })
    })

    const conversa = await atendimentoService.assumirConversa('conv1')

    expect(supabase.rpc).toHaveBeenCalledWith('assumir_conversa_dashboard', { p_conversa_id: 'conv1' })
    expect(conversa.operador_nome).toBe('Ana')
  })

  test('RPC devolvendo array (não objeto) também funciona — usa o primeiro elemento', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ id: 'conv1' }], error: null })
    supabase.from.mockImplementation(() => chain({ data: conversaRow(), error: null }))

    await expect(atendimentoService.assumirConversa('conv1')).resolves.toBeTruthy()
  })

  test('erro da RPC (conversa já assumida por outro operador) vira Error com a mensagem exata', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'Conversa já foi assumida por outro operador.' } })

    await expect(atendimentoService.assumirConversa('conv1')).rejects.toThrow(
      'Conversa já foi assumida por outro operador.'
    )
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

describe('liberarConversa', () => {
  test('chama a RPC só com o id da conversa e rebusca a linha completa', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'conv1' }, error: null })
    supabase.from.mockImplementation(() => chain({ data: conversaRow(), error: null }))

    const conversa = await atendimentoService.liberarConversa('conv1')

    expect(supabase.rpc).toHaveBeenCalledWith('liberar_conversa_dashboard', { p_conversa_id: 'conv1' })
    expect(conversa.ia_ativa).toBe(true)
  })

  test('erro da RPC (conversa não pertence a quem chamou) vira Error com a mensagem', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'Você não pode liberar uma conversa de outro operador.' } })

    await expect(atendimentoService.liberarConversa('conv1')).rejects.toThrow(
      'Você não pode liberar uma conversa de outro operador.'
    )
  })
})

describe('registrarHeartbeat', () => {
  test('sucesso: chama a RPC sem parâmetros', async () => {
    supabase.rpc.mockResolvedValue({ error: null })

    await atendimentoService.registrarHeartbeat()

    expect(supabase.rpc).toHaveBeenCalledWith('registrar_heartbeat_operador')
  })

  test('erro da RPC é engolido silenciosamente — nunca deve travar a UI', async () => {
    supabase.rpc.mockResolvedValue({ error: new Error('sessão expirada') })

    await expect(atendimentoService.registrarHeartbeat()).resolves.toBeUndefined()
  })

  test('supabase.rpc rejeitando (erro de rede) também é engolido', async () => {
    supabase.rpc.mockRejectedValue(new Error('rede caiu'))

    await expect(atendimentoService.registrarHeartbeat()).resolves.toBeUndefined()
  })
})

describe('atualizarStatus', () => {
  test('grava o status exato na conversa', async () => {
    const c = chain({ data: conversaRow(), error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'conversas') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await atendimentoService.atualizarStatus('conv1', 'em_atendimento')

    expect(c.update).toHaveBeenCalledWith({ status: 'em_atendimento' })
    expect(c.eq).toHaveBeenCalledWith('id', 'conv1')
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('status inválido') }))

    await expect(atendimentoService.atualizarStatus('conv1', 'status_invalido')).rejects.toThrow('status inválido')
  })
})

describe('toggleIA', () => {
  test('ligar a IA (iaAtiva=true) também zera operador_id — nunca deveriam coexistir', async () => {
    const c = chain({ data: conversaRow(), error: null })
    supabase.from.mockImplementation(() => c)

    await atendimentoService.toggleIA('conv1', true)

    expect(c.update).toHaveBeenCalledWith(
      expect.objectContaining({ bot_ativo: true, operador_id: null, ultima_interacao_em: expect.any(String) })
    )
  })

  test('desligar a IA (iaAtiva=false) não mexe em operador_id', async () => {
    const c = chain({ data: conversaRow(), error: null })
    supabase.from.mockImplementation(() => c)

    await atendimentoService.toggleIA('conv1', false)

    const payload = c.update.mock.calls[0][0]
    expect(payload.bot_ativo).toBe(false)
    expect(payload).not.toHaveProperty('operador_id')
  })
})

describe('atualizarPrioridade', () => {
  test('grava prioridade e o score correspondente do PRIORIDADE_CONFIG', async () => {
    const c = chain({ data: conversaRow(), error: null })
    supabase.from.mockImplementation(() => c)

    await atendimentoService.atualizarPrioridade('conv1', 'critica')

    expect(c.update).toHaveBeenCalledWith({ prioridade: 'critica', prioridade_score: 100 })
  })

  test('prioridade desconhecida usa score fallback 50', async () => {
    const c = chain({ data: conversaRow(), error: null })
    supabase.from.mockImplementation(() => c)

    await atendimentoService.atualizarPrioridade('conv1', 'prioridade_inventada')

    expect(c.update).toHaveBeenCalledWith({ prioridade: 'prioridade_inventada', prioridade_score: 50 })
  })
})

describe('enviarMensagem', () => {
  test('sem sessão ativa, não chega a chamar fetch', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })

    await expect(atendimentoService.enviarMensagem('conv1', 'Oi')).rejects.toThrow(
      'Sessão expirada. Faça login novamente.'
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  test('resposta de erro do bot vira exceção com a mensagem do corpo', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok123' } } })
    fetch.mockResolvedValue({ ok: false, json: async () => ({ ok: false, erro: 'conversa com IA ativa' }) })

    await expect(atendimentoService.enviarMensagem('conv1', 'Oi')).rejects.toThrow('conversa com IA ativa')
  })

  test('sucesso: manda Authorization Bearer e o corpo com conversaId/conteudo, ignora o operadorId legado', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok123' } } })
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, mensagem: { id: 'm1', remetente: 'humano', operadores: { nome: 'Ana' } } }),
    })

    const mensagem = await atendimentoService.enviarMensagem('conv1', 'Oi, tudo bem?', 'operador-legado-ignorado')

    const [url, opcoes] = fetch.mock.calls[0]
    expect(url).toMatch(/\/operador\/mensagens\/enviar$/)
    expect(opcoes.headers.Authorization).toBe('Bearer tok123')
    expect(JSON.parse(opcoes.body)).toEqual({ conversaId: 'conv1', conteudo: 'Oi, tudo bem?' })
    expect(mensagem.remetente).toBe('operador')
  })

  test('sucesso sem "mensagem" no corpo devolve null (não quebra)', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok123' } } })
    fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })

    expect(await atendimentoService.enviarMensagem('conv1', 'Oi')).toBeNull()
  })
})

describe('adicionarTag / removerTag', () => {
  test('adicionarTag deduplica (Set) e mantém as tags existentes', async () => {
    const c = chain({ data: conversaRow(), error: null })
    supabase.from.mockImplementation(() => c)

    await atendimentoService.adicionarTag('conv1', 'urgente', ['vip', 'urgente'])

    expect(c.update).toHaveBeenCalledWith({ tags: ['vip', 'urgente'] })
  })

  test('adicionarTag numa conversa sem tags anteriores', async () => {
    const c = chain({ data: conversaRow(), error: null })
    supabase.from.mockImplementation(() => c)

    await atendimentoService.adicionarTag('conv1', 'vip', null)

    expect(c.update).toHaveBeenCalledWith({ tags: ['vip'] })
  })

  test('removerTag tira só a tag pedida, preservando as outras', async () => {
    const c = chain({ data: conversaRow(), error: null })
    supabase.from.mockImplementation(() => c)

    await atendimentoService.removerTag('conv1', 'urgente', ['vip', 'urgente'])

    expect(c.update).toHaveBeenCalledWith({ tags: ['vip'] })
  })
})

describe('listarAtendimentosAtivos', () => {
  test('filtra operador_id não nulo', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'conversas') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await atendimentoService.listarAtendimentosAtivos()

    expect(c.not).toHaveBeenCalledWith('operador_id', 'is', null)
  })

  test('data null vira lista vazia', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: null }))

    expect(await atendimentoService.listarAtendimentosAtivos()).toEqual([])
  })
})

describe('contarAguardandoOperador', () => {
  test('conta bot_ativo=false + operador_id nulo (não usa conversas.status)', async () => {
    const c = chain({ count: 4, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'conversas') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await atendimentoService.contarAguardandoOperador()

    expect(c.eq).toHaveBeenCalledWith('bot_ativo', false)
    expect(c.is).toHaveBeenCalledWith('operador_id', null)
    expect(resultado).toBe(4)
  })

  test('count null vira 0', async () => {
    supabase.from.mockImplementation(() => chain({ count: null, error: null }))

    expect(await atendimentoService.contarAguardandoOperador()).toBe(0)
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ count: null, error: new Error('timeout') }))

    await expect(atendimentoService.contarAguardandoOperador()).rejects.toThrow('timeout')
  })
})
