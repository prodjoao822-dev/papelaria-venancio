// Mensagens de texto reutilizadas por mais de um estado do bot.
// Centralizado para evitar duplicar a mesma string em vários arquivos de estado.

// Primeiro nome de exibição do cliente (pushName do WhatsApp), usado para
// personalizar saudações. Retorna null quando não há nome confiável pra usar
// (contato sem pushName, nome vazio etc.) — quem chama cai de volta pra uma
// versão genérica da mensagem.
function primeiroNome(nomeCompleto) {
  if (!nomeCompleto || typeof nomeCompleto !== 'string') return null;
  const primeiro = nomeCompleto.trim().split(/\s+/)[0];
  return primeiro || null;
}

function mensagemAguardarAtendimento(nomeCliente) {
  const nome = primeiroNome(nomeCliente);
  return nome
    ? `Só um momento, ${nome}, já vamos te atender por aqui!`
    : 'Só um momento, por favor, já vamos te atender.';
}

module.exports = { primeiroNome, mensagemAguardarAtendimento };
