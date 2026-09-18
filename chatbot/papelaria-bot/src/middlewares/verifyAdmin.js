// Middleware que autentica o DONO do painel admin (admin-panel/) via token de
// sessão do Supabase Auth (Bearer JWT), igual verifyOperador.js — mas exige
// além disso que o operador tenha papel 'admin', porque as rotas /admin/*
// mexem em comportamento do bot (timeouts, telefones, liga/desliga de
// recursos) e leem log bruto, não em ações do dia a dia do dashboard.
//
// Aceita o token também via `?token=` além do header Authorization: o
// EventSource nativo do navegador (usado por /admin/logs/stream) não
// consegue mandar header customizado, então o SSE precisa desse fallback —
// mesma ideia de verifyToken.js (header OU querystring), aplicada a um JWT.

const supabase = require('../services/supabaseClient');
const logger = require('../utils/logger');

async function verifyAdmin(req, res, next) {
  try {
    const cabecalho = req.get('authorization') || '';
    const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : (req.query.token || null);

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
    if (operador.papel !== 'admin') {
      return res.status(403).json({ ok: false, erro: 'Acesso restrito ao administrador.' });
    }

    req.operador = operador;
    return next();
  } catch (erroInesperado) {
    logger.erro('Falha inesperada ao verificar admin', erroInesperado);
    return res.status(500).json({ ok: false, erro: 'Falha ao verificar sessão.' });
  }
}

module.exports = verifyAdmin;
