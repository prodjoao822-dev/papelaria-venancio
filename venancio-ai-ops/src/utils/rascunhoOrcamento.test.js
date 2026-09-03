// Testes de rascunhoOrcamento.js — o formulário de orçamento (criar e
// editar) guardava tudo só em state do React, então fechar o modal sem
// querer (clicar fora — comportamento normal do modal) ou dar F5 perdia
// todo o progresso digitado. Este módulo é a persistência local que
// resolve isso; cobre também os casos de localStorage indisponível/quebrado,
// já que é só uma conveniência e não pode nunca travar o formulário.
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  CHAVE_RASCUNHO_NOVO_ORCAMENTO,
  chaveRascunhoEdicaoOrcamento,
  salvarRascunho,
  carregarRascunho,
  limparRascunho,
  rascunhoNovoTemConteudo,
  rascunhoEdicaoDifereDoOriginal,
} from './rascunhoOrcamento'

function criarLocalStorageFake() {
  const dados = new Map()
  return {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => dados.set(k, String(v)),
    removeItem: (k) => dados.delete(k),
  }
}

describe('salvarRascunho / carregarRascunho / limparRascunho', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', criarLocalStorageFake())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('grava e recupera exatamente o mesmo objeto', () => {
    const dados = {
      cliente: { nome: 'Ana Souza', telefone: '11999990000' },
      observacoes: 'entregar até sexta',
      status: 'rascunho',
      itens: [{ descricao_livre: 'Caderno 10 matérias', quantidade: 2, valor_unitario: '25,90', produto_id: null }],
    }
    salvarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO, dados)
    expect(carregarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)).toEqual(dados)
  })

  test('carregar sem nada salvo ainda devolve null — abrir o modal pela primeira vez não quebra', () => {
    expect(carregarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)).toBeNull()
  })

  test('limpar remove o rascunho salvo (caso: orçamento criado com sucesso)', () => {
    salvarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO, { observacoes: 'x' })
    limparRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)
    expect(carregarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)).toBeNull()
  })

  test('rascunhos de edição de orçamentos diferentes não se misturam (chave inclui o id)', () => {
    salvarRascunho(chaveRascunhoEdicaoOrcamento('orc-1'), { observacoes: 'do orçamento 1' })
    salvarRascunho(chaveRascunhoEdicaoOrcamento('orc-2'), { observacoes: 'do orçamento 2' })

    expect(carregarRascunho(chaveRascunhoEdicaoOrcamento('orc-1'))).toEqual({ observacoes: 'do orçamento 1' })
    expect(carregarRascunho(chaveRascunhoEdicaoOrcamento('orc-2'))).toEqual({ observacoes: 'do orçamento 2' })
  })

  test('JSON corrompido no localStorage não quebra — carregarRascunho devolve null', () => {
    localStorage.setItem(CHAVE_RASCUNHO_NOVO_ORCAMENTO, '{ isso não é json válido')
    expect(carregarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)).toBeNull()
  })
})

describe('localStorage indisponível (ex.: modo anônimo restrito)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', undefined)
  })
  afterEach(() => vi.unstubAllGlobals())

  test('carregarRascunho não lança e devolve null', () => {
    expect(() => carregarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)).not.toThrow()
    expect(carregarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)).toBeNull()
  })

  test('salvarRascunho não lança — formulário continua funcionando sem persistência', () => {
    expect(() => salvarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO, { a: 1 })).not.toThrow()
  })

  test('limparRascunho não lança', () => {
    expect(() => limparRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)).not.toThrow()
  })
})

describe('localStorage presente mas lançando (ex.: quota cheia)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError') },
      setItem: () => { throw new Error('QuotaExceededError') },
      removeItem: () => { throw new Error('SecurityError') },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  test('salvarRascunho engole o erro silenciosamente', () => {
    expect(() => salvarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO, { a: 1 })).not.toThrow()
  })

  test('carregarRascunho engole o erro e devolve null', () => {
    expect(carregarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)).toBeNull()
  })

  test('limparRascunho engole o erro silenciosamente', () => {
    expect(() => limparRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)).not.toThrow()
  })
})

describe('rascunhoNovoTemConteudo', () => {
  test('null/undefined não tem conteúdo', () => {
    expect(rascunhoNovoTemConteudo(null)).toBe(false)
    expect(rascunhoNovoTemConteudo(undefined)).toBe(false)
  })

  test('estado inicial vazio do formulário não conta como conteúdo (evita aviso de recuperação sem motivo)', () => {
    const vazio = {
      cliente: { nome: '', telefone: '' },
      observacoes: '',
      status: 'rascunho',
      itens: [{ descricao_livre: '', quantidade: 1, valor_unitario: '', produto_id: null }],
    }
    expect(rascunhoNovoTemConteudo(vazio)).toBe(false)
  })

  test('nome do cliente preenchido já conta como conteúdo', () => {
    expect(rascunhoNovoTemConteudo({ cliente: { nome: 'Ana', telefone: '' }, itens: [] })).toBe(true)
  })

  test('telefone preenchido já conta como conteúdo', () => {
    expect(rascunhoNovoTemConteudo({ cliente: { nome: '', telefone: '11999990000' }, itens: [] })).toBe(true)
  })

  test('item com descrição preenchida conta como conteúdo', () => {
    expect(rascunhoNovoTemConteudo({
      cliente: { nome: '', telefone: '' },
      itens: [{ descricao_livre: 'Caneta azul' }],
    })).toBe(true)
  })

  test('observações preenchidas contam como conteúdo', () => {
    expect(rascunhoNovoTemConteudo({ cliente: {}, observacoes: 'desconto combinado', itens: [] })).toBe(true)
  })
})

describe('rascunhoEdicaoDifereDoOriginal', () => {
  const original = {
    itens: [{ descricao_livre: 'Caneta', quantidade: 1, valor_unitario: '2,50', produto_id: null }],
    observacoes: '',
  }

  test('sem rascunho salvo não é considerado diferente (nada a recuperar)', () => {
    expect(rascunhoEdicaoDifereDoOriginal(null, original)).toBe(false)
  })

  test('rascunho idêntico ao original não conta como diferente — não gera aviso à toa', () => {
    const identico = JSON.parse(JSON.stringify(original))
    expect(rascunhoEdicaoDifereDoOriginal(identico, original)).toBe(false)
  })

  test('rascunho com item alterado é considerado diferente e deve ser recuperado', () => {
    const alterado = { ...original, itens: [{ ...original.itens[0], quantidade: 5 }] }
    expect(rascunhoEdicaoDifereDoOriginal(alterado, original)).toBe(true)
  })

  test('rascunho com observações alteradas é considerado diferente', () => {
    const alterado = { ...original, observacoes: 'cliente pediu desconto' }
    expect(rascunhoEdicaoDifereDoOriginal(alterado, original)).toBe(true)
  })
})
