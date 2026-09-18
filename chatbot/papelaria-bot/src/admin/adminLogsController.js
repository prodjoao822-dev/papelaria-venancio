// Leitura dos logs do bot pro painel admin (dono-only, ver verifyAdmin.js).
// Só lê os arquivos que src/utils/logger.js já escreve (PASTA_LOGS) — nunca
// escreve, nunca apaga.
//
// Contrato de resposta de `lerArquivo` (documentado aqui pro frontend seguir
// à risca):
//   { ok: true, linhas: string[], offsetInicio: number, offsetFim: number }
// `linhas` são linhas completas (sem "\n") do trecho lido, na ordem em que
// aparecem no arquivo. `offsetInicio`/`offsetFim` são posições em BYTES
// absolutas no arquivo — pra pedir o trecho anterior, o frontend chama de
// novo com `?ate=<offsetInicio recebido>`.

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const logTailService = require('./logTailService');

const { PASTA_LOGS } = logger;

const REGEX_ARQUIVO_LOG = /^bot-(\d{4}-\d{2}-\d{2})\.log$/;
const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;
const TAMANHO_TAIL_PADRAO = 256 * 1024; // 256KB
const TAMANHO_MAX_RESPOSTA = 1024 * 1024; // 1MB — teto de segurança, nunca alcançado hoje porque o chunk é fixo em 256KB.
const TAMANHO_CHUNK = Math.min(TAMANHO_TAIL_PADRAO, TAMANHO_MAX_RESPOSTA);

async function listarArquivos(req, res) {
  try {
    let nomes;
    try {
      nomes = await fs.promises.readdir(PASTA_LOGS);
    } catch (erro) {
      if (erro.code === 'ENOENT') { nomes = []; } else { throw erro; }
    }

    const candidatos = nomes.filter((nome) => REGEX_ARQUIVO_LOG.test(nome));

    const arquivos = await Promise.all(candidatos.map(async (nome) => {
      const caminho = path.join(PASTA_LOGS, nome);
      const info = await fs.promises.stat(caminho);
      return {
        data: nome.match(REGEX_ARQUIVO_LOG)[1],
        tamanhoBytes: info.size,
        atualizadoEm: info.mtime.toISOString(),
      };
    }));

    arquivos.sort((a, b) => (a.data < b.data ? 1 : -1)); // mais recente primeiro

    return res.status(200).json({ ok: true, arquivos });
  } catch (erro) {
    logger.erro('Falha ao listar arquivos de log', erro);
    return res.status(500).json({ ok: false, erro: 'Falha ao listar os logs.' });
  }
}

function lerTrecho(caminho, inicio, fim) {
  return new Promise((resolve, reject) => {
    const pedacos = [];
    const leitura = fs.createReadStream(caminho, { start: inicio, end: fim - 1, encoding: 'utf8' });
    leitura.on('data', (pedaco) => pedacos.push(pedaco));
    leitura.on('end', () => resolve(pedacos.join('')));
    leitura.on('error', reject);
  });
}

async function lerArquivo(req, res) {
  const { data } = req.params;
  if (!REGEX_DATA.test(data)) {
    return res.status(400).json({ ok: false, erro: 'data inválida (esperado YYYY-MM-DD).' });
  }

  // Nome do arquivo é montado a partir de um formato fixo já validado acima —
  // nunca concatena req.params.data livremente além deste template, pra não
  // abrir brecha de path traversal.
  const caminho = path.join(PASTA_LOGS, `bot-${data}.log`);

  let tamanhoTotal;
  try {
    const info = await fs.promises.stat(caminho);
    tamanhoTotal = info.size;
  } catch (erro) {
    if (erro.code === 'ENOENT') {
      return res.status(404).json({ ok: false, erro: 'Nenhum log encontrado para essa data.' });
    }
    logger.erro(`Falha ao checar o arquivo de log de ${data}`, erro);
    return res.status(500).json({ ok: false, erro: 'Falha ao ler o log.' });
  }

  const ateBruto = req.query.ate;
  let ate = tamanhoTotal;
  if (ateBruto !== undefined) {
    ate = Number(ateBruto);
    if (!Number.isInteger(ate) || ate < 0 || ate > tamanhoTotal) {
      return res.status(400).json({ ok: false, erro: 'parâmetro "ate" inválido.' });
    }
  }

  const offsetInicio = Math.max(0, ate - TAMANHO_CHUNK);
  const offsetFim = ate;

  if (offsetFim <= offsetInicio) {
    return res.status(200).json({
      ok: true, linhas: [], offsetInicio, offsetFim,
    });
  }

  try {
    const trecho = await lerTrecho(caminho, offsetInicio, offsetFim);
    let linhas = trecho.split('\n');
    // Quando não começamos do início do arquivo, a primeira "linha" lida
    // pode estar cortada ao meio — descarta em vez de mostrar meia linha.
    if (offsetInicio > 0) linhas = linhas.slice(1);
    if (linhas.length && linhas[linhas.length - 1] === '') linhas.pop();

    return res.status(200).json({
      ok: true, linhas, offsetInicio, offsetFim,
    });
  } catch (erro) {
    logger.erro(`Falha ao ler o trecho do log de ${data}`, erro);
    return res.status(500).json({ ok: false, erro: 'Falha ao ler o log.' });
  }
}

async function streamLogs(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const hoje = new Date().toISOString().slice(0, 10);
  const offsetBruto = req.query.offset;
  const offsetInicial = offsetBruto !== undefined && Number.isInteger(Number(offsetBruto))
    ? Number(offsetBruto)
    : undefined;

  await logTailService.inscrever(hoje, offsetInicial, res);

  req.on('close', () => {
    logTailService.desinscrever(hoje, res);
  });
}

module.exports = { listarArquivos, lerArquivo, streamLogs };
