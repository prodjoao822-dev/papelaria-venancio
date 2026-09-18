// logTailService é a peça de "tail ao vivo" por trás de /admin/logs/stream —
// a única deste conjunto com requisito real de performance/concorrência: UM
// fs.watch compartilhado por dia (nunca um por cliente conectado) e leitura
// só do trecho NOVO do arquivo (nunca relê do início).
//
// Usa um arquivo de log REAL (não um dublê) em os.tmpdir(), mesmo recurso já
// usado por test/webhook/webhookController.finalizacaoConcorrente.test.js
// pra outro propósito (REGISTRO_ECOS_PATH) — aqui é o próprio arquivo que o
// serviço faz tail. `src/utils/logger` é dublado só pra apontar PASTA_LOGS
// pra essa pasta temporária, sem imprimir nada no console durante o teste.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const pastaTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'logs-tail-'));
const hoje = new Date().toISOString().slice(0, 10);
const caminhoArquivo = path.join(pastaTmp, `bot-${hoje}.log`);

fs.writeFileSync(caminhoArquivo, 'linha-inicial-1\nlinha-inicial-2\n');

const caminhoLogger = require.resolve('../../src/utils/logger');
require.cache[caminhoLogger] = {
  id: caminhoLogger,
  filename: caminhoLogger,
  loaded: true,
  exports: {
    info: () => {},
    aviso: () => {},
    erro: () => {},
    PASTA_LOGS: pastaTmp,
  },
};

// Espiona fs.watch ANTES de logTailService carregar: como `require('fs')`
// sempre devolve o MESMO objeto (module singleton do Node), sobrescrever a
// propriedade aqui intercepta as chamadas feitas de dentro do serviço —
// única forma de provar "um único watcher compartilhado" e "watcher fechado
// de verdade" sem o serviço expor esse estado interno.
const watchOriginal = fs.watch.bind(fs);
let chamadasWatch = 0;
let watchersFechados = 0;
fs.watch = (...args) => {
  chamadasWatch += 1;
  const watcher = watchOriginal(...args);
  const closeOriginal = watcher.close.bind(watcher);
  watcher.close = (...argsClose) => {
    watchersFechados += 1;
    return closeOriginal(...argsClose);
  };
  return watcher;
};

const logTailService = require('../../src/admin/logTailService');

function criarClienteFalso() {
  const linhas = [];
  const res = {
    write: (chunk) => {
      const linhaDeDado = chunk.match(/^data: (.*)\n\n$/);
      if (linhaDeDado) linhas.push(linhaDeDado[1]);
      return true;
    },
  };
  res.linhas = linhas;
  return res;
}

async function esperarAte(condicao, { timeoutMs = 3000, intervaloMs = 50 } = {}) {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    if (condicao()) return true;
    // eslint-disable-next-line no-await-in-loop -- poll sequencial por design, é um teste
    await new Promise((resolve) => { setTimeout(resolve, intervaloMs); });
  }
  return condicao();
}

test('tail ao vivo: dois clientes compartilham um único fs.watch, recebem só as linhas novas (delta), e desinscrever o último fecha o watcher', async () => {
  const cliente1 = criarClienteFalso();
  await logTailService.inscrever(hoje, undefined, cliente1);

  assert.equal(chamadasWatch, 1, 'a primeira inscrição do dia precisa abrir exatamente um fs.watch');
  assert.equal(cliente1.linhas.length, 0, 'sem escrever nada ainda, não deve ter recebido nenhuma linha de dado');

  const cliente2 = criarClienteFalso();
  await logTailService.inscrever(hoje, undefined, cliente2);

  assert.equal(chamadasWatch, 1, 'o segundo cliente do MESMO dia não pode abrir um segundo fs.watch');

  // --- delta-only: só a linha nova, nunca as que já existiam no arquivo ---
  fs.appendFileSync(caminhoArquivo, 'linha-nova-1\n');

  const chegouNosDois = await esperarAte(
    () => cliente1.linhas.includes('linha-nova-1') && cliente2.linhas.includes('linha-nova-1')
  );
  assert.ok(chegouNosDois, 'a linha nova precisa chegar via tail ao vivo nos dois clientes conectados');
  assert.deepEqual(cliente1.linhas, ['linha-nova-1'], 'não pode ter relido as linhas iniciais do arquivo');
  assert.deepEqual(cliente2.linhas, ['linha-nova-1']);

  // --- desinscrever um cliente (não o último) não fecha o watcher ---
  logTailService.desinscrever(hoje, cliente1);
  assert.equal(watchersFechados, 0, 'ainda há um cliente conectado (cliente2) — o watcher precisa continuar de pé');

  fs.appendFileSync(caminhoArquivo, 'linha-nova-2\n');
  const so2Recebeu = await esperarAte(() => cliente2.linhas.includes('linha-nova-2'));
  assert.ok(so2Recebeu, 'cliente2 (ainda inscrito) precisa continuar recebendo linhas novas');
  assert.deepEqual(cliente1.linhas, ['linha-nova-1'], 'cliente1, já desinscrito, não pode receber mais nada');

  // --- desinscrever o ÚLTIMO cliente fecha o watcher de verdade ---
  logTailService.desinscrever(hoje, cliente2);
  assert.equal(watchersFechados, 1, 'sem nenhum cliente restante, o watcher precisa ser fechado');

  fs.appendFileSync(caminhoArquivo, 'linha-orfa-sem-assinante\n');
  await new Promise((resolve) => { setTimeout(resolve, 150); });
  assert.deepEqual(
    cliente2.linhas,
    ['linha-nova-1', 'linha-nova-2'],
    'sem assinante nenhum, a mudança no arquivo não deve gerar mais escritas'
  );
});

test('inscrever com offsetInicial atrasado (cliente reconectando) faz catch-up de uma vez só, sem esperar o próximo fs.watch', async () => {
  // Um primeiro cliente já mantém a assinatura do dia viva e atualizada...
  const clienteJaConectado = criarClienteFalso();
  await logTailService.inscrever(hoje, undefined, clienteJaConectado);

  fs.appendFileSync(caminhoArquivo, 'linha-perdida-durante-a-desconexao\n');
  const assinaturaAvancou = await esperarAte(
    () => clienteJaConectado.linhas.includes('linha-perdida-durante-a-desconexao')
  );
  assert.ok(assinaturaAvancou, 'pré-condição: a assinatura do dia precisa ter avançado além do offset antigo');

  // ...e um segundo cliente reconecta informando um offset ANTERIOR ao que a
  // assinatura já tem — precisa receber o trecho perdido de uma vez, no
  // catch-up, sem depender de outra escrita no arquivo pra disparar o watch.
  const offsetAntesDaAssinaturaExistir = fs.statSync(caminhoArquivo).size
    - Buffer.byteLength('linha-perdida-durante-a-desconexao\n', 'utf8');
  const clienteReconectando = criarClienteFalso();
  await logTailService.inscrever(hoje, offsetAntesDaAssinaturaExistir, clienteReconectando);

  assert.deepEqual(clienteReconectando.linhas, ['linha-perdida-durante-a-desconexao']);

  logTailService.desinscrever(hoje, clienteJaConectado);
  logTailService.desinscrever(hoje, clienteReconectando);
});

test('inscrever para uma data diferente de hoje devolve evento de erro e encerra a conexão', async () => {
  const escritas = [];
  const res = {
    write: (chunk) => { escritas.push(chunk); return true; },
    end: () => { res.encerrado = true; },
  };

  await logTailService.inscrever('2020-01-01', undefined, res);

  assert.equal(res.encerrado, true);
  assert.ok(escritas.some((chunk) => chunk.startsWith('event: erro')));
});
