// Testes de requestSequencer.js — cobre o bug real encontrado em
// PedidoModal.jsx: várias seções do modal disparam buscarPorId() em
// paralelo depois de salvar, e uma resposta atrasada de uma chamada antiga
// podia sobrescrever o resultado de uma chamada mais recente já concluída
// (a UI "esquecia" um salvamento que na verdade tinha ido pro banco).
import { describe, test, expect } from 'vitest'
import { criarSequenciadorDeRequisicoes } from './requestSequencer'

describe('criarSequenciadorDeRequisicoes', () => {
  test('primeira chamada a proxima() começa em 1 e é a atual', () => {
    const seq = criarSequenciadorDeRequisicoes()
    const id = seq.proxima()
    expect(id).toBe(1)
    expect(seq.ehAtual(id)).toBe(true)
  })

  test('cada chamada a proxima() incrementa e só a mais recente é "atual"', () => {
    const seq = criarSequenciadorDeRequisicoes()
    const id1 = seq.proxima()
    const id2 = seq.proxima()
    const id3 = seq.proxima()

    expect([id1, id2, id3]).toEqual([1, 2, 3])
    expect(seq.ehAtual(id1)).toBe(false)
    expect(seq.ehAtual(id2)).toBe(false)
    expect(seq.ehAtual(id3)).toBe(true)
  })

  test('cenário real: resposta atrasada de requisição antiga é descartável mesmo chegando por último', () => {
    const seq = criarSequenciadorDeRequisicoes()

    // Requisição A dispara primeiro (ex.: salvar Sequência)...
    const idA = seq.proxima()
    // ...mas antes de A responder, o usuário salva outro campo — requisição B dispara.
    const idB = seq.proxima()

    // B responde primeiro (rede não garante ordem de chegada).
    expect(seq.ehAtual(idB)).toBe(true)

    // A responde depois, atrasada — não deve mais valer, senão sobrescreveria
    // o resultado de B (mais recente) com um snapshot desatualizado.
    expect(seq.ehAtual(idA)).toBe(false)
  })

  test('duas instâncias independentes não interferem uma na outra', () => {
    const seq1 = criarSequenciadorDeRequisicoes()
    const seq2 = criarSequenciadorDeRequisicoes()

    const id1 = seq1.proxima()
    seq2.proxima()
    seq2.proxima()

    expect(seq1.ehAtual(id1)).toBe(true)
  })
})
