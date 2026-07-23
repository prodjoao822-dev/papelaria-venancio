// Validadores reutilizáveis para respostas de menu. Centralizados aqui para
// não repetir a mesma lógica de parsing de "opção numérica dentro de uma
// lista" em cada estado que apresenta uma lista de opções ao cliente.

// Converte o texto recebido numa posição válida de `quantidadeOpcoes`
// (entrada "1" -> índice 0). Retorna null quando o texto não é um número
// inteiro ou está fora do intervalo de opções disponíveis.
function parseOpcaoNumerica(textoRecebido, quantidadeOpcoes) {
  const indice = Number((textoRecebido || '').trim()) - 1;
  const dentroDoIntervalo = Number.isInteger(indice) && indice >= 0 && indice < quantidadeOpcoes;
  return dentroDoIntervalo ? indice : null;
}

module.exports = { parseOpcaoNumerica };
