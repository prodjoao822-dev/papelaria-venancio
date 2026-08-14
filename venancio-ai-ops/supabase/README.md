# ⚠️ Este schema não é mais usado

Os arquivos em `migrations/` e `seeds/` deste diretório eram do projeto Supabase
**separado** que o dashboard usava antes (já apagado). Desde a unificação do
CRM com o banco real do bot, a fonte de verdade do schema passou a ser:

1. `chatbot/papelaria-bot/supabase/schema.sql`
2. `chatbot/papelaria-bot/supabase/squemanovo.sql`
3. `chatbot/papelaria-bot/supabase/extensao_cadastro_fiscal.sql`
4. `chatbot/papelaria-bot/supabase/extensao_dashboard.sql`
5. `chatbot/papelaria-bot/supabase/extensao_notificacoes_e_retomada.sql`
6. `chatbot/papelaria-bot/supabase/extensao_rls_status_historico.sql`

Rode esses 6 arquivos nessa ordem no projeto Supabase do bot
(`esvduqgqiypcpgxhunsd` — ver `chatbot/papelaria-bot/.env`, `SUPABASE_URL`).

Os arquivos desta pasta (`migrations/000-008`, `seeds/*`) ficam só como
referência histórica até a migração estar validada em produção — depois disso
podem ser removidos. **Atenção**: `migrations/002_dev_anon_policy.sql` (e as
migrations seguintes, que repetem o padrão) abrem policy `anon` totalmente
aberta em `clientes`/`pedidos`/etc — nunca aplique estes arquivos num projeto
Supabase real sem revisar isso primeiro (ver AUDITORIA_INTEGRACAO.md, item 7).
