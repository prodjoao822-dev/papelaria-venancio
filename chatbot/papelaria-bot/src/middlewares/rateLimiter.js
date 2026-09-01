// Limite de requisições nas rotas de webhook — hoje protegidas só por um token
// compartilhado (verifyToken.js), não por login. Sem isso, um flood (ataque,
// bug de retry da Evolution API, ou um pico real de Volta às Aulas fugindo do
// esperado) podia sobrecarregar o processo/a conexão com o Supabase sem
// nenhum limite. O limite é por IP de origem: como a Evolution API e o n8n
// sempre chamam a partir do mesmo servidor, isso na prática limita o
// throughput total do webhook, não por cliente individual — E as duas rotas
// abaixo (mensagem de cliente via Evolution API e callback do Agente de
// Orçamento via n8n) dividem o MESMO contador, porque as duas vêm do mesmo IP.
//
// Teto subido de 300 -> 600/min em 29/08/2026 (teste de carga k6, Fase 4):
// com 300 o limitador já disparava 429 numa rajada de ~150 conversas em poucos
// segundos — bem mais agressivo que o volume real esperado (50-200 msgs/DIA),
// mas a época de Volta às Aulas soma tráfego de cliente E uma rajada de
// callbacks do Agente de Orçamento (várias listas escolares precificadas em
// sequência) no mesmo balde. 600 mantém a proteção (ainda bem abaixo do que um
// flood de ataque produziria) com mais fôlego pra pico legítimo sazonal.
// Ajustável sem redeploy de código via WEBHOOK_RATE_LIMIT_PER_MIN.
const rateLimit = require('express-rate-limit');

const limiteWebhook = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.WEBHOOK_RATE_LIMIT_PER_MIN || 600),
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas requisições em pouco tempo. Tente novamente em instantes.' },
});

// Login do Separador (código + PIN) — teto bem mais apertado que o do
// webhook: aqui o objetivo é especificamente dificultar força bruta de PIN
// por IP (defesa em profundidade, além do bloqueio por conta em
// separadorAuthController.js#login, que é por código_funcionario e
// sobrevive a quem tenta de vários IPs).
const limiteLoginSeparador = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, erro: 'Muitas tentativas de login em pouco tempo. Tente novamente em instantes.' },
});

// Login do Operador por código+PIN (01/09/2026) — mesmo motivo/mesmo teto
// do limiteLoginSeparador, contador separado (rota diferente) pra não
// dividir o mesmo balde entre login de operador e de funcionário.
const limiteLoginOperador = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, erro: 'Muitas tentativas de login em pouco tempo. Tente novamente em instantes.' },
});

module.exports = { limiteWebhook, limiteLoginSeparador, limiteLoginOperador };
