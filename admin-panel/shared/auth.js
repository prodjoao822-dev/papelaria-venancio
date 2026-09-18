// Bootstrap do cliente Supabase (via CDN, sem build step) + guarda de
// sessão. O gate de verdade é o middleware verifyAdmin no bot — o que tem
// aqui é só UX (evita mostrar a tela de config/logs por um instante antes
// de redirecionar quem não está logado, ou quem está logado mas não é
// admin, o que só é confirmado de fato no primeiro fetch à API).

const supabaseClient = window.supabase.createClient(
  window.ADMIN_PANEL_CONFIG.SUPABASE_URL,
  window.ADMIN_PANEL_CONFIG.SUPABASE_ANON_KEY
);

async function login(email, senha) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (error) throw error;
  return data.session;
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}

async function obterSessao() {
  const { data } = await supabaseClient.auth.getSession();
  return data.session ?? null;
}

async function obterToken() {
  const sessao = await obterSessao();
  return sessao ? sessao.access_token : null;
}

// Chamar no topo de toda página protegida (config.html/logs.html), antes de
// renderizar qualquer coisa.
async function exigirSessao() {
  const sessao = await obterSessao();
  if (!sessao) {
    window.location.href = 'index.html';
    return null;
  }
  return sessao;
}

window.adminAuth = {
  login, logout, obterSessao, obterToken, exigirSessao, supabaseClient,
};
