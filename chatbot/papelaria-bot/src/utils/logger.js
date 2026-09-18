// Utilitário de logging usado em toda a aplicação.
// Centralizado aqui para manter um formato único (timestamp + nível) e para que,
// se um dia trocarmos por uma lib de log estruturado, só este arquivo mude.

const fs = require('fs');
const path = require('path');

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

// Persistência em arquivo (01/09/2026): antes o bot só logava no console, e
// como ele roda direto no terminal (não sob PM2 — `pm2 list` só mostra o
// ngrok-tunnel), esse histórico se perdia assim que o terminal era fechado ou
// limpo. Isso impedia medir de verdade a correlação entre duração da chamada
// ao Agente de Vendas e a incidência do bug de payload vazio (infra Cloudfy,
// ver memória "bug-payload-vazio-cloudfy") — não tinha como reconstruir o que
// aconteceu depois do fato, só relato do usuário. Agora cada linha também vai
// pra um arquivo diário em `logs/`, além do console (console continua sendo a
// saída "ao vivo" de sempre, nada muda nela). Escrita em arquivo é
// best-effort: nunca lança, nunca atrasa quem chamou — se o disco falhar ou a
// pasta não puder ser criada, perde-se só o registro em arquivo, nunca a
// operação real.
const PASTA_LOGS = path.join(__dirname, '..', '..', 'logs');
let pastaLogsGarantida = false;

function garantirPastaLogs() {
  if (pastaLogsGarantida) return;
  try {
    fs.mkdirSync(PASTA_LOGS, { recursive: true });
    pastaLogsGarantida = true;
  } catch {
    // Sem permissão de escrita, disco cheio etc. — segue só com console.
  }
}

function arquivoDoDia() {
  const hoje = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(PASTA_LOGS, `bot-${hoje}.log`);
}

function serializarParaArquivo(dadosMascarados) {
  try {
    return JSON.stringify(dadosMascarados, (chave, valor) =>
      (valor instanceof Error ? { message: valor.message, stack: valor.stack } : valor)
    );
  } catch {
    return String(dadosMascarados);
  }
}

function persistirEmArquivo(nivel, mensagem, dadosMascarados) {
  garantirPastaLogs();
  if (!pastaLogsGarantida) return;
  const corpo = dadosMascarados !== undefined ? ` ${serializarParaArquivo(dadosMascarados)}` : '';
  const linha = `[${timestamp()}] [${nivel}] ${mensagem}${corpo}\n`;
  fs.appendFile(arquivoDoDia(), linha, () => {
    // Erro de escrita é ignorado de propósito — ver comentário acima.
  });
}

function info(mensagem, dados) {
  const dadosMascarados = dados !== undefined ? mascarar(dados) : undefined;
  console.log(`[${timestamp()}] [INFO] ${mensagem}`, dadosMascarados !== undefined ? dadosMascarados : '');
  persistirEmArquivo('INFO', mensagem, dadosMascarados);
}

function aviso(mensagem, dados) {
  const dadosMascarados = dados !== undefined ? mascarar(dados) : undefined;
  console.warn(`[${timestamp()}] [AVISO] ${mensagem}`, dadosMascarados !== undefined ? dadosMascarados : '');
  persistirEmArquivo('AVISO', mensagem, dadosMascarados);
}

function erro(mensagem, erroOriginal) {
  const dadosMascarados = erroOriginal !== undefined ? mascarar(erroOriginal) : undefined;
  console.error(`[${timestamp()}] [ERRO] ${mensagem}`, dadosMascarados !== undefined ? dadosMascarados : '');
  persistirEmArquivo('ERRO', mensagem, dadosMascarados);
}

module.exports = {
  info, aviso, erro,
  // Exportado pro painel admin (src/admin/adminLogsController.js,
  // logTailService.js) ler os mesmos arquivos que este módulo escreve, sem
  // duplicar o cálculo do caminho.
  PASTA_LOGS,
};
