// Utilitário de logging usado em toda a aplicação.
// Centralizado aqui para manter um formato único (timestamp + nível) e para que,
// se um dia trocarmos por uma lib de log estruturado, só este arquivo mude.

function timestamp() {
  return new Date().toISOString();
}

// Payloads de webhook (Evolution API, n8n) e headers às vezes carregam a
// própria credencial dentro do corpo (não só no header), então mascaramos
// por nome de campo em qualquer nível do objeto antes de logar — ver
// Vistoria Técnica 13/08/2026, Problema 9: chave real vazada em log de payload.
const CAMPOS_SENSIVEIS = /^(apikey|api_key|authorization|senha|password|token|secret|chave)$/i;

function mascarar(dados, vistos = new WeakSet()) {
  if (dados === null || typeof dados !== 'object') return dados;
  // Error tem message/stack não-enumeráveis — mascarar via Object.entries
  // devolveria "{}" e perderíamos o stack trace no log. Erro não é o vetor
  // do vazamento (payload de webhook é), então repassa intacto.
  if (dados instanceof Error) return dados;
  if (vistos.has(dados)) return '[circular]';
  vistos.add(dados);

  if (Array.isArray(dados)) return dados.map((item) => mascarar(item, vistos));

  const resultado = {};
  for (const [chave, valor] of Object.entries(dados)) {
    if (CAMPOS_SENSIVEIS.test(chave) && typeof valor === 'string') {
      resultado[chave] = valor.length > 4 ? `***${valor.slice(-4)}` : '***';
    } else {
      resultado[chave] = mascarar(valor, vistos);
    }
  }
  return resultado;
}

function info(mensagem, dados) {
  console.log(`[${timestamp()}] [INFO] ${mensagem}`, dados !== undefined ? mascarar(dados) : '');
}

function aviso(mensagem, dados) {
  console.warn(`[${timestamp()}] [AVISO] ${mensagem}`, dados !== undefined ? mascarar(dados) : '');
}

function erro(mensagem, erroOriginal) {
  console.error(`[${timestamp()}] [ERRO] ${mensagem}`, erroOriginal !== undefined ? mascarar(erroOriginal) : '');
}

module.exports = { info, aviso, erro };
