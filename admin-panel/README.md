# Painel Admin do JS Bot

Painel HTML/CSS/JS puro (sem build step), **só para o dono** da Papelaria
Venâncio — nem os operadores do painel `venancio-ai-ops` têm acesso. Serve
pra:

1. Ver os logs do bot no navegador em vez de depender do terminal.
2. Editar valores de configuração do bot (timeouts, telefones de
   notificação, liga/desliga do Agente de Vendas) sem editar `.env` nem
   reiniciar o processo.

**Não é** um editor de rotas/código — só edita valores já conhecidos, numa
allowlist fixa do lado do bot (`chatbot/papelaria-bot/src/config/configResolver.js`).
Credenciais/segredos nunca passam por aqui.

## Como rodar

1. Copie `shared/config.example.js` para `shared/config.js` (gitignored) e
   preencha:
   - `SUPABASE_URL` / `SUPABASE_ANON_KEY`: os mesmos valores de
     `venancio-ai-ops/.env` (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`).
     A anon key é pública por design, não precisa de cuidado extra.
   - `BOT_API_URL`: onde o bot está rodando (confira `PORT` em
     `chatbot/papelaria-bot/.env`).
2. O bot precisa ter `ADMIN_PANEL_ORIGINS` no `.env` incluindo a origem de
   onde você vai servir este painel (ex.: `http://localhost:5500`).
3. Sirva esta pasta como arquivo estático — **não** peça pro bot servir,
   de propósito (mantém o painel fora do que um dia pode ser exposto
   publicamente quando o bot for pro Oracle Cloud):
   ```
   npx serve admin-panel -l 5500
   ```
4. Abra `http://localhost:5500`, entre com a mesma conta que você já usa no
   painel de operadores (`venancio-ai-ops`) — precisa ter `papel = 'admin'`
   na tabela `operadores`.

## Exposição

Pensado pra rodar só localmente, na sua própria máquina, por enquanto — o
bot também só roda localmente hoje. Se um dia o bot for pro Oracle Cloud
(ver `PLANEJAMENTOS E IMPLEMENTAÇÕES/PLANO_DEPLOY_DOCKER_ORACLE.md`), este
painel **não** deve ser copiado pra lá nem exposto via Caddy — continua uso
local, via túnel SSH se precisar acessar remoto.
