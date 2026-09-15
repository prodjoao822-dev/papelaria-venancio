// Health check de infraestrutura (TRB-2026-0025, 15/09/2026): antes desta
// rota, o docker-compose/Caddy só percebiam o bot travado (event loop
// bloqueado, deadlock) se o PROCESSO morresse — continuar respondendo TCP
// sem processar nada passava despercebido. Propositalmente SEM checar
// dependência externa nenhuma (Supabase, Evolution API etc.): é só a
// confirmação mais barata possível de que o processo Node ainda está de pé e
// atendendo requisições HTTP normalmente.
function verificarSaude(req, res) {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}

module.exports = { verificarSaude };
