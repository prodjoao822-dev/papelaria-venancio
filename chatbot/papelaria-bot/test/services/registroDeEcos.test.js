const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Arquivo descartável: os testes não podem escrever no cache real do bot, que
// é lido de verdade no boot do processo em produção.
const CAMINHO_TESTE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ecos-')), 'ecos.json');
process.env.REGISTRO_ECOS_PATH = CAMINHO_TESTE;

const CAMINHO_MODULO = require.resolve('../../src/services/registroDeEcos');

// Recarrega o módulo do zero, como se o processo tivesse reiniciado (nodemon
// salvando arquivo, PM2 subindo depois de um crash). É exatamente o cenário que
// a persistência existe pra cobrir, então precisa ser testado assim e não
// chamando uma função de "recarregar".
function reiniciarProcesso() {
  delete require.cache[CAMINHO_MODULO];
  // eslint-disable-next-line global-require -- recarga proposital, ver acima
  return require('../../src/services/registroDeEcos');
}

function aguardarGravacao() {
  return new Promise((resolve) => { setTimeout(resolve, 150); });
}

// Cada `reiniciarProcesso` deixa viva a instância anterior do módulo, com a
// própria fila de gravação. Isso só existe aqui no teste (em produção há uma
// instância só, e é ela quem serializa tudo), mas sem esperar as gravações
// pendentes assentarem, uma escrita atrasada da instância velha pode aterrissar
// depois do unlink e bagunçar o teste seguinte.
async function comRegistroLimpo() {
  await aguardarGravacao();
  try { fs.unlinkSync(CAMINHO_TESTE); } catch { /* primeiro teste: nem existe */ }
  const registro = reiniciarProcesso();
  registro._limparParaTeste();
  return registro;
}

const TELEFONE = '5527999999999';
const TEXTO_DO_MENU = 'Digite a opção desejada:';

test('reconhece o eco pelo id da mensagem enviada', async () => {
  const registro = await comRegistroLimpo();
  registro.registrarIdEnviado('MSG-ABC');

  assert.equal(registro.consumirEcoDoBot('MSG-ABC', TELEFONE, 'qualquer texto'), true);
});

test('reconhece o eco pelo conteúdo quando o id se perdeu', async () => {
  const registro = await comRegistroLimpo();
  // ECONNRESET na leitura da resposta: a mensagem saiu, mas o id nunca voltou.
  registro.registrarConteudoEnviado(TELEFONE, TEXTO_DO_MENU);

  assert.equal(registro.consumirEcoDoBot(null, TELEFONE, TEXTO_DO_MENU), true);
});

test('fromMe de um humano de verdade não é confundido com eco', async () => {
  const registro = await comRegistroLimpo();
  registro.registrarConteudoEnviado(TELEFONE, TEXTO_DO_MENU);

  assert.equal(
    registro.consumirEcoDoBot('MSG-XYZ', TELEFONE, 'Oi, aqui é a Vanessa, já te ajudo'),
    false,
    'texto digitado à mão pela loja precisa pausar o bot'
  );
});

// Cada envio "gasta" um eco: se o bot mandou o menu duas vezes, os dois ecos são
// dele — mas um terceiro fromMe idêntico já é humano.
test('dois envios iguais consomem dois ecos, e o terceiro é humano', async () => {
  const registro = await comRegistroLimpo();
  registro.registrarConteudoEnviado(TELEFONE, TEXTO_DO_MENU);
  registro.registrarConteudoEnviado(TELEFONE, TEXTO_DO_MENU);

  assert.equal(registro.consumirEcoDoBot(null, TELEFONE, TEXTO_DO_MENU), true);
  assert.equal(registro.consumirEcoDoBot(null, TELEFONE, TEXTO_DO_MENU), true);
  assert.equal(registro.consumirEcoDoBot(null, TELEFONE, TEXTO_DO_MENU), false);
});

test('o eco só é consumido uma vez (id não vale pra duas mensagens)', async () => {
  const registro = await comRegistroLimpo();
  registro.registrarIdEnviado('MSG-ABC');

  assert.equal(registro.consumirEcoDoBot('MSG-ABC', TELEFONE, 'x'), true);
  assert.equal(registro.consumirEcoDoBot('MSG-ABC', TELEFONE, 'x'), false);
});

test('telefone com máscara casa com o mesmo número sem máscara', async () => {
  const registro = await comRegistroLimpo();
  registro.registrarConteudoEnviado('+55 (27) 99999-9999', TEXTO_DO_MENU);

  assert.equal(registro.consumirEcoDoBot(null, '5527999999999', TEXTO_DO_MENU), true);
});

// --- o ponto central da correção de 12/08 ---
//
// Antes, o registro vivia só em memória: um restart do nodemon apagava tudo, os
// ecos das mensagens recém-enviadas voltavam como "humano respondeu" e o bot
// pausava conversas vivas. Com o relógio de reativação corrigido elas voltariam
// sozinhas em 2h, mas continuariam mudas até lá — então isso precisa não
// acontecer.

test('o registro sobrevive a um restart do processo (id)', async () => {
  const registro = await comRegistroLimpo();
  registro.registrarIdEnviado('MSG-ANTES-DO-RESTART');
  await aguardarGravacao();

  const depoisDoRestart = reiniciarProcesso();

  assert.equal(
    depoisDoRestart.consumirEcoDoBot('MSG-ANTES-DO-RESTART', TELEFONE, 'x'),
    true,
    'salvar um arquivo no editor não pode calar uma conversa em andamento'
  );
});

test('o registro sobrevive a um restart do processo (conteúdo)', async () => {
  const registro = await comRegistroLimpo();
  registro.registrarConteudoEnviado(TELEFONE, TEXTO_DO_MENU);
  await aguardarGravacao();

  const depoisDoRestart = reiniciarProcesso();

  assert.equal(depoisDoRestart.consumirEcoDoBot(null, TELEFONE, TEXTO_DO_MENU), true);
});

test('registro expirado não sobrevive ao restart', async () => {
  const registro = await comRegistroLimpo();
  registro.registrarIdEnviado('MSG-VELHA');
  await aguardarGravacao();

  // Envelhece a entrada no disco além de qualquer TTL, sem esperar de verdade.
  const dados = JSON.parse(fs.readFileSync(CAMINHO_TESTE, 'utf8'));
  dados.ids = dados.ids.map(([id]) => [id, Date.now() - 1000]);
  fs.writeFileSync(CAMINHO_TESTE, JSON.stringify(dados));

  const depoisDoRestart = reiniciarProcesso();

  assert.equal(
    depoisDoRestart.consumirEcoDoBot('MSG-VELHA', TELEFONE, 'x'),
    false,
    'eco vencido precisa voltar a ser tratado como humano'
  );
});

test('arquivo de cache corrompido não derruba o bot', async () => {
  const registro = await comRegistroLimpo();
  registro.registrarIdEnviado('MSG-1');
  fs.writeFileSync(CAMINHO_TESTE, '{ isso não é json válido');

  const depoisDoRestart = reiniciarProcesso();

  // Sobe com registro vazio em vez de estourar na carga do módulo.
  assert.equal(depoisDoRestart.consumirEcoDoBot('MSG-1', TELEFONE, 'x'), false);
});

test('ausência do arquivo no primeiro boot é tratada como registro vazio', () => {
  try { fs.unlinkSync(CAMINHO_TESTE); } catch { /* já não existe */ }

  const registro = reiniciarProcesso();

  assert.equal(registro.consumirEcoDoBot('QUALQUER', TELEFONE, 'x'), false);
});
