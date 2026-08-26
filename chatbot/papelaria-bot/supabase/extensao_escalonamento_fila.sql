-- PROMPT-01-DIMENSIONAMENTO-CARGA.md, Entrega 3: escalonamento automático de fila.
--
-- Semeia em `configuracoes` as chaves lidas por src/services/escalonamentoService.js
-- (lerConfigs). Sem essas linhas o serviço já funciona com os defaults hardcoded no
-- próprio arquivo (CONFIG_DEFAULTS) — este insert só torna os valores editáveis via
-- banco/dashboard, sem exigir deploy do bot pra ajustar threshold/mensagem.
--
-- Idempotente (ON CONFLICT DO NOTHING) — já foi aplicado em produção via MCP em
-- 21/08. Mantido aqui só para versionamento, mesmo padrão dos outros extensao_*.sql
-- deste projeto (não são migrations formais do Supabase CLI).

insert into configuracoes (empresa_id, chave, valor)
select id, 'escalonamento_threshold', '10'::jsonb
from empresa
on conflict (empresa_id, chave) do nothing;

insert into configuracoes (empresa_id, chave, valor)
select id, 'escalonamento_mensagem',
  '"Nossa equipe está com alta demanda. Você é o Nº {posicao} na fila, tempo estimado de {minutos} minutos. Agradecemos a paciência! 🙏"'::jsonb
from empresa
on conflict (empresa_id, chave) do nothing;

insert into configuracoes (empresa_id, chave, valor)
select id, 'escalonamento_tempo_estimado_por_posicao', '5'::jsonb
from empresa
on conflict (empresa_id, chave) do nothing;
