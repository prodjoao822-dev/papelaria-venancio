# Venâncio Operations — Spec de Implementação: Cadastros, Pedido Manual e Responsáveis

> Documento de handoff para o Claude Code, gerado a partir da auditoria do repositório `venancio-ai-ops` (frontend) + `chatbot/papelaria-bot/supabase` (schema real, fonte única de verdade conforme `venancio-ai-ops/README.md`).

---

## 1. Objetivo

Fechar o ciclo funcional de: cadastro de produtos, cadastro de clientes, criação de pedido manual, e atribuição de funcionário responsável (separação e entrega) — alinhado ao design já validado no Claude Design e às decisões de arquitetura já tomadas nas conversas de requisitos.

---

## 2. O que já existe (auditado no repo — não refazer)

| Área | Status | Onde |
|---|---|---|
| CRUD de Produtos | ✅ Completo (nome, categoria, sku, preço, estoque, descrição, imagem, aliases, tags, ativo/inativo) | `CatalogPage.jsx` + `produtos.service.js` |
| Cadastro de Clientes | ✅ Leitura/CRM completo. Criação acontece via `NovoPedidoModal` (busca por telefone, cria se não existir) | `ClientesPage.jsx` + `clientes.service.js` |
| Pedido Manual | ✅ Fluxo funcional: cria orçamento `venda_geral` → aceita → vira pedido | `NovoPedidoModal.jsx` + `pedidos.service.js` |
| Forma de entrega | ✅ Já existe exatamente como especificamos: `retirada` / `entrega_propria` / `uber_flash` | coluna `pedidos.forma_entrega` |
| Endereço de entrega | ✅ Existe (campo texto único, não fragmentado) | coluna `pedidos.endereco_entrega` |
| Checklist de separação (por item) | ✅ Parcial — toggle "separado" por item já funciona | `ChecklistSeparacao` em `PedidoModal.jsx`, coluna `itens_pedido.separado` |
| Status do pedido + histórico | ✅ RPCs atômicas (`atualizar_status_pedido_dashboard`, `marcar_pronto_retirada_pedido`, `marcar_saiu_entrega_pedido`) | `pedidos.service.js` |
| Login de operador | ✅ Supabase Auth, tabela `operadores` (nome, papel admin/operador) | `AuthContext.jsx`, `operadores` |

---

## 3. Gap identificado (o que falta)

| # | Gap | Motivo |
|---|---|---|
| G1 | Não existe tabela `funcionarios` | Separação/entrega precisam de um cadastro leve (3-4 pessoas, sem login) — diferente de `operadores` (que exige Supabase Auth) |
| G2 | `pedidos` não tem responsável de separação nem de entrega | Precisa referenciar `funcionarios` |
| G3 | `itens_pedido` não tem `tipo` nem `observação` por item | Campos da Ficha de Separação (ex: "Presente - Menina") já especificados, ainda não persistidos |
| G4 | `pedidos` e `orcamentos` não têm campo de Sequência/Operação do ShopControl | Preenchido manualmente no fechamento da venda, ainda não existe coluna |
| G5 | Não existe tela/rota de Funcionários funcional (só existe no Design) | Precisa de CRUD simples |
| G6 | `NovoPedidoModal` não tem campo de Sequência nem atribuição de responsável | Por design, esses campos são preenchidos **depois** da criação (ver decisão abaixo) |

**Decisão de UX já validada:** Sequência/Operação e responsável de separação/entrega **não** entram no formulário de criação do pedido — são preenchidos depois, no detalhe do pedido (`PedidoModal`), no momento em que fazem sentido no fluxo real (fechamento no ShopControl / início da separação). Não bloquear a criação do pedido por esses dados.

---

## 4. Migração SQL

Novo arquivo, seguindo exatamente o padrão idempotente já usado em `extensao_dashboard.sql` (mesma pasta, `chatbot/papelaria-bot/supabase/`):

**Arquivo: `chatbot/papelaria-bot/supabase/extensao_funcionarios_responsaveis.sql`**

```sql
-- =====================================================================
-- VENÂNCIO — Funcionários (separação/entrega), Responsáveis e Sequência
-- =====================================================================
-- Roda depois de extensao_dashboard.sql. Idempotente.
-- =====================================================================

-- A. FUNCIONÁRIOS — cadastro leve, SEM login (distinto de `operadores`,
--    que exige conta no Supabase Auth). São as 3-4 pessoas escolhidas à
--    mão para separação/entrega física.
create table if not exists funcionarios (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  papeis      text[] not null default '{}',  -- ex: {'separacao'}, {'entrega'}, ou ambos
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

drop trigger if exists trg_funcionarios_atualizado_em on funcionarios;
create trigger trg_funcionarios_atualizado_em
before update on funcionarios
for each row execute function set_atualizado_em();

create index if not exists idx_funcionarios_ativo on funcionarios (ativo);


-- B. PEDIDOS — responsáveis + sequência ShopControl
alter table pedidos
  add column if not exists responsavel_separacao_id uuid references funcionarios (id) on delete set null,
  add column if not exists responsavel_entrega_id   uuid references funcionarios (id) on delete set null,
  add column if not exists entrega_terceirizada_obs  text,  -- usado quando forma_entrega = 'uber_flash'
  add column if not exists sequencia text,                  -- número gerado no ShopControl
  add column if not exists operacao  text check (operacao in ('550','650')); -- 550=orçamento 650=venda

create index if not exists idx_pedidos_sequencia on pedidos (sequencia) where sequencia is not null;
create index if not exists idx_pedidos_resp_separacao on pedidos (responsavel_separacao_id);
create index if not exists idx_pedidos_resp_entrega on pedidos (responsavel_entrega_id);


-- C. ORÇAMENTOS — mesma sequência, pode ser preenchida antes de virar pedido
alter table orcamentos
  add column if not exists sequencia text,
  add column if not exists operacao  text check (operacao in ('550','650'));


-- D. ITENS_PEDIDO — campos da Ficha de Separação
alter table itens_pedido
  add column if not exists tipo_observacao text
    check (tipo_observacao in ('presente_menina','presente_menino','fragil','a_granel','padrao')),
  add column if not exists observacao text;


-- E. RLS — funcionarios entra no mesmo padrão de acesso das outras tabelas
--    operacionais (authenticated = acesso total, igual pedidos/clientes hoje).
alter table funcionarios enable row level security;

drop policy if exists "operadores_acesso_total" on funcionarios;
create policy "operadores_acesso_total" on funcionarios
  for all to authenticated using (true) with check (true);

drop policy if exists "service_role_full_access" on funcionarios;
create policy "service_role_full_access" on funcionarios
  for all using (auth.role() = 'service_role');


-- F. RPC — atribuição de responsável, registrando no histórico do pedido
--    (mantém o princípio de "RPC como caminho auditável", mesmo não sendo
--    uma transição de status).
create or replace function atribuir_responsavel_pedido(
  p_pedido_id uuid,
  p_tipo text,              -- 'separacao' ou 'entrega'
  p_funcionario_id uuid,
  p_operador_id uuid
)
returns pedidos as $$
declare
  v_pedido pedidos;
begin
  if p_tipo not in ('separacao', 'entrega') then
    raise exception 'tipo inválido: % (use separacao ou entrega)', p_tipo;
  end if;

  if p_tipo = 'separacao' then
    update pedidos set responsavel_separacao_id = p_funcionario_id where id = p_pedido_id;
  else
    update pedidos set responsavel_entrega_id = p_funcionario_id where id = p_pedido_id;
  end if;

  insert into pedidos_status_historico (pedido_id, status_anterior, status_novo, origem, operador_id, observacao)
  select id, status, status, 'atribuicao_responsavel', p_operador_id,
         format('Responsável de %s atribuído', p_tipo)
  from pedidos where id = p_pedido_id;

  select * into v_pedido from pedidos where id = p_pedido_id;
  return v_pedido;
end;
$$ language plpgsql;
```

---

## 5. Estratégia de execução: multi-agente com escopo exclusivo

O trabalho tem uma dependência real (SQL → serviços → UI), então não é 100% paralelizável desde o minuto zero — mas a partir da Fase 2, três frentes de UI não se tocam em nenhum arquivo e podem rodar **simultaneamente** como subagentes independentes.

```
FASE 1 (sequencial, sozinho)
   Agente A — Banco de Dados
        ↓
FASE 2 (sequencial, sozinho — todos os outros dependem do contrato dele)
   Agente B — Camada de Serviço
        ↓
FASE 3 (paralelo — três agentes, zero sobreposição de arquivo)
   Agente C — Funcionários (UI)     Agente D — Pedido/Ficha (UI)     Agente E — Logística (UI)
        ↓                                  ↓                                ↓
FASE 4 (sequencial, sozinho)
   Integração — smoke test do fluxo completo
```

Cada agente abaixo recebe: escopo exclusivo de arquivos, contrato de entrada/saída, critérios de aceitação, plano de teste e comando de rollback — para poder ser copiado e executado como prompt independente.

---

### Agente A — Banco de Dados (Fase 1, sozinho)

**Escopo exclusivo:** `chatbot/papelaria-bot/supabase/extensao_funcionarios_responsaveis.sql` (arquivo novo, único que este agente toca)

**Tarefa:** Criar o arquivo com o conteúdo exato da Seção 4 deste documento, e aplicá-lo no Supabase SQL Editor.

**Contrato de saída (o que os próximos agentes podem assumir que existe):**
- Tabela `funcionarios (id, nome, papeis text[], ativo, criado_em, atualizado_em)`
- Colunas novas em `pedidos`: `responsavel_separacao_id`, `responsavel_entrega_id`, `entrega_terceirizada_obs`, `sequencia`, `operacao`
- Colunas novas em `orcamentos`: `sequencia`, `operacao`
- Colunas novas em `itens_pedido`: `tipo_observacao`, `observacao`
- RPC `atribuir_responsavel_pedido(p_pedido_id, p_tipo, p_funcionario_id, p_operador_id)`

**Critérios de aceitação:**
- [ ] Rodar o SQL duas vezes seguidas no editor sem erro (idempotência)
- [ ] `select * from funcionarios;` retorna tabela vazia sem erro
- [ ] `select responsavel_separacao_id, sequencia from pedidos limit 1;` não dá erro de coluna inexistente

**Rollback:** `drop table funcionarios cascade;` + `alter table pedidos/orcamentos/itens_pedido drop column ...` das colunas listadas acima.

---

### Agente B — Camada de Serviço (Fase 2, sozinho, depende do Agente A)

**Escopo exclusivo:**
- Novo: `src/services/funcionarios.service.js`
- Novo: `src/hooks/useFuncionarios.js`
- Editar (só adicionar funções, não mexer no que já existe): `src/services/pedidos.service.js`, `src/services/orcamentos.service.js`

**Contrato de saída (funções que Fase 3 vai chamar — nomes e assinaturas exatos):**
```js
// funcionarios.service.js
funcionariosService.listar(filtros)              // { ativo?, papel? }
funcionariosService.listarPorPapel(papel)         // 'separacao' | 'entrega'
funcionariosService.criar(dados)                  // { nome, papeis: string[] }
funcionariosService.atualizar(id, dados)
funcionariosService.toggleAtivo(id)

// pedidos.service.js (novas funções, além das já existentes)
pedidosService.atribuirResponsavel(pedidoId, tipo, funcionarioId, operadorId) // tipo: 'separacao'|'entrega' → chama RPC atribuir_responsavel_pedido
pedidosService.atualizarItemFicha(itemId, { tipo_observacao, observacao })    // update direto em itens_pedido
pedidosService.atualizarSequencia(pedidoId, { sequencia, operacao })          // update direto em pedidos

// orcamentos.service.js (nova função)
orcamentosService.atualizarSequencia(orcamentoId, { sequencia, operacao })
```

**Critérios de aceitação:**
- [ ] `useFuncionarios.js` segue exatamente o padrão de retorno de `useClientes.js` (`{ dados, carregando, carregar }`)
- [ ] Nenhuma função já existente em `pedidos.service.js`/`orcamentos.service.js` foi removida ou teve assinatura alterada
- [ ] Chamar `atribuirResponsavel` de fato grava em `pedidos_status_historico`

**Plano de teste:** Chamar cada função nova via console do navegador (ou script temporário) antes de plugar em UI.

**Rollback:** Reverter os 2 arquivos editados para o commit anterior; apagar os 2 arquivos novos.

---

### Agente C — Funcionários UI (Fase 3, paralelo, depende do contrato do Agente B)

**Escopo exclusivo:**
- Novo: `src/pages/FuncionariosPage.jsx`
- Editar: `src/App.jsx` (só adicionar a rota `funcionarios`, uma linha)
- Editar: componente de Sidebar/Layout (só adicionar um item de menu)

**Tarefa:** CRUD completo (listar, criar, editar, ativar/desativar) — mesmo padrão visual e de estrutura de `CatalogPage.jsx`. Usa exclusivamente `funcionariosService` do Agente B.

**Critérios de aceitação:**
- [ ] Criar funcionário com múltiplos papéis, ver refletido na tabela
- [ ] Desativar funcionário some da lista usada pelos dropdowns do Agente D (mas continua no histórico de pedidos antigos)

**Rollback:** Apagar `FuncionariosPage.jsx`, reverter a linha de rota e o item de menu.

---

### Agente D — Pedido, Ficha de Separação e Impressão UI (Fase 3, paralelo, depende do contrato do Agente B)

**Escopo exclusivo:**
- Editar: `src/components/pedidos/PedidoModal.jsx` (inclui o `ChecklistSeparacao` interno)
- Novo: CSS de impressão (`@media print`, pode ir no arquivo de estilos já usado pelo modal)

**Tarefa:**
1. Seção "Responsáveis": dropdown separação + dropdown entrega, via `funcionariosService.listarPorPapel`, salvando via `pedidosService.atribuirResponsavel`
2. Seção "Sequência ShopControl": 2 campos texto (sequência, operação), sempre editáveis, nunca obrigatórios, via `pedidosService.atualizarSequencia`
3. No `ChecklistSeparacao`, por item: `<select>` Tipo + `<input>` Observação, via `pedidosService.atualizarItemFicha`
4. Botão "Imprimir" → `window.print()` com CSS que esconde sidebar/header e formata A4

**Critérios de aceitação:**
- [ ] Atribuir responsável reflete na lista de Pedidos (coluna Responsável) sem F5
- [ ] Marcar item como "Presente - Menina" com observação, fechar e reabrir o pedido, dado persiste
- [ ] Sequência/Operação preenchida num pedido Finalizado não trava nada
- [ ] Impressão sai em A4, sem sidebar, sem cores de fundo desnecessárias

**Rollback:** Reverter `PedidoModal.jsx` para o commit anterior.

---

### Agente E — Logística UI (Fase 3, paralelo, depende do contrato do Agente B)

**Escopo exclusivo:** `src/pages/LogisticaPage.jsx` (criar ligando a dados reais — hoje é placeholder)

**Tarefa:** Duas colunas (Pronto para Retirada / Em Entrega), cada card mostrando cliente, endereço, badge Interna/Terceirizada (a partir de `forma_entrega`), e responsável (`responsavel_entrega_id` via `funcionariosService`, ou `entrega_terceirizada_obs` quando `uber_flash`). Botão "Marcar como Entregue" chama a RPC de status já existente (`marcar_saiu_entrega_pedido` → depois `atualizar_status_pedido_dashboard` para `concluido`, mesmo padrão de `pedidos.service.js`).

**Critérios de aceitação:**
- [ ] Pedido com `forma_entrega = uber_flash` mostra badge Terceirizada e a observação, sem exigir funcionário
- [ ] Pedido com `forma_entrega = entrega_propria` mostra o nome do funcionário atribuído pelo Agente D

**Rollback:** Apagar/reverter `LogisticaPage.jsx`.

---

## 6. Fase 4 — Integração (sequencial, sozinho, depois que C+D+E terminarem)

Smoke test do fluxo completo, sem editar nenhum arquivo (só validação):

- [ ] Criar pedido manual → abrir → atribuir responsável de separação (Agente C+D) → marcar itens com tipo/observação → mudar forma de entrega pra própria, atribuir entregador → marcar pronto → marcar entregue (Agente E) → conferir no Dashboard e nos Relatórios que os números batem
- [ ] Repetir com `forma_entrega = uber_flash` (sem funcionário de entrega)
- [ ] Conferir `pedidos_status_historico` tem os registros de atribuição de responsável

## 7. Plano de rollback geral

Toda a migração SQL é aditiva — nenhuma coluna/tabela existente é alterada ou removida. Se precisar reverter tudo, seguir os rollbacks de cada agente na ordem inversa (E, D, C, B, A).