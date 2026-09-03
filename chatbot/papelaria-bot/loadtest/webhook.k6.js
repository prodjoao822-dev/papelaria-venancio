// Teste de carga do webhook do bot (POST /webhook), Fase 4 (pré-Volta às
// Aulas). Roda contra loadtest/server-teste.js — o app Express REAL com
// todas as dependências externas (Supabase, Evolution API, n8n) dubladas em
// memória. NUNCA aponte BASE_URL para um ambiente com serviços reais.
//
// Uso:
//   node loadtest/server-teste.js                     (num terminal)
//   k6 run loadtest/webhook.k6.js                      (noutro terminal)
//   k6 run -e BASE_URL=http://localhost:3999 -e WEBHOOK_TOKEN=... loadtest/webhook.k6.js
//
// Cenários (rodam em sequência, um startTime depois do outro, pra não
// misturar as métricas de um cenário com o rate-limit consumido pelo outro):
//
//   1. pico_realista        — ~50-200 conversas DIFERENTES mandando mensagem
//                              numa janela curta (rajada de horário de pico),
//                              cada uma com 2-3 mensagens (navegação de menu +
//                              consulta ao Agente de Vendas).
//   2. concorrencia_conversa — várias mensagens quase simultâneas do MESMO
//                              remoteJid enquanto a conversa está com o
//                              Agente de Vendas ativo — testa o lock em
//                              memória (`conversasComAgenteVendasEmAndamento`).
//   3. mensagens_duplicadas  — o mesmo payload (mesmo `data.key.id`) disparado
//                              por várias VUs ao mesmo tempo — testa o dedupe
//                              por `mensagemId`.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3999';
const WEBHOOK_TOKEN = __ENV.WEBHOOK_TOKEN || 'loadtest-secret-token';
const WEBHOOK_URL = `${BASE_URL}/webhook`;

// --- Métricas customizadas ---------------------------------------------
const respostas429 = new Counter('webhook_429_total');
const respostas4xx5xx = new Counter('webhook_erro_total');
const duplicadosDetectados = new Counter('webhook_duplicado_detectado_total');
const duracaoPico = new Trend('duracao_pico_realista', true);
const duracaoConcorrencia = new Trend('duracao_concorrencia_conversa', true);
const duracaoDuplicados = new Trend('duracao_mensagens_duplicadas', true);
// Mesmas três, mas só com respostas 200 — a versão acima mistura 429 (que
// retorna quase instantâneo) com processamento de verdade, o que distorce
// p50/p95 pra baixo. Estas isolam "quanto demora quando o webhook processa a
// mensagem de fato", que é o número comparável a uma latência de produção.
const duracaoPicoSucesso = new Trend('duracao_pico_realista_sucesso', true);
const duracaoConcorrenciaSucesso = new Trend('duracao_concorrencia_conversa_sucesso', true);
const duracaoDuplicadosSucesso = new Trend('duracao_mensagens_duplicadas_sucesso', true);
// Heurística pra separar "processado de verdade pelo Agente de Vendas" de
// "descartado pelo lock em memória": o dublê do n8n demora
// LOADTEST_N8N_LATENCY_MS (default 1200ms na config do server-teste.js);
// uma resposta muito mais rápida que isso, para uma mensagem que deveria ter
// ido pro agente, indica que o webhookController descartou por causa do lock
// (`conversasComAgenteVendasEmAndamento`) sem chamar o n8n.
const LIMIAR_PROCESSADO_PELO_AGENTE_MS = Number(__ENV.LIMIAR_AGENTE_MS || 600);
const consultasAgenteAceitas = new Counter('lock_consultas_aceitas_pelo_agente');
const consultasAgenteDescartadasPeloLock = new Counter('lock_consultas_descartadas_total');

// Contadores por cenário — o Counter agregado (webhook_429_total) mistura os
// 3 cenários; estes permitem atribuir "quantos 429 vieram de cada rajada"
// sem precisar rodar cada cenário isoladamente.
const req429PorCenario = {
  pico: new Counter('webhook_429_pico'),
  concorrencia: new Counter('webhook_429_concorrencia'),
  duplicados: new Counter('webhook_429_duplicados'),
};
const req200PorCenario = {
  pico: new Counter('webhook_200_pico'),
  concorrencia: new Counter('webhook_200_concorrencia'),
  duplicados: new Counter('webhook_200_duplicados'),
};

// Tamanho da rajada de pico: quantas conversas DIFERENTES mandam mensagem
// nessa janela curta. Configurável via -e PICO_CONVERSAS=N; default 150
// (dentro da faixa 50-200 pedida, perto do teto pra estressar o cenário).
const PICO_CONVERSAS = Number(__ENV.PICO_CONVERSAS || 150);

export const options = {
  scenarios: {
    // `per-vu-iterations` com 1 iteração por VU: cada VU É uma conversa
    // distinta (telefone próprio) que manda sua sequência de mensagens
    // exatamente uma vez. Diferente de `ramping-vus` (que reaproveita a VU
    // pra rodar iterações sem parar), isso garante que a rajada simula
    // EXATAMENTE `PICO_CONVERSAS` clientes diferentes, não um número
        // arbitrariamente maior — k6 sobe as VUs o mais rápido possível, o que
    // é exatamente o comportamento de "rajada" (todo mundo escrevendo quase
    // ao mesmo tempo no horário de pico).
    pico_realista: {
      executor: 'per-vu-iterations',
      exec: 'picoRealista',
      vus: PICO_CONVERSAS,
      iterations: 1,
      maxDuration: '40s',
      startTime: '0s',
    },
    concorrencia_conversa: {
      executor: 'constant-vus',
      exec: 'concorrenciaConversa',
      vus: 15,
      duration: '20s',
      startTime: '35s', // depois do pico_realista terminar de descer
    },
    mensagens_duplicadas: {
      executor: 'per-vu-iterations',
      exec: 'mensagensDuplicadas',
      vus: 6,
      iterations: 4,
      maxDuration: '20s',
      startTime: '60s',
    },
  },
  thresholds: {
    // `webhook_erro_total` (ver registrarErroGenerico) só soma respostas
    // >=400 que NÃO são 429 — 429 é rastreado à parte e é esperado/aceitável
    // em rajada acima do limite (o que importa ali é comparar a contagem
    // com o volume real esperado, 50-200 msgs/DIA, bem abaixo do teto de
    // 300-600/min). Qualquer OUTRO erro (4xx de validação, 500) não tem
    // justificativa nos cenários deste script — threshold real, não
    // informativo: 0 esperado. `count>=0` (versão anterior) nunca falhava
    // o teste, mesmo com 100% de erro — corrigido em 03/09/2026 depois de
    // achar, na vistoria final, que um mock desatualizado causava 33,7% de
    // erro 500 sem que nenhum threshold acusasse isso.
    'webhook_erro_total': ['count<1'],
    'duracao_pico_realista': ['p(95)<5000'],
  },
};

function payloadTexto(remoteJid, texto, id, pushName) {
  return JSON.stringify({
    event: 'messages.upsert',
    instance: 'loadtest',
    data: {
      key: { remoteJid, fromMe: false, id },
      pushName: pushName || 'Cliente Loadtest',
      message: { conversation: texto },
    },
  });
}

function headers() {
  return { headers: { 'Content-Type': 'application/json', 'x-webhook-token': WEBHOOK_TOKEN } };
}

const TRENDS_SUCESSO = {
  pico: duracaoPicoSucesso,
  concorrencia: duracaoConcorrenciaSucesso,
  duplicados: duracaoDuplicadosSucesso,
};

function registrarErroGenerico(resposta, cenario) {
  if (resposta.status === 429) {
    respostas429.add(1);
    if (cenario) req429PorCenario[cenario].add(1);
  } else if (resposta.status >= 400) {
    respostas4xx5xx.add(1);
  } else if (cenario) {
    req200PorCenario[cenario].add(1);
    TRENDS_SUCESSO[cenario].add(resposta.timings.duration);
  }
}

function corpoJson(resposta) {
  try {
    return resposta.json();
  } catch (erro) {
    return null;
  }
}

// --- Cenário 1: pico realista -------------------------------------------
// Cada VU/iteração = uma conversa nova (remoteJid próprio), simulando uma
// rajada de clientes diferentes escrevendo ao mesmo tempo num horário de
// pico. Varia o texto da 1ª mensagem e o caminho tomado no menu, pra não
// bater sempre exatamente na mesma sequência de estados.
const SAUDACOES = ['Oi', 'Bom dia', 'Boa tarde', 'Oi, tudo bem?', 'Olá!'];

export function picoRealista() {
  const telefone = `5527${String(900000000 + __VU * 1000 + __ITER).padStart(9, '0')}`;
  const remoteJid = `${telefone}@s.whatsapp.net`;
  const saudacao = SAUDACOES[__VU % SAUDACOES.length];

  const r1 = http.post(WEBHOOK_URL, payloadTexto(remoteJid, saudacao, `${telefone}-MSG1`), headers());
  check(r1, { 'msg1: status 200': (r) => r.status === 200 });
  registrarErroGenerico(r1, 'pico');
  duracaoPico.add(r1.timings.duration);

  sleep(Math.random() * 1.2 + 0.3); // tempo de "digitação" do cliente

  const r2 = http.post(WEBHOOK_URL, payloadTexto(remoteJid, '1', `${telefone}-MSG2`), headers());
  check(r2, { 'msg2 (menu vendas): status 200': (r) => r.status === 200 });
  registrarErroGenerico(r2, 'pico');
  duracaoPico.add(r2.timings.duration);

  sleep(Math.random() * 1.2 + 0.3);

  // 60% pergunta de produto (vai pro Agente de Vendas simulado, ~1.2s),
  // 25% pede atendente humano, 15% pede cotação empresa (só navegação).
  const dado = Math.random();
  let msg3Texto = '7';
  if (dado < 0.6) msg3Texto = '2';
  else if (dado < 0.85) msg3Texto = '6';

  const r3 = http.post(WEBHOOK_URL, payloadTexto(remoteJid, msg3Texto, `${telefone}-MSG3`), headers());
  check(r3, { 'msg3: status 200': (r) => r.status === 200 });
  registrarErroGenerico(r3, 'pico');
  duracaoPico.add(r3.timings.duration);
}

// --- Cenário 2: concorrência por conversa (lock do Agente de Vendas) ----
// Pool pequeno e FIXO de telefones compartilhado entre todas as VUs deste
// cenário — de propósito, pra forçar mensagens de VUs diferentes caindo na
// MESMA conversa ao mesmo tempo (é o que aciona
// `conversasComAgenteVendasEmAndamento` no webhookController).
const POOL_CONCORRENCIA = Array.from({ length: 5 }, (_, i) => `55271000000${i}`);

// Cada telefone do pool precisa estar em AGENTE_VENDAS_ATIVO antes da rajada
// de concorrência começar — feito uma vez em setup() (sequencial, sem
// concorrência), exatamente como um cliente real chegaria nesse estado antes
// de mandar várias mensagens seguidas.
export function setup() {
  POOL_CONCORRENCIA.forEach((telefone, indice) => {
    const remoteJid = `${telefone}@s.whatsapp.net`;
    http.post(WEBHOOK_URL, payloadTexto(remoteJid, 'Oi', `${telefone}-SETUP1`), headers());
    http.post(WEBHOOK_URL, payloadTexto(remoteJid, '1', `${telefone}-SETUP2`), headers());
    // '2' aciona o Agente de Vendas simulado (~1.2s) — ao terminar, a
    // conversa fica persistida em AGENTE_VENDAS_ATIVO.
    const r = http.post(WEBHOOK_URL, payloadTexto(remoteJid, '2', `${telefone}-SETUP3`), headers());
    check(r, { [`setup conversa ${indice}: entrou no Agente de Vendas`]: (resp) => resp.status === 200 });
  });
  return { poolPronto: true };
}

export function concorrenciaConversa() {
  const telefone = POOL_CONCORRENCIA[__VU % POOL_CONCORRENCIA.length];
  const remoteJid = `${telefone}@s.whatsapp.net`;
  const idUnico = `${telefone}-CONC-${__VU}-${__ITER}-${Date.now()}`;

  const perguntas = ['tem caderno 10 matérias?', 'e lápis de cor?', 'quanto custa a mochila?', 'oi, alguém aí?'];
  const texto = perguntas[__ITER % perguntas.length];

  const resposta = http.post(WEBHOOK_URL, payloadTexto(remoteJid, texto, idUnico), headers());
  check(resposta, { 'concorrencia: status 200': (r) => r.status === 200 });
  registrarErroGenerico(resposta, 'concorrencia');
  duracaoConcorrencia.add(resposta.timings.duration);

  // Heurística de duração (ver comentário no topo do arquivo): rápido demais
  // pra ter passado pelo Agente de Vendas simulado => foi descartado pelo lock.
  if (resposta.status === 200) {
    if (resposta.timings.duration >= LIMIAR_PROCESSADO_PELO_AGENTE_MS) {
      consultasAgenteAceitas.add(1);
    } else {
      consultasAgenteDescartadasPeloLock.add(1);
    }
  }

  sleep(Math.random() * 0.3);
}

// --- Cenário 3: mensagens duplicadas (mesmo mensagemId) -------------------
// Todas as VUs deste cenário disparam, na MESMA iteração, o payload
// EXATAMENTE IGUAL (mesmo remoteJid + mesmo data.key.id) — simula o retry de
// webhook da Evolution API chegando em paralelo, ou o WhatsApp reentregando o
// mesmo evento. Só uma cópia deveria processar de verdade; as demais devem
// voltar com `duplicado: true` no corpo (dedupe por `mensagemId`, ver
// webhookController.js).
export function mensagensDuplicadas() {
  const telefone = `552799${String(__ITER).padStart(7, '0')}`;
  const remoteJid = `${telefone}@s.whatsapp.net`;
  const idFixo = `${telefone}-DUP-ITER-${__ITER}`; // igual para todas as VUs nesta iteração

  const resposta = http.post(WEBHOOK_URL, payloadTexto(remoteJid, '1', idFixo), headers());
  check(resposta, { 'duplicado: status 200': (r) => r.status === 200 });
  registrarErroGenerico(resposta, 'duplicados');
  duracaoDuplicados.add(resposta.timings.duration);

  const corpo = corpoJson(resposta);
  if (corpo && corpo.duplicado === true) {
    duplicadosDetectados.add(1);
  }
}

export function handleSummary(data) {
  return {
    stdout: `\n=== RESUMO DO TESTE DE CARGA (webhook papelaria-bot) ===\n${JSON.stringify(
      {
        http_reqs: data.metrics.http_reqs?.values,
        http_req_duration: data.metrics.http_req_duration?.values,
        http_req_failed: data.metrics.http_req_failed?.values,
        webhook_429_total: data.metrics.webhook_429_total?.values,
        webhook_429_pico: data.metrics.webhook_429_pico?.values,
        webhook_200_pico: data.metrics.webhook_200_pico?.values,
        webhook_429_concorrencia: data.metrics.webhook_429_concorrencia?.values,
        webhook_200_concorrencia: data.metrics.webhook_200_concorrencia?.values,
        webhook_429_duplicados: data.metrics.webhook_429_duplicados?.values,
        webhook_200_duplicados: data.metrics.webhook_200_duplicados?.values,
        webhook_erro_total: data.metrics.webhook_erro_total?.values,
        duracao_pico_realista: data.metrics.duracao_pico_realista?.values,
        duracao_pico_realista_sucesso: data.metrics.duracao_pico_realista_sucesso?.values,
        duracao_concorrencia_conversa: data.metrics.duracao_concorrencia_conversa?.values,
        duracao_concorrencia_conversa_sucesso: data.metrics.duracao_concorrencia_conversa_sucesso?.values,
        duracao_mensagens_duplicadas: data.metrics.duracao_mensagens_duplicadas?.values,
        duracao_mensagens_duplicadas_sucesso: data.metrics.duracao_mensagens_duplicadas_sucesso?.values,
        webhook_duplicado_detectado_total: data.metrics.webhook_duplicado_detectado_total?.values,
        lock_consultas_aceitas_pelo_agente: data.metrics.lock_consultas_aceitas_pelo_agente?.values,
        lock_consultas_descartadas_total: data.metrics.lock_consultas_descartadas_total?.values,
      },
      null,
      2
    )}\n`,
  };
}
