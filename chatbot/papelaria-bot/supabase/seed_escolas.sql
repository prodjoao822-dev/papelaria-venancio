-- =============================================================================
-- SEED — catálogo de escolas do fluxo de lista escolar
-- Aplicar depois de squemanovo.sql. Idempotente: pode ser reaplicado sem dano.
-- =============================================================================
--
-- Espelha src/config/escolas.json, gerado por scripts/importarListasEscolares.js
-- a partir da pasta de listas do ano. Se as duas fontes divergirem, o bot em
-- produção usa ESTA tabela (escolasService.listarEscolasAtivas()); o JSON só
-- vale como fallback offline (npm run chat, sem Supabase).
--
-- O `nome` é a chave real de ligação com os PDFs: materiaisEscolares.js
-- normaliza esse texto pra slug ("Múltipla" -> "multipla") e procura em
-- materiais.json. Renomear uma escola aqui sem regerar o mapeamento faz o bot
-- parar de encontrar o PDF e cair no fallback de notificar a Vanessa — não
-- quebra o fluxo, mas o cliente deixa de receber o arquivo automaticamente.
--
-- Nem toda escola desta lista tem lista de material cadastrada. Isso é
-- esperado: elas aparecem no menu (o cliente precisa poder escolhê-las) e o
-- atendimento segue pelo caminho manual.

-- A tabela original não tem unicidade em `nome`, então um segundo `insert`
-- criaria a escola de novo e ela apareceria duas vezes no menu do WhatsApp.
-- O índice único abaixo é o que torna este seed reaplicável — e evita escola
-- duplicada por cadastro manual pelo dashboard.
create unique index if not exists escolas_nome_unico on escolas (nome);

insert into escolas (nome)
values
  ('Alternativo'),
  ('Americano'),
  ('Ápice'),
  ('Arca Educa'),
  ('Balão Mágico'),
  ('CEC'),
  ('Colégio Adventista Laranjeiras'),
  ('Colorart'),
  ('Dinâmico'),
  ('EBC'),
  ('Henrique Valentim'),
  ('Idade Kids'),
  ('Integra'),
  ('Linus Pauling'),
  ('Múltipla'),
  ('Mundo Livre'),
  ('Oceanus'),
  ('Pernalonga'),
  ('Play Kids'),
  ('Renascer'),
  ('Renovação'),
  ('Salesiano JC'),
  ('SESI'),
  ('Siena'),
  ('Universo do Saber')
on conflict (nome) do nothing;
