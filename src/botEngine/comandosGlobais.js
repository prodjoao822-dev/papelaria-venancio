// Comandos que funcionam independentemente do estado atual da conversa
// (ex.: cliente digita "0" no meio de qualquer fluxo para voltar ao menu
// principal). A stateMachine intercepta esses comandos antes de delegar ao
// processar() do estado atual.
//
// Estados que capturam texto livre de verdade (hoje, a pergunta de observação
// da lista escolar/cotação empresa e os passos de texto livre do cadastro
// fiscal) marcam `aceitaTextoLivre: true` na própria definição do estado para
// ficar de fora dessa interceptação — senão um cliente que digitasse
// literalmente "menu" como observação teria o texto interpretado como comando
// em vez de conteúdo. `ESCALACAO` ("atendente"/"reclamação") é a exceção: ela
// precisa funcionar mesmo dentro desses estados (ver stateMachine.js), porque
// é uma válvula de escape que deve interromper qualquer fluxo. Como a
// comparação abaixo exige a mensagem inteira ser exatamente uma dessas
// palavras (não uma substring), não há risco de disparar por acidente dentro
// de uma observação mais longa.

const ESTADO_MENU_PRINCIPAL = 'MENU_PRINCIPAL';

const PALAVRAS_MENU = ['0', 'menu'];
const PALAVRAS_VOLTAR = ['#'];
const PALAVRAS_REINICIAR = ['*'];
const PALAVRAS_AJUDA = ['ajuda', 'help'];
const PALAVRAS_ESCALACAO = ['atendente', 'reclamação', 'reclamacao'];

const MENSAGEM_AJUDA = `
Comandos disponíveis a qualquer momento:

0 ou "menu" - voltar ao menu principal
# - voltar para a etapa anterior
* - reiniciar o atendimento
ajuda - ver esta mensagem novamente
atendente ou reclamação - chamar um atendente humano imediatamente
`.trim();

function normalizar(textoRecebido) {
  return (textoRecebido || '').trim().toLowerCase();
}

// Retorna 'MENU' | 'VOLTAR' | 'REINICIAR' | 'AJUDA' | 'ESCALACAO' | null (não é comando global).
function identificarComando(textoRecebido) {
  const texto = normalizar(textoRecebido);

  if (PALAVRAS_MENU.includes(texto)) return 'MENU';
  if (PALAVRAS_VOLTAR.includes(texto)) return 'VOLTAR';
  if (PALAVRAS_REINICIAR.includes(texto)) return 'REINICIAR';
  if (PALAVRAS_AJUDA.includes(texto)) return 'AJUDA';
  if (PALAVRAS_ESCALACAO.includes(texto)) return 'ESCALACAO';
  return null;
}

module.exports = { identificarComando, MENSAGEM_AJUDA, ESTADO_MENU_PRINCIPAL };
