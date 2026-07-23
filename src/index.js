// Ponto de entrada da aplicação: inicializa o servidor Express e registra as rotas/middlewares.

const express = require('express');
const env = require('./config/env'); // valida as variáveis de ambiente já na subida (falha rápido)
const verifyToken = require('./middlewares/verifyToken');
const webhookController = require('./webhook/webhookController');
const logger = require('./utils/logger');

const app = express();
// O limite padrão do Express (100kb) é pequeno demais pra alguns eventos da
// Evolution API — mensagens com mídia (imagem, áudio, etc.) chegam com o
// arquivo em base64 dentro do próprio payload do webhook e passam disso fácil.
app.use(express.json({ limit: '25mb' }));

app.get('/', (req, res) => {
  res.json({ status: 'ok', servico: 'papelaria-bot' });
});

app.post('/webhook', verifyToken, webhookController.receberWebhook);

// Callback opcional do Agente de Orçamento (n8n -> JS Bot, contrato na seção 6
// do PRD) — mesmo token de webhook, só que a origem é o n8n, não a Evolution API.
app.post('/webhook/agente-orcamento', verifyToken, webhookController.receberCallbackAgenteOrcamento);

app.listen(env.PORT, () => {
  logger.info(`Papelaria bot escutando na porta ${env.PORT}`);
});

module.exports = app;
