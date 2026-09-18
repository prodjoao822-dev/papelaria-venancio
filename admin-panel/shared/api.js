// Wrappers finos sobre fetch pro /admin/* do bot, sempre com o Bearer JWT
// da sessão Supabase atual. 401/403 tratados aqui mesmo pra não repetir a
// lógica em cada página.

async function chamarApi(caminho, opcoes = {}) {
  const token = await window.adminAuth.obterToken();
  if (!token) {
    window.location.href = 'index.html';
    throw new Error('Sessão ausente.');
  }

  const resposta = await fetch(`${window.ADMIN_PANEL_CONFIG.BOT_API_URL}${caminho}`, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opcoes.headers || {}),
    },
  });

  if (resposta.status === 401) {
    window.location.href = 'index.html';
    throw new Error('Sessão inválida ou expirada.');
  }
  if (resposta.status === 403) {
    // Sessão Supabase válida, mas o operador não é admin — só o bot sabe
    // dizer isso de verdade (checagem client-side seria só decoração).
    document.body.innerHTML = '<div class="acesso-negado">Acesso restrito ao administrador.<br><br><a href="index.html">Voltar ao login</a></div>';
    throw new Error('Acesso negado (403).');
  }

  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error((corpo && corpo.erro) || `Erro ${resposta.status} ao chamar ${caminho}`);
  }
  return corpo;
}

window.adminApi = {
  listarConfig: () => chamarApi('/admin/config'),
  atualizarConfig: (chave, valor) => chamarApi(`/admin/config/${encodeURIComponent(chave)}`, {
    method: 'PUT',
    body: JSON.stringify({ valor }),
  }),
  listarLogs: () => chamarApi('/admin/logs'),
  lerLog: (data, ate) => chamarApi(`/admin/logs/${data}${ate != null ? `?ate=${ate}` : ''}`),
  // EventSource nativo não manda header Authorization — o token vai como
  // query param nesse endpoint específico (o bot aceita esse fallback só
  // aqui, ver src/middlewares/verifyAdmin.js). O stream só existe pro dia
  // de hoje (o bot decide isso sozinho, não recebe `data` aqui).
  async streamUrl(offset) {
    const token = await window.adminAuth.obterToken();
    const url = new URL(`${window.ADMIN_PANEL_CONFIG.BOT_API_URL}/admin/logs/stream`);
    if (offset != null) url.searchParams.set('offset', String(offset));
    url.searchParams.set('token', token);
    return url.toString();
  },
};
