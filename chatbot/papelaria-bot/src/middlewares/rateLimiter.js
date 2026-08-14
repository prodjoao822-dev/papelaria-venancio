// Limite de requisições nas rotas de webhook — hoje protegidas só por um token
// compartilhado (verifyToken.js), não por login. Sem isso, um flood (ataque,
// bug de retry da Evolution API, ou um pico real de Volta às Aulas fugindo do
// esperado) podia sobrecarregar o processo/a conexão com o Supabase sem
// nenhum limite. O limite é por IP de origem: como a Evolution API e o n8n
// sempre chamam a partir do mesmo servidor, isso na prática limita o
// throughput total do webhook, não por cliente individual — por isso o teto é
// generoso (bem acima do que um pico real de mensagens simultâneas produziria).

const rateLimit = require('express-rate-limit');

const limiteWebhook = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas requisições em pouco tempo. Tente novamente em instantes.' },
});

module.exports = { limiteWebhook };
