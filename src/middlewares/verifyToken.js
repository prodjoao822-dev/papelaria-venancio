// Middleware que valida o token secreto do webhook (WEBHOOK_SECRET_TOKEN) nas
// requisições recebidas. Aceita o token tanto no header `x-webhook-token`
// quanto na query string (?token=...), já que depende de como a instância da
// Evolution API for configurada para chamar esta URL.

const env = require('../config/env');
const logger = require('../utils/logger');

function verifyToken(req, res, next) {
  const tokenRecebido = req.get('x-webhook-token') || req.query.token;

  if (tokenRecebido !== env.WEBHOOK_SECRET_TOKEN) {
    logger.aviso('Requisição de webhook rejeitada: token ausente ou inválido.');
    return res.status(401).json({ erro: 'Token inválido.' });
  }

  return next();
}

module.exports = verifyToken;
