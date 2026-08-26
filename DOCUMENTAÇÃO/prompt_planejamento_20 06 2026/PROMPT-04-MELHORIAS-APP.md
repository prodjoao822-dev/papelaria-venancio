# PROMPT 04 — Melhorias no App: Performance, Visual e Novas Features

## Contexto

Projeto Papelaria Venâncio. Dashboard: React 18 + Vite (`app/` ou `venancio-ai-ops/`).
O dashboard hoje é WEB, usado no computador pelos operadores.
O app mobile (React Native + Expo) está planejado mas AINDA NÃO EXISTE.
A tela de separação (checklist) já existe no dashboard web: `PedidoModal.jsx` → componente `ChecklistSeparacao`.

## Problemas reportados

1. **Delay no checklist de separação**: quando o separador clica para marcar um item como separado, há um delay visível antes do item ficar verde. O componente usa atualização otimista (`setItens` local) + chamada assíncrona (`pedidosService.marcarItemSeparado`), então o delay visual não deveria acontecer. Investigar causa real.

2. **Melhorias visuais e features pendentes** da documentação de requisitos que ainda não foram implementadas.

## Escopo — 4 entregas

---

### Entrega 1: Corrigir delay no checklist de separação

**Arquivo**: `app/src/components/pedidos/PedidoModal.jsx` — componente `ChecklistSeparacao`.

**Diagnóstico a fazer (fase 1 — read-only)**:
1. Verificar se `handleToggle` está realmente fazendo update otimista ANTES da chamada async. O código parece correto, mas verificar se algum `useEffect` com `[pedido]` como dependência está sobrescrevendo o estado local com dados antigos do servidor antes da resposta chegar.
2. Verificar se `onAtualizar?.()` (que chama `carregar()` no parent) está re-fetching o pedido inteiro e resetando o estado dos itens, causando um "flash" de estado antigo.
3. Verificar se o CSS transition (`.checklist-progresso-fill { transition: width 300ms ease }`) está causando percepção de lentidão.

**Fix provável**: o `onAtualizar?.()` está chamando `carregar()` no `PedidoModal`, que faz um novo fetch do pedido inteiro. Quando o fetch retorna, o `useEffect` no `ChecklistSeparacao` roda `setItens(pedido?.itens_pedido ?? [])` e SOBRESCREVE o estado otimista com o estado do servidor (que pode ter latência). Solução:
- Remover o `onAtualizar?.()` do `handleToggle` individual — só chamar no `handleMarcarTodos`.
- Ou: debounce o `onAtualizar` com 500ms para evitar sobrescrever estado otimista.
- Ou: comparar timestamps antes de sobrescrever.

---

### Entrega 2: Tela de retiradas agendadas

Nova seção no dashboard para controle de pedidos com horário de retirada marcado (alimentado pelo agente de IA que agora pergunta horário — ver PROMPT-02).

**Implementação:**

1. Adicionar campo `horario_retirada_previsto` (timestamptz, nullable) na tabela `pedidos` se ainda não existir.

2. Criar componente `RetiradasAgendadas.jsx`:
   - Lista de pedidos com status `PRONTO_RETIRADA` ou `SEPARADO` que têm `horario_retirada_previsto` preenchido.
   - Ordenados por horário (mais próximo primeiro).
   - Visual tipo timeline/agenda: mostra hora, nome do cliente, itens resumidos.
   - Destaque visual para retiradas que já passaram do horário (atrasadas).
   - Destaque para retiradas nos próximos 30 minutos.

3. Integrar na `PedidosPage.jsx` como uma aba ou seção acima da lista de pedidos:
   - Tab "Todos" | "Retiradas Hoje" | "Entregas Hoje"
   - Ou sidebar card na dashboard principal mostrando "Próximas retiradas".

4. Usar Supabase Realtime para atualizar automaticamente.

---

### Entrega 3: Confirmar e ajustar tela de Operador mobile-ready

A documentação prevê que um operador vai usar o CELULAR na loja (não o computador). O dashboard web já tem CSS responsivo (`@media max-width: 768px`), mas precisa ser validado:

**Auditoria a fazer:**
1. Abrir o dashboard em viewport mobile (375px) e verificar:
   - Sidebar colapsa corretamente? Menu hamburguer funciona?
   - `PedidosPage` é usável em tela pequena? Tabela vira cards?
   - `PedidoModal` abre sem quebrar? Checklist é clicável com dedo (touch targets >= 44px)?
   - `NovoPedidoModal` funciona em mobile? Campos não ficam cortados?
   - `AtendimentoPage` (chat) funciona em mobile?

2. **Corrigir o que estiver quebrado**. Focar em:
   - Touch targets mínimos de 44x44px nos checkboxes e botões.
   - Cards em vez de tabela quando `width < 768px`.
   - Input fields com tamanho adequado para teclado mobile.
   - Scroll suave na lista de mensagens do chat.

3. **Não criar app React Native agora** — o foco é tornar o dashboard web usável no celular do operador da loja. O app nativo (Expo) é fase futura.

---

### Entrega 4: Melhorias visuais gerais

Com base na documentação de requisitos, implementar ajustes que estão descritos mas não foram implementados:

1. **Prioridade visual nos pedidos**: pedidos com prioridade `imediata` devem ter destaque visual (borda ou badge) diferente dos `agendados`. Verificar se o campo `prioridade` já existe na tabela `pedidos` ou se precisa ser adicionado.

2. **Status badge unificado**: garantir que os status do pedido seguem a mesma paleta de cores em todas as telas (lista, modal, card). Verificar consistência com `getStatusConfig()` em `app/src/utils/status.js`.

3. **Área de retirada identificada por código**: quando o pedido muda para `PRONTO_RETIRADA`, o modal deve mostrar em destaque o código do pedido (protocolo) com instrução: "Identificar o pacote com este código na área de retirada". Isso é um simples card visual no `PedidoModal`, sem lógica nova.

## Restrições

- Design system atual: CSS vars, sem Tailwind, sem shadcn.
- Nomenclatura em português (variáveis, classes CSS, componentes).
- NÃO iniciar o app React Native/Expo nesta task — isso é fase futura.
- Qualquer novo campo deve ter migration SQL documentada.
- Checklist fix: não alterar o contrato do `pedidosService` — só ajustar o fluxo de estado no componente.

## Critérios de aceite

- [ ] Checklist de separação responde visualmente em < 100ms ao toque (sem flash de estado antigo)
- [ ] Tela de retiradas agendadas mostrando pedidos com horário previsto, com destaque para próximas/atrasadas
- [ ] Dashboard usável em mobile (375px): sidebar, pedidos, modal, chat — tudo funcional com toque
- [ ] Touch targets >= 44px em todos os elementos interativos mobile
- [ ] Código do pedido em destaque no modal quando status = PRONTO_RETIRADA
- [ ] Prioridade visual (imediata vs agendada) nos cards de pedido

## Rollback

- Checklist fix: reverter alterações no PedidoModal.jsx.
- Novas features (retiradas, prioridade): reverter migration SQL + remover componentes novos.
