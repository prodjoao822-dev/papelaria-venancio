// Tail ao vivo do log do dia corrente (bot-YYYY-MM-DD.log), usado pelo
// endpoint SSE /admin/logs/stream (ver adminLogsController.js). Cobre só o
// dia de HOJE — dias anteriores são somente-leitura via
// adminLogsController.lerArquivo, que pagina por bytes sem tail ao vivo.
//
// Um único `fs.watch` por dia, compartilhado entre TODOS os clientes SSE
// conectados àquele dia — nunca um watcher por conexão. `fs.watch` é sabido
// disparar eventos espúrios (sem o arquivo ter de fato crescido), então o
// handler nunca confia no evento em si: sempre faz `fs.stat` pra saber o
// tamanho real antes de ler qualquer coisa.

const fs = require('fs');
const path = require('path');
const { PASTA_LOGS } = require('../utils/logger');
const logger = require('../utils/logger');

const INTERVALO_HEARTBEAT_MS = 25_000;

// dataStr (YYYY-MM-DD) -> { offset, watcher, clientes: Set<res>, bufferParcial, heartbeat }
const assinaturas = new Map();

function hojeStr() {
  return new Date().toISOString().slice(0, 10);
}

function caminhoDoDia(dataStr) {
  return path.join(PASTA_LOGS, `bot-${dataStr}.log`);
}

// Escreve um comentário SSE (usado tanto pro "conectado" inicial quanto pro
// heartbeat) — comentários não disparam `onmessage` no EventSource, só
// mantêm a conexão viva e servem de sinal pro `onopen`.
function escreverComentario(res, texto) {
  try {
    res.write(`: ${texto}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function escreverDado(res, linha) {
  try {
    res.write(`data: ${linha}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function escreverErro(res, mensagem) {
  try {
    res.write(`event: erro\ndata: ${mensagem}\n\n`);
  } catch {
    // Conexão já fechada — nada a fazer.
  }
}

async function tamanhoAtual(caminho) {
  try {
    const info = await fs.promises.stat(caminho);
    return info.size;
  } catch (erro) {
    if (erro.code === 'ENOENT') return 0;
    throw erro;
  }
}

// Lê [inicio, fim) do arquivo e entrega cada linha COMPLETA a todos os
// clientes da assinatura, mantendo o pedaço final incompleto (sem `\n` ainda)
// em `bufferParcial` pra ser completado na próxima leitura.
function emitirParaAssinatura(assinatura, caminho, inicio, fim) {
  return new Promise((resolve, reject) => {
    const leitura = fs.createReadStream(caminho, { start: inicio, end: fim - 1, encoding: 'utf8' });
    leitura.on('data', (pedaco) => {
      assinatura.bufferParcial += pedaco;
      const partes = assinatura.bufferParcial.split('\n');
      assinatura.bufferParcial = partes.pop();
      for (const linha of partes) {
        if (linha === '') continue;
        for (const cliente of [...assinatura.clientes]) {
          if (!escreverDado(cliente, linha)) assinatura.clientes.delete(cliente);
        }
      }
    });
    leitura.on('end', resolve);
    leitura.on('error', reject);
  });
}

// Igual à de cima, mas pra UM cliente específico (catch-up de quem se
// inscreve com um offset atrasado) — não mexe no `bufferParcial`
// compartilhado da assinatura, é uma leitura avulsa.
function emitirParaCliente(res, caminho, inicio, fim) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const leitura = fs.createReadStream(caminho, { start: inicio, end: fim - 1, encoding: 'utf8' });
    leitura.on('data', (pedaco) => {
      buffer += pedaco;
      const partes = buffer.split('\n');
      buffer = partes.pop();
      for (const linha of partes) {
        if (linha !== '') escreverDado(res, linha);
      }
    });
    leitura.on('end', resolve);
    leitura.on('error', reject);
  });
}

async function processarMudanca(dataStr) {
  const assinatura = assinaturas.get(dataStr);
  if (!assinatura) return;

  const caminho = caminhoDoDia(dataStr);
  let tamanhoReal;
  try {
    tamanhoReal = await tamanhoAtual(caminho);
  } catch (erro) {
    logger.erro(`Falha ao checar o log de hoje (${dataStr}) pro tail ao vivo`, erro);
    return;
  }

  // fs.watch pode disparar sem o arquivo ter crescido de verdade (evento
  // espúrio) — nunca confiar nele sozinho, só no tamanho real via stat.
  if (tamanhoReal <= assinatura.offset) return;

  try {
    await emitirParaAssinatura(assinatura, caminho, assinatura.offset, tamanhoReal);
    assinatura.offset = tamanhoReal;
  } catch (erro) {
    logger.erro(`Falha ao ler o trecho novo do log de hoje (${dataStr})`, erro);
  }
}

function criarAssinatura(dataStr, offsetInicial) {
  const assinatura = {
    offset: offsetInicial,
    watcher: null,
    clientes: new Set(),
    bufferParcial: '',
    heartbeat: null,
  };

  try {
    assinatura.watcher = fs.watch(caminhoDoDia(dataStr), { persistent: false }, () => {
      processarMudanca(dataStr).catch((erro) => {
        logger.erro(`Falha ao processar mudança do log de hoje (${dataStr})`, erro);
      });
    });
  } catch (erro) {
    logger.erro(`Falha ao observar o log de hoje (${dataStr}) pro tail ao vivo`, erro);
  }

  assinatura.heartbeat = setInterval(() => {
    for (const cliente of [...assinatura.clientes]) {
      if (!escreverComentario(cliente, 'keepalive')) assinatura.clientes.delete(cliente);
    }
  }, INTERVALO_HEARTBEAT_MS);
  assinatura.heartbeat.unref?.();

  assinaturas.set(dataStr, assinatura);
  return assinatura;
}

// Inscreve `res` (resposta SSE já com os headers escritos por
// adminLogsController.streamLogs) no tail ao vivo do dia `dataStr`.
// `offsetInicial` (opcional): de onde o cliente já leu — usado tanto pra
// abrir a assinatura pela primeira vez (default: tamanho atual do arquivo,
// ou seja, "começa a tailar a partir de agora") quanto pra fazer catch-up de
// um cliente que já tinha lido até um ponto anterior ao offset corrente da
// assinatura (ex.: reconectou depois de cair).
async function inscrever(dataStr, offsetInicial, res) {
  if (dataStr !== hojeStr()) {
    escreverErro(res, 'Tail ao vivo só cobre o log do dia atual; use GET /admin/logs/:data pra dias anteriores.');
    res.end();
    return;
  }

  const caminho = caminhoDoDia(dataStr);
  let assinatura = assinaturas.get(dataStr);
  if (!assinatura) {
    const tamanhoInicial = offsetInicial !== undefined ? offsetInicial : await tamanhoAtual(caminho);
    assinatura = criarAssinatura(dataStr, tamanhoInicial);
  }

  // Sinaliza a conexão viva imediatamente — sem isso o `onopen` do
  // EventSource do cliente só dispararia no primeiro dado real, que pode
  // demorar (log parado).
  escreverComentario(res, 'conectado');

  const offsetPedido = offsetInicial !== undefined ? offsetInicial : assinatura.offset;
  if (offsetPedido < assinatura.offset) {
    try {
      await emitirParaCliente(res, caminho, offsetPedido, assinatura.offset);
    } catch (erro) {
      logger.erro(`Falha no catch-up do tail de log (${dataStr})`, erro);
    }
  }

  assinatura.clientes.add(res);
}

function desinscrever(dataStr, res) {
  const assinatura = assinaturas.get(dataStr);
  if (!assinatura) return;

  assinatura.clientes.delete(res);

  if (assinatura.clientes.size === 0) {
    if (assinatura.watcher) assinatura.watcher.close();
    clearInterval(assinatura.heartbeat);
    assinaturas.delete(dataStr);
  }
}

module.exports = { inscrever, desinscrever };
