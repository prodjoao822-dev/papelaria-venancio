# ⚠️ Este schema não é mais usado

Os arquivos em `migrations/` e `seeds/` deste diretório eram do projeto Supabase
**separado** que o dashboard usava antes (já apagado). Desde a unificação do
CRM com o banco real do bot, a fonte de verdade do schema passou a ser:

1. `chatbot/papelaria-bot/supabase/schema.sql`
2. `chatbot/papelaria-bot/supabase/squemanovo.sql`
3. `chatbot/papelaria-bot/supabase/extensao_cadastro_fiscal.sql`
4. `chatbot/papelaria-bot/supabase/extensao_dashboard.sql`

Rode esses 4 arquivos nessa ordem no projeto Supabase do bot
(`esvduqgqiypcpgxhunsd` — ver `chatbot/papelaria-bot/.env`, `SUPABASE_URL`).

Os arquivos desta pasta (`migrations/000-008`, `seeds/*`) ficam só como
referência histórica até a migração estar validada em produção — depois disso
podem ser removidos.
