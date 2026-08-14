// Middleware que autentica o operador do dashboard via token de sessão do
// Supabase Auth (Bearer JWT emitido no login do dashboard — ver
// venancio-ai-ops/src/contexts/AuthContext.jsx). Diferente de verifyToken.js
// (token fixo compartilhado, usado pra Evolution API/n8n): aqui cada operador
// tem sua própria identidade real, necessária pra saber quem mandou a
// mensagem manual e pra impedir operador inativo de enviar.

const supabase = require('../services/supabaseClient');
const logger = require('../utils/logger');

async function verifyOperador(req, res, next) {
  try {
    const cabecalho = req.get('authorization') || '';
    const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : null;

    if (!token) {
      return res.status(401).json({ ok: false, erro: 'Token de sessão ausente.' });
    }

    const { data, error: erroToken } = await supabase.auth.getUser(token);
    if (erroToken || !data?.user) {
      return res.status(401).json({ ok: false, erro: 'Sessão inválida ou expirada.' });
    }

    const { data: operador, error: erroOperador } = await supabase
      .from('operadores')
      .select('id, nome, ativo, papel')
      .eq('id', data.user.id)
      .maybeSingle();

    if (erroOperador) {
      logger.erro(`Falha ao buscar operador ${data.user.id}`, erroOperador);
      return res.status(500).json({ ok: false, erro: 'Falha ao verificar operador.' });
    }
    if (!operador || !operador.ativo) {
      return res.status(403).json({ ok: false, erro: 'Operador não encontrado ou inativo.' });
    }

    req.operador = operador;
    return next();
  } catch (erroInesperado) {
    logger.erro('Falha inesperada ao verificar operador', erroInesperado);
    return res.status(500).json({ ok: false, erro: 'Falha ao verificar sessão.' });
  }
}

module.exports = verifyOperador;
