// Ponto de entrada da aplicação: inicializa o servidor Express e registra as rotas/middlewares.

const express = require('express');
const env = require('./config/env'); // valida as variáveis de ambiente já na subida (falha rápido)
const verifyToken = require('./middlewares/verifyToken');
const verifyOperador = require('./middlewares/verifyOperador');
const verifyAdmin = require('./middlewares/verifyAdmin');
const {
  limiteWebhook, limiteLoginSeparador, limiteLoginOperador, limiteAdmin,
} = require('./middlewares/rateLimiter');
const webhookController = require('./webhook/webhookController');
const healthController = require('./healthController');
const operadorController = require('./dashboard/operadorController');
const separadorAuthController = require('./dashboard/separadorAuthController');
const operadorAuthController = require('./dashboard/operadorAuthController');
const adminConfigController = require('./admin/adminConfigController');
const adminLogsController = require('./admin/adminLogsController');
const analyticsService = require('./services/analyticsService');
const logger = require('./utils/logger');

// Rede de segurança de visibilidade: sem isso, um erro não tratado em
// qualquer lugar (uma promise sem .catch(), um throw síncrono num callback de
// EventEmitter como res.on('finish')) derruba o processo inteiro sem deixar
// NENHUM rastro do que aconteceu — só "app crashed" no nodemon/pm2, sem stack
// trace. (Investigação de crash de 07/08/2026: o log parava logo depois de um
// webhook bem-sucedido, sem erro nenhum impresso antes do processo morrer.)
//
// unhandledRejection só loga, não derruba o processo: a arquitetura do bot é
// muitas conversas independentes em paralelo — uma promise esquecida sem
// await numa conversa não deveria tirar todo mundo do ar. É um bug a corrigir
// (o ideal é sempre ter await + try/catch), mas não motivo pra crashar tudo.
//
// uncaughtException loga e SAI do processo propositalmente: nesse caso o
// estado da aplicação pode estar inconsistente (é a recomendação oficial do
// Node), então é mais seguro deixar o pm2 (autorestart:true, ver
// ecosystem.config.js) subir um processo novo e limpo do que continuar
// rodando sobre um estado desconhecido.
process.on('unhandledRejection', (motivo) => {
  logger.erro('unhandledRejection — promise rejeitada sem .catch() em algum lugar do código', motivo);
});

process.on('uncaughtException', (erro) => {
  logger.erro('uncaughtException — erro não tratado; encerrando o processo pro pm2 reiniciar limpo', erro);
  process.exit(1);
});

const app = express();
// O bot roda atrás de um túnel (ngrok) — sem isso, o Express não confia no
// header X-Forwarded-For que o ngrok manda, e o express-rate-limit loga
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR (visto em produção em 29/07/2026) em vez
// de identificar corretamente o IP de origem de cada requisição.
app.set('trust proxy', 1);
// O limite padrão do Express (100kb) é pequeno demais pra alguns eventos da
// Evolution API — mensagens com mídia (imagem, áudio, etc.) chegam com o
// arquivo em base64 dentro do próprio payload do webhook e passam disso fácil.
app.use(express.json({ limit: '25mb' }));

app.get('/', (req, res) => {
  res.json({ status: 'ok', servico: 'papelaria-bot' });
});

// Health check de infra (Docker/Caddy) — sem autenticação de propósito, ver
// comentário em src/healthController.js.
app.get('/health', healthController.verificarSaude);

// Instrumentação (análise de instabilidade, 29/07/2026): mede o tempo total
// de processamento de cada webhook (Supabase + stateMachine + chamada ao
// Agente de Vendas somados). Comparado com o evento 'agente_vendas_tempo_resposta'
// (registrado dentro do webhookController, só pela chamada ao n8n), a diferença
// entre os dois isola quanto tempo é gasto fora do n8n (Supabase, state machine
// etc.) — sem isso só sabíamos o tempo total até o timeout, sem saber onde ele ia.
function medirDuracaoWebhook(req, res, next) {
  const inicio = Date.now();
  res.on('finish', () => {
    analyticsService.registrarEvento('webhook_tempo_total', {
      rota: req.path,
      status: res.statusCode,
      duracaoMs: Date.now() - inicio,
    });
  });
  next();
}

app.post('/webhook', limiteWebhook, medirDuracaoWebhook, verifyToken, webhookController.receberWebhook);

// Callback opcional do Agente de Orçamento (n8n -> JS Bot, contrato na seção 6
// do PRD) — mesmo token de webhook, só que a origem é o n8n, não a Evolution API.
app.post('/webhook/agente-orcamento', limiteWebhook, medirDuracaoWebhook, verifyToken, webhookController.receberCallbackAgenteOrcamento);

// Rotas usadas pelo dashboard (venancio-ai-ops) — origem restrita via CORS
// (DASHBOARD_ORIGIN/DASHBOARD_ORIGINS) e autenticação pela sessão real do
// operador (verifyOperador), não pelo token fixo de webhook. Ver
// AUDITORIA_INTEGRACAO.md, item 1 (fecha o ciclo operador -> WhatsApp real).
//
// Causa raiz de um CORS error real em produção (07/08/2026): esta função
// devolvia um valor FIXO em Access-Control-Allow-Origin (o antigo
// env.DASHBOARD_ORIGIN, string única). O Vite do dashboard troca de porta
// sozinho (3000 -> 3001, 3002...) sempre que a porta padrão já está ocupada
// — assim que isso acontece, o Origin real da requisição para de bater com
// o valor fixo, e o navegador bloqueia a resposta por CORS mesmo com o
// preflight OPTIONS respondendo 204 normalmente (o mismatch é no valor do
// header, não na existência dele). A correção é o padrão allowlist +
// reflect: comparar o Origin recebido contra DASHBOARD_ORIGINS e devolver
// esse MESMO valor de volta só quando ele bate — nunca um valor estático,
// nunca "*" (não funciona com Authorization). `Vary: Origin` avisa caches
// intermediários que a resposta depende do Origin da requisição.
function corsDashboard(req, res, next) {
  const origem = req.get('origin');
  if (origem && env.DASHBOARD_ORIGINS.includes(origem)) {
    res.set('Access-Control-Allow-Origin', origem);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
}

app.options('/operador/mensagens/enviar', corsDashboard);
app.post('/operador/mensagens/enviar', corsDashboard, verifyOperador, operadorController.enviarMensagem);

app.options('/operador/consultas/:id/notificar', corsDashboard);
app.post('/operador/consultas/:id/notificar', corsDashboard, verifyOperador, operadorController.notificarRespostaConsulta);

app.options('/operador/orcamentos/enviar-pdf', corsDashboard);
app.post('/operador/orcamentos/enviar-pdf', corsDashboard, verifyOperador, operadorController.enviarArquivoOrcamento);

// Login do Separador (código + PIN) — SEM verifyOperador: quem chama ainda
// não tem sessão nenhuma, é o próprio login. Rate limit dedicado
// (limiteLoginSeparador) por ser um endpoint especificamente exposto a
// força bruta de PIN. Ver separadorAuthController.js.
app.options('/operador/separador/login', corsDashboard);
app.post('/operador/separador/login', corsDashboard, limiteLoginSeparador, separadorAuthController.login);

// Reset de PIN — exige sessão de operador ADMIN (verifyOperador +
// checagem de papel dentro do controller). Nunca self-service.
app.options('/operador/separador/:funcionarioId/reset-pin', corsDashboard);
app.post('/operador/separador/:funcionarioId/reset-pin', corsDashboard, verifyOperador, separadorAuthController.resetPin);

// Login do Operador por código+PIN (01/09/2026) — segunda forma de entrar
// no dashboard, ao lado do e-mail/senha. Mesmas regras do bloco acima:
// sem verifyOperador (é o próprio login), rate limit dedicado. Ver
// operadorAuthController.js.
app.options('/operador/login-codigo', corsDashboard);
app.post('/operador/login-codigo', corsDashboard, limiteLoginOperador, operadorAuthController.loginComCodigo);

// Cadastro de operador novo com código+PIN e reset de PIN — exige sessão
// de operador ADMIN (verifyOperador + checagem de papel dentro do
// controller). Nunca self-service.
app.options('/operador/criar-com-codigo', corsDashboard);
app.post('/operador/criar-com-codigo', corsDashboard, verifyOperador, operadorAuthController.criarComCodigo);

app.options('/operador/:operadorId/reset-pin', corsDashboard);
app.post('/operador/:operadorId/reset-pin', corsDashboard, verifyOperador, operadorAuthController.resetarPin);

// Rotas do painel admin (admin-panel/, dono-only) — origem restrita via CORS
// PRÓPRIO (corsAdmin, ADMIN_PANEL_ORIGINS: allowlist separada da do
// dashboard) e autenticação por verifyAdmin (sessão de operador com
// papel='admin', não qualquer operador). Mesmo padrão allowlist + reflect de
// corsDashboard (ver comentário acima), só que liberando também GET/PUT
// (o dashboard só usa POST).
function corsAdmin(req, res, next) {
  const origem = req.get('origin');
  if (origem && env.ADMIN_PANEL_ORIGINS.includes(origem)) {
    res.set('Access-Control-Allow-Origin', origem);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
}

app.options('/admin/config', corsAdmin);
app.get('/admin/config', corsAdmin, verifyAdmin, adminConfigController.listar);
app.options('/admin/config/:chave', corsAdmin);
app.put('/admin/config/:chave', corsAdmin, verifyAdmin, limiteAdmin, adminConfigController.atualizar);

app.options('/admin/logs', corsAdmin);
app.get('/admin/logs', corsAdmin, verifyAdmin, adminLogsController.listarArquivos);
app.options('/admin/logs/:data', corsAdmin);
app.get('/admin/logs/:data', corsAdmin, verifyAdmin, adminLogsController.lerArquivo);
// Sem OPTIONS/preflight de propósito: EventSource não faz preflight (não
// manda Authorization como header customizado — usa ?token=, ver
// verifyAdmin.js), então não há requisição OPTIONS real pra responder aqui.
app.get('/admin/logs/stream', corsAdmin, verifyAdmin, adminLogsController.streamLogs);

app.listen(env.PORT, () => {
  logger.info(`Papelaria bot escutando na porta ${env.PORT}`);
});

module.exports = app;
