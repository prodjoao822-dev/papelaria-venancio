// Detector de intenção de "quero fechar/pagar" um pedido/orçamento já existente.
// Função pura, sem I/O — quem decide o que fazer com essa intenção (buscar o
// pedido ativo do cliente, notificar Vendas etc.) é o webhookController.js.

// Frases naturais como "vou querer fechar, posso pagar por aqui" não batem com
// nenhuma palavra exata de comandosGlobais.js — aqui o critério é "contém uma das
// palavras-gatilho", com \b (borda de palavra) pra não confundir "pagar" dentro de
// outra palavra nem "fechar" com "fecharam"/"fechado".
const PALAVRAS_GATILHO = ['fechar', 'pagar', 'pagamento', 'finalizar'];

function mencionaFecharOuPagar(textoRecebido) {
  const texto = (textoRecebido || '').toLowerCase();
  return PALAVRAS_GATILHO.some((palavra) => new RegExp(`\\b${palavra}\\b`, 'i').test(texto));
}

module.exports = { mencionaFecharOuPagar };
