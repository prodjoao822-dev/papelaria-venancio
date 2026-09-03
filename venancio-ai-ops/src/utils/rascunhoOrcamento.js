// Persistência local (localStorage) de rascunho do formulário de orçamento
// (criar e editar) — o formulário guardava tudo só em state do React, então
// fechar o modal sem querer (clicar fora — comportamento normal do modal,
// não é bug) ou dar F5 perdia todo o progresso digitado, já que nada tinha
// sido gravado no banco ainda.
//
// É puramente uma conveniência de UX: qualquer falha de localStorage (modo
// anônimo do navegador, quota cheia, indisponível em algum ambiente) é
// engolida silenciosamente — nunca deve impedir o formulário de funcionar.
//
// Funções puras e sem JSX de propósito — mesmo padrão dos outros arquivos em
// src/utils, pensando em reaproveitamento futuro (ver nota do app mobile).

export const CHAVE_RASCUNHO_NOVO_ORCAMENTO = 'venancio:rascunho-novo-orcamento'

export function chaveRascunhoEdicaoOrcamento(orcamentoId) {
  return `venancio:rascunho-edicao-orcamento:${orcamentoId}`
}

export function salvarRascunho(chave, dados) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(chave, JSON.stringify(dados))
  } catch {
    // localStorage indisponível/cheio — apenas ignora, não é crítico.
  }
}

export function carregarRascunho(chave) {
  try {
    if (typeof localStorage === 'undefined') return null
    const bruto = localStorage.getItem(chave)
    if (!bruto) return null
    return JSON.parse(bruto)
  } catch {
    return null
  }
}

export function limparRascunho(chave) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(chave)
  } catch {
    // ignora
  }
}

/**
 * Um rascunho de orçamento NOVO só vale a pena recuperar (e avisar o
 * operador) se tiver algo além do estado inicial vazio do formulário —
 * senão o aviso seria puro ruído toda vez que o modal abrisse.
 */
export function rascunhoNovoTemConteudo(dados) {
  if (!dados) return false
  const cliente = dados.cliente ?? {}
  if ((cliente.nome ?? '').trim()) return true
  if ((cliente.telefone ?? '').trim()) return true
  if ((dados.observacoes ?? '').trim()) return true
  return (dados.itens ?? []).some((i) => (i?.descricao_livre ?? '').trim())
}

/**
 * Na EDIÇÃO, o estado inicial do formulário já vem preenchido com os dados
 * reais do orçamento (vindos do banco) — "ter conteúdo" não é suficiente
 * pra decidir se vale recuperar. Só vale a pena (e avisar o operador) se o
 * rascunho salvo for diferente do que já seria carregado normalmente.
 */
export function rascunhoEdicaoDifereDoOriginal(dadosSalvos, dadosOriginais) {
  if (!dadosSalvos) return false
  try {
    return JSON.stringify(dadosSalvos) !== JSON.stringify(dadosOriginais)
  } catch {
    return false
  }
}
