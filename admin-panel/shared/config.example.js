// Copie este arquivo para shared/config.js (gitignored, nunca vai pro git)
// e preencha com os valores reais antes de abrir o painel.
//
// SUPABASE_URL e SUPABASE_ANON_KEY são os MESMOS já usados em
// venancio-ai-ops/.env (lá como VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
// — a anon key é pública por design (é a mesma que já roda no navegador do
// painel de operadores), não é a service role key, não precisa de cuidado
// extra de segredo.
//
// BOT_API_URL é onde o JS Bot está rodando (por padrão, localhost:3000 em
// desenvolvimento — troque a porta se o seu .env do bot usar outra em PORT).
window.ADMIN_PANEL_CONFIG = {
  SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
  SUPABASE_ANON_KEY: 'SUA_ANON_KEY_AQUI',
  BOT_API_URL: 'http://localhost:3000',
};
