// Rota 6 — Fluxo de separação: "checklist, ausência de separador ->
// desativação sem fila FIFO".
//
// NÃO É POSSÍVEL testar esta rota rodando o processo do bot (`receberWebhook`
// ou qualquer rota HTTP de `papelaria-bot`): buscas no código-fonte confirmam
// que NENHUMA rota do bot toca `solicitacoes_separacao`,
// `solicitacoes_separacao_itens`, `solicitacoes_separacao_mensagens`,
// `solicitacoes_entrega` ou `notificacoes_internas` — o dashboard
// (venancio-ai-ops) e o app chamam a RPC `delegar_separacao` (e as demais de
// `extensao_separacao_delegada.sql`) DIRETO no Supabase, sem passar pelo bot.
// A única "porta de escrita" é a própria RPC, que roda inteiramente dentro do
// Postgres — testar o comportamento de verdade exigiria um Postgres real
// (pgTAP ou supabase start local), fora do escopo de `node --test` deste
// projeto.
//
// O que este arquivo faz, então, é um TESTE DE CONTRATO: lê o SQL versionado
// (fonte de verdade, ver Bloqueador B6 do plano mestre) e prova, por
// inspeção estrutural, a afirmação da rota — que a ausência de um separador
// ativo é tratada como REJEIÇÃO IMEDIATA e SÍNCRONA (raise exception, dentro
// da mesma transação) e não como enfileiramento/retenção da solicitação.
// Também é reconfirmado por leitura direta do Postgres de produção (schema
// `public`, 24/08/2026) que não existe nenhuma tabela de fila/espera de
// separação — nem `fila_separacao`, nem `solicitacoes_separacao_pendentes`,
// nem equivalente.
//
// Este teste fica no test suite do bot (não seria apropriado editar/gerar
// migração — isso é escopo do agente supabase-db) só como EVIDÊNCIA
// reproduzível; ele lê o arquivo, nunca escreve nele.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CAMINHO_SQL = path.join(__dirname, '..', '..', 'supabase', 'extensao_separacao_delegada.sql');
const sql = fs.readFileSync(CAMINHO_SQL, 'utf8');

function trechoDaFuncao(nomeFuncao) {
  const inicio = sql.indexOf(`create or replace function ${nomeFuncao}(`);
  assert.notEqual(inicio, -1, `função ${nomeFuncao} não encontrada em ${CAMINHO_SQL}`);
  const fimMarcador = sql.indexOf('$$ language plpgsql', inicio);
  assert.notEqual(fimMarcador, -1, `fim de ${nomeFuncao} (marcador "$$ language plpgsql") não encontrado`);
  return sql.slice(inicio, fimMarcador);
}

test('delegar_separacao: sem separador ativo, lança exceção na hora (nunca enfileira nem retorna "pendente de separador")', () => {
  const corpo = trechoDaFuncao('delegar_separacao');

  assert.match(
    corpo,
    /where id = p_separador_id and ativo and 'separacao' = any\(papeis\)/,
    'a checagem de separador ativo precisa continuar existindo dentro da própria RPC'
  );

  // A checagem "not exists (...)" precisa ser seguida, na mesma função,
  // por um `raise exception` — ou seja, rejeição imediata dentro da MESMA
  // transação. Não existe branch alternativo tipo "insere com status
  // 'aguardando_separador'" ou "agenda pra tentar de novo depois".
  const trechoDaChecagem = corpo.slice(corpo.indexOf('not exists (\n    select 1 from funcionarios'));
  assert.match(
    trechoDaChecagem.slice(0, 400),
    /raise exception 'Funcionário % não é um separador ativo', p_separador_id;/,
    'ausência de separador ativo precisa continuar sendo uma rejeição síncrona (raise exception), não uma fila'
  );

  // A rejeição vem ANTES do único `insert into solicitacoes_separacao` da
  // função — ou seja, nenhuma linha chega a ser gravada representando uma
  // solicitação "esperando" por um separador.
  const indiceRejeicao = corpo.indexOf("raise exception 'Funcionário % não é um separador ativo'");
  const indiceInsert = corpo.indexOf('insert into solicitacoes_separacao');
  assert.ok(indiceRejeicao > -1 && indiceInsert > -1 && indiceRejeicao < indiceInsert);
});

test('solicitacoes_separacao: o CHECK de status não tem nenhum valor de "aguardando fila"/"sem separador"', () => {
  const match = sql.match(/status\s+text not null default 'pendente'\s*\n\s*check \(status in \(([^)]+)\)\)/);
  assert.ok(match, 'CHECK de status de solicitacoes_separacao não encontrado — a tabela mudou de formato?');

  const statusPermitidos = match[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(statusPermitidos, ['pendente', 'em_andamento', 'pronta', 'cancelada']);

  const statusDeFila = statusPermitidos.filter((s) => /fila|aguardando|espera|queue|fifo/i.test(s));
  assert.deepEqual(statusDeFila, [], 'não pode existir um status de "aguardando entrar na fila"');
});

test('nenhuma tabela de fila/espera de separação existe no SQL versionado (nem "fila_separacao", nem equivalente)', () => {
  const arquivosSql = fs.readdirSync(path.join(__dirname, '..', '..', 'supabase'))
    .filter((nome) => nome.endsWith('.sql'));

  const REGEX_TABELA_DE_FILA_DE_SEPARACAO = /create table[^;]*\b(fila_separacao|separacao_fila|fila_espera_separador|separadores_fila)\b/i;

  for (const nomeArquivo of arquivosSql) {
    const conteudo = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', nomeArquivo), 'utf8');
    assert.doesNotMatch(
      conteudo,
      REGEX_TABELA_DE_FILA_DE_SEPARACAO,
      `${nomeArquivo} não deveria conter uma tabela de fila de separação`
    );
  }
});
