// Registro simples de eventos de uso do bot (estados acessados, comandos
// globais usados, erros, etc.). Nesta fase os contadores ficam só em memória
// e cada evento também é espelhado no logger — o suficiente para acompanhar
// uso pelo log do processo sem precisar de infraestrutura nova.
//
// Fica pronto para, no futuro, persistir esses mesmos eventos numa tabela do
// Supabase: quem chama `registrarEvento` não precisa mudar, só a implementação
// interna deste arquivo.

const logger = require('../utils/logger');

const contadores = new Map();

function registrarEvento(tipo, detalhes) {
  contadores.set(tipo, (contadores.get(tipo) || 0) + 1);
  logger.info(`[analytics] ${tipo}`, detalhes);
}

// Usado por testes/depuração local; não há endpoint HTTP exposto para isso ainda.
function obterContadores() {
  return Object.fromEntries(contadores);
}

module.exports = { registrarEvento, obterContadores };
