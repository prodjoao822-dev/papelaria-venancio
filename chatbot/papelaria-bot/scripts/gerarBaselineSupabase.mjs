// =====================================================================
// Gerador do baseline do schema `public` — SOMENTE LEITURA no banco.
// =====================================================================
// Criado em 26/08/2026 (tarefa T1.4) para fechar o Bloqueador B6: o
// repositório não era fonte de verdade do banco. Produz
// `supabase/baseline_producao_<data>.sql` por introspecção de pg_catalog.
// NÃO executa DDL, NÃO escreve nada em produção — só SELECTs.
//
// Por que não é um `pg_dump`: não havia binário do Postgres disponível no
// ambiente onde isto foi escrito. Limitações conhecidas em relação ao
// pg_dump estão documentadas no fim de `supabase/README.md`.
//
// Uso:
//   DATABASE_URL=<conn string do Postgres>  \
//   node scripts/gerarBaselineSupabase.mjs ./supabase/baseline_producao_DD-MM-AAAA.sql
//
// Dependência: `pg`. O bot NÃO a tem no package.json de propósito — ele não
// precisa de conexão Postgres direta em runtime (fala com o Supabase pelo
// PostgREST). Antes de rodar este script, instale sem gravar no manifesto:
//   cd chatbot/papelaria-bot && npm i --no-save pg
// (não adianta rodar de outro diretório: em ESM o `import` resolve a partir
// do caminho DESTE arquivo, não do cwd.)
// =====================================================================
import pg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const out = process.argv[2];
if (!out) {
  console.error('uso: node gerarBaselineSupabase.mjs <arquivo-de-saida.sql>');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('faltou DATABASE_URL no ambiente (ou num .env do diretório atual)');
  process.exit(1);
}
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 300000 });
await c.connect();
const q = async (sql, p) => (await c.query(sql, p)).rows;
const L = [];
const w = (s = '') => L.push(s);
const sec = (t) => { w(); w('-- ' + '='.repeat(69)); w('-- ' + t); w('-- ' + '='.repeat(69)); w(); };

// objetos que pertencem a extensões (vector, pgcrypto, pg_trgm, unaccent...)
const EXT_FILTER = `not exists (select 1 from pg_depend d where d.objid = %OID% and d.deptype = 'e')`;

w('-- =====================================================================');
w('-- VENÂNCIO — BASELINE do schema `public` (gerado do banco de produção)');
w('-- =====================================================================');
w(`-- Gerado automaticamente em ${new Date().toISOString()} a partir do`);
w('-- catálogo do Postgres de produção (pg_catalog / information_schema).');
w('-- Leia o cabeçalho de supabase/README.md antes de usar.');
w('--');
w('-- POR QUE ESTE ARQUIVO EXISTE (Bloqueador B6, 15/08/2026, reconfirmado');
w('-- na auditoria de 25/08): o repositório NÃO era fonte de verdade do');
w('-- banco. O controle de migração do Supabase só começa em 20/08/2026');
w('-- (11 migrações) e os arquivos `extensao_*.sql` cobrem só parte do que');
w('-- existe em produção — 137 policies no banco contra ~34 versionadas.');
w('-- Este baseline captura o estado REAL em 26/08/2026 para que dê para');
w('-- recriar a produção do zero a partir do repositório.');
w('--');
w('-- ESCOPO: só o schema `public`. NÃO inclui: schemas `auth`/`storage`/');
w('-- `realtime`/`vault` (gerenciados pelo Supabase), dados (ver seed_*.sql),');
w('-- roles, nem objetos de extensão (criados pelo CREATE EXTENSION).');
w('-- =====================================================================');
w();
w('set check_function_bodies = off;');

// ---- extensões
sec('1. EXTENSÕES');
for (const r of await q(`select e.extname, n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname <> 'plpgsql' order by 1`)) {
  w(`create extension if not exists "${r.extname}" with schema ${r.nspname};`);
}

// ---- enums
sec('2. TIPOS (ENUMS)');
for (const r of await q(`
  select t.typname, array_agg(quote_literal(e.enumlabel) order by e.enumsortorder) as labels
  from pg_type t join pg_namespace n on n.oid=t.typnamespace
  join pg_enum e on e.enumtypid=t.oid
  where n.nspname='public' and ${EXT_FILTER.replace('%OID%','t.oid')}
  group by t.typname order by t.typname`)) {
  w(`do $$ begin`);
  w(`  create type ${r.typname} as enum (${r.labels.join(', ')});`);
  w(`exception when duplicate_object then null; end $$;`);
}

// ---- tabelas
sec('3. TABELAS (colunas, defaults, NOT NULL, identidade)');
const tables = await q(`
  select c.oid, c.relname, obj_description(c.oid,'pg_class') as comment
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and ${EXT_FILTER.replace('%OID%','c.oid')}
  order by c.relname`);
for (const t of tables) {
  const cols = await q(`
    select a.attname, format_type(a.atttypid, a.atttypmod) as typ, a.attnotnull,
           pg_get_expr(d.adbin, d.adrelid) as def, a.attidentity, a.attgenerated,
           col_description(a.attrelid, a.attnum) as comment
    from pg_attribute a
    left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=$1 and a.attnum>0 and not a.attisdropped
    order by a.attnum`, [t.oid]);
  w(`create table if not exists ${t.relname} (`);
  const parts = cols.map(col => {
    let s = `  ${col.attname} ${col.typ}`;
    if (col.attidentity === 'a') s += ' generated always as identity';
    else if (col.attidentity === 'd') s += ' generated by default as identity';
    else if (col.attgenerated === 's') s += ` generated always as (${col.def}) stored`;
    else if (col.def !== null) s += ` default ${col.def}`;
    if (col.attnotnull) s += ' not null';
    return s;
  });
  w(parts.join(',\n'));
  w(');');
  // ALTER ADD COLUMN IF NOT EXISTS para bancos que já existem (idempotência real)
  for (const col of cols) {
    if (col.attidentity || col.attgenerated === 's') continue;
    let s = `alter table ${t.relname} add column if not exists ${col.attname} ${col.typ}`;
    if (col.def !== null) s += ` default ${col.def}`;
    w(s + ';');
  }
  if (t.comment) w(`comment on table ${t.relname} is ${lit(t.comment)};`);
  for (const col of cols) if (col.comment) w(`comment on column ${t.relname}.${col.attname} is ${lit(col.comment)};`);
  w();
}

// ---- constraints
sec('4. CONSTRAINTS (PK, UNIQUE, FK, CHECK)');
for (const ord of ['p', 'u', 'c', 'f']) {
  for (const r of await q(`
    select rel.relname, con.conname, pg_get_constraintdef(con.oid) as def
    from pg_constraint con
    join pg_class rel on rel.oid=con.conrelid
    join pg_namespace n on n.oid=rel.relnamespace
    where n.nspname='public' and con.contype=$1 and ${EXT_FILTER.replace('%OID%','rel.oid')}
    order by rel.relname, con.conname`, [ord])) {
    w(`do $$ begin`);
    w(`  alter table ${r.relname} add constraint ${r.conname} ${r.def};`);
    w(`exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;`);
  }
}

// ---- índices
sec('5. ÍNDICES (os que não vêm de constraint)');
for (const r of await q(`
  select i.indexdef
  from pg_indexes i
  join pg_class ic on ic.relname=i.indexname
  join pg_namespace inn on inn.oid=ic.relnamespace and inn.nspname=i.schemaname
  where i.schemaname='public'
    and not exists (select 1 from pg_constraint con where con.conindid=ic.oid)
  order by i.tablename, i.indexname`)) {
  w(r.indexdef.replace(/^CREATE INDEX /, 'CREATE INDEX IF NOT EXISTS ').replace(/^CREATE UNIQUE INDEX /, 'CREATE UNIQUE INDEX IF NOT EXISTS ') + ';');
}

// ---- funções
sec('6. FUNÇÕES E PROCEDURES');
for (const r of await q(`
  select pg_get_functiondef(p.oid) as def, p.proname
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and ${EXT_FILTER.replace('%OID%','p.oid')}
  order by p.proname, p.oid`)) {
  w(r.def.trimEnd() + ';');
  w();
}

// ---- views
sec('7. VIEWS');
for (const r of await q(`
  select c.relname, pg_get_viewdef(c.oid, true) as def,
         array(select unnest(c.reloptions)) as opts
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='v' and ${EXT_FILTER.replace('%OID%','c.oid')}
  order by c.relname`)) {
  const opts = (r.opts || []).length ? ` with (${r.opts.join(', ')})` : '';
  w(`create or replace view ${r.relname}${opts} as\n${r.def.trimEnd()}`);
  w();
}

// ---- triggers
sec('8. TRIGGERS');
for (const r of await q(`
  select tg.tgname, cl.relname, pg_get_triggerdef(tg.oid) as def
  from pg_trigger tg
  join pg_class cl on cl.oid=tg.tgrelid
  join pg_namespace n on n.oid=cl.relnamespace
  where n.nspname='public' and not tg.tgisinternal
  order by cl.relname, tg.tgname`)) {
  w(`drop trigger if exists ${r.tgname} on ${r.relname};`);
  w(r.def + ';');
}

// ---- RLS
sec('9. ROW LEVEL SECURITY — enable + policies (NÃO PULE ESTA SEÇÃO)');
w('-- Sem esta seção o banco fica com as tabelas ABERTAS. Foi exatamente o');
w('-- risco do Bloqueador B6: schema versionado sem as policies reais.');
w();
for (const t of await q(`
  select c.relname, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and ${EXT_FILTER.replace('%OID%','c.oid')}
  order by c.relname`)) {
  if (t.relrowsecurity) w(`alter table ${t.relname} enable row level security;`);
  else w(`-- ATENÇÃO: ${t.relname} está SEM row level security em produção.`);
  if (t.relforcerowsecurity) w(`alter table ${t.relname} force row level security;`);
}
w();
for (const p of await q(`
  select pol.polname, cl.relname,
         case pol.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' else 'all' end as cmd,
         pol.polpermissive,
         array(select rolname::text from pg_roles where oid = any(pol.polroles)) as roles,
         pg_get_expr(pol.polqual, pol.polrelid) as using_expr,
         pg_get_expr(pol.polwithcheck, pol.polrelid) as check_expr
  from pg_policy pol
  join pg_class cl on cl.oid=pol.polrelid
  join pg_namespace n on n.oid=cl.relnamespace
  where n.nspname='public'
  order by cl.relname, pol.polname`)) {
  const roles = p.roles.length ? p.roles.join(', ') : 'public';
  w(`drop policy if exists ${qi(p.polname)} on ${p.relname};`);
  let s = `create policy ${qi(p.polname)} on ${p.relname}`;
  s += p.polpermissive ? ' as permissive' : ' as restrictive';
  s += `\n  for ${p.cmd} to ${roles}`;
  if (p.using_expr) s += `\n  using (${p.using_expr})`;
  if (p.check_expr) s += `\n  with check (${p.check_expr})`;
  w(s + ';');
}

// ---- grants
sec('10. GRANTS / REVOKES (privilégio por role) — TÃO IMPORTANTE QUANTO A RLS');
w('-- A RLS filtra LINHA; o GRANT decide se o role pode sequer tocar no');
w('-- objeto. Foi um GRANT sobrando (EXECUTE para `anon` em');
w('-- `atualizar_status_pedido`) o problema P1 da auditoria de 25/08/2026.');
w('-- Reconstruído aqui a partir de relacl/attacl/proacl reais de produção.');
w();

const ROLES_APP = ['anon', 'authenticated', 'service_role'];

w('-- 10.1 Tabelas e views');
for (const r of await q(`
  select c.relname, c.relkind, array(select unnest(c.relacl)::text) as acl
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','v') and c.relacl is not null
    and ${EXT_FILTER.replace('%OID%','c.oid')}
  order by c.relname`)) {
  const byRole = parseAcl(r.acl);
  // zera o que os roles de aplicação têm e reconstrói exatamente
  w(`revoke all on ${r.relname} from ${ROLES_APP.join(', ')};`);
  for (const role of ROLES_APP) {
    const privs = byRole.get(role);
    if (privs && privs.length) w(`grant ${privs.join(', ')} on ${r.relname} to ${role};`);
  }
  for (const [role, privs] of byRole) {
    if (ROLES_APP.includes(role)) continue;
    w(`-- (fora dos roles de app) ${role}: ${privs.join(', ')}`);
  }
}

w();
w('-- 10.2 GRANTs de coluna — impedem UPDATE direto em colunas de status');
w('--      (migração fix_pedidos_rls_update_e_restringe_colunas_status, 25/08).');
w('--      Só a RPC *_dashboard pode mexer em `status`, preservando o histórico.');
for (const r of await q(`
  select cl.relname, a.attname, array(select unnest(a.attacl)::text) as acl
  from pg_attribute a
  join pg_class cl on cl.oid=a.attrelid
  join pg_namespace n on n.oid=cl.relnamespace
  where n.nspname='public' and a.attacl is not null
  order by cl.relname, a.attname`)) {
  const byRole = parseAcl(r.acl);
  for (const [role, privs] of byRole) {
    for (const p of privs) w(`grant ${p} (${r.attname}) on ${r.relname} to ${role};`);
  }
}

w();
w('-- 10.3 EXECUTE de função. Padrão do Postgres é EXECUTE para PUBLIC quando');
w('--      proacl é nulo — por isso cada função aparece aqui com um REVOKE');
w('--      explícito antes do GRANT, e não só com o GRANT.');
for (const r of await q(`
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn,
         p.prosecdef,
         (p.proacl is null) as acl_default,
         array(select unnest(p.proacl)::text) as acl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and ${EXT_FILTER.replace('%OID%','p.oid')}
  order by p.proname, p.oid`)) {
  const tag = r.prosecdef ? ' -- SECURITY DEFINER' : '';
  if (r.acl_default) {
    w(`-- ${r.fn}: proacl nulo => EXECUTE para PUBLIC (padrão do Postgres).${tag}`);
    continue;
  }
  const byRole = parseAcl(r.acl);
  w(`revoke execute on function ${r.fn} from public, ${ROLES_APP.join(', ')};${tag}`);
  for (const role of [...ROLES_APP, 'public']) {
    const privs = byRole.get(role);
    if (privs && privs.includes('EXECUTE')) w(`grant execute on function ${r.fn} to ${role};`);
  }
}

// ---- realtime
sec('11. PUBLICAÇÕES (realtime)');
for (const r of await q(`
  select pubname, schemaname, tablename from pg_publication_tables
  where schemaname='public' order by pubname, tablename`)) {
  w(`do $$ begin`);
  w(`  alter publication ${r.pubname} add table ${r.tablename};`);
  w(`exception when duplicate_object then null; end $$;`);
}

w();
w('-- FIM DO BASELINE.');

fs.writeFileSync(out, L.join('\n') + '\n', 'utf8');
console.log('escrito:', out, L.length, 'linhas');
await c.end();

// aclitem -> Map(role -> ['SELECT', 'INSERT', ...])
// formato: role=privs/grantor ; role vazio = PUBLIC ; '*' = with grant option
function parseAcl(items) {
  const ACL_LETTERS = { r: 'SELECT', w: 'UPDATE', a: 'INSERT', d: 'DELETE', D: 'TRUNCATE', x: 'REFERENCES', t: 'TRIGGER', X: 'EXECUTE', U: 'USAGE', C: 'CREATE', c: 'CONNECT', T: 'TEMPORARY', m: 'MAINTAIN' };
  const m = new Map();
  for (const raw of items || []) {
    const eq = raw.indexOf('=');
    const slash = raw.lastIndexOf('/');
    if (eq < 0 || slash < 0) continue;
    let role = raw.slice(0, eq).replace(/^"|"$/g, '');
    if (role === '') role = 'public';
    const privStr = raw.slice(eq + 1, slash);
    const privs = [];
    for (let i = 0; i < privStr.length; i++) {
      const ch = privStr[i];
      if (ch === '*') continue;
      if (ACL_LETTERS[ch]) privs.push(ACL_LETTERS[ch]);
    }
    m.set(role, privs);
  }
  return m;
}

function lit(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
function qi(s) { return '"' + String(s).replace(/"/g, '""') + '"'; }
