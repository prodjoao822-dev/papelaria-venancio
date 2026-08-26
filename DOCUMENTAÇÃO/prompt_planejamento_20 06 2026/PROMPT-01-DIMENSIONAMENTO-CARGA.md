# PROMPT 01 — Dimensionamento de Carga e Instrumentação de Métricas

## Contexto

Projeto Papelaria Venâncio. Monorepo com `bot/`, `app/`, `docs/`, `n8n/`.
Backend: Supabase (PostgreSQL + Realtime). Bot: Node.js. Dashboard: React 18 + Vite.
Pico esperado: 150–200 mensagens/dia no Volta às Aulas.
Equipe no pico: 2 operadores + 3–4 separadores + entregadores.

## Objetivo

Instrumentar métricas de capacidade operacional e criar a tela de Fila de Atendimento no dashboard,
para que o João consiga medir capacidade real e dimensionar a equipe antes do pico.

## Escopo — 3 entregas

### Entrega 1: Instrumentação de métricas no Supabase

Criar uma view materializada ou queries que exponham:

1. **Taxa de resolução IA** — % de conversas encerradas 100% por bot/agentes IA sem handoff humano.
   - Fonte: tabela `conversas` → campo `estado_atual`. Se a conversa nunca passou por estado que envolve operador humano e chegou a um fechamento, conta como resolução IA.
   - Granularidade: diária e semanal.

2. **Tempo médio de atendimento por operador** — intervalo entre primeiro contato do cliente e fechamento do pedido/orçamento, filtrado por operador.
   - Fonte: `pedidos.created_at` / `orcamentos.created_at` vs `pedidos_status_historico` onde `status_novo = 'FINALIZADO'`.

3. **Tempo médio de separação** — intervalo entre delegação ao separador e conclusão.
   - Fonte: quando `solicitacoes_separacao` existir (Fase 4 do roadmap), usar `created_at` vs `updated_at` onde `status = 'pronta'`.
   - Se a tabela ainda não existir, criar campos auxiliares em `pedidos`: `separacao_iniciada_em` e `separacao_concluida_em` como timestamptz nullable.

4. **Volume por período** — mensagens/dia, conversas únicas/dia, pedidos/dia.
   - Fonte: `conversas.updated_at` para atividade; `pedidos.created_at` para pedidos.

**Formato de saída**: criar arquivo `app/src/services/metricas.service.js` com funções que consultem essas métricas via Supabase client. Criar também a migration SQL se necessário.

### Entrega 2: Tela de Fila de Atendimento no Dashboard

Nova rota `/fila` no dashboard (React). Propósito: visualizar em tempo real quem está na fila, posição, tempo de espera, e permitir priorização manual.

**Componentes:**
- `FilaAtendimentoPage.jsx` — página principal
- Lista de conversas aguardando atendimento humano, ordenadas por:
  - Prioridade (alta intenção primeiro — cliente com orçamento aceito ou pedido em andamento)
  - Tempo de espera (quem espera mais sobe)
- Cada card da fila mostra: nome do cliente, tempo esperando, última mensagem, sinal de intenção (se disponível)
- Botão "Assumir" para o operador pegar a conversa
- Badge no sidebar com contagem de conversas na fila

**Dados**: usar Supabase Realtime para atualizar a fila sem polling.

**Integração com bot**: o bot precisa registrar quando uma conversa entra na fila de espera humana. Verificar se o campo `estado_atual` na tabela `conversas` já cobre isso (ex: estado `AGUARDANDO_OPERADOR`). Se não existir, propor o estado.

### Entrega 3: Escalonamento automático (regras de fila)

Quando a fila ultrapassa um threshold configurável (ex: 10 conversas aguardando):
- Bot envia mensagem automática ao cliente: "Nossa equipe está com alta demanda. Você é o Nº {posicao} na fila, tempo estimado de {minutos} minutos."
- Threshold e mensagem devem ser configuráveis via tabela `bot_config` (já existe o padrão de polling).

## Restrições

- NÃO alterar a stateMachine.js (é pura, sem I/O).
- Qualquer novo campo de status deve passar por RPC atômica, nunca UPDATE direto.
- Usar o padrão de nomenclatura em português já existente no codebase.
- Dashboard segue o design system atual (CSS vars, sem Tailwind, sem shadcn).

## Critérios de aceite

- [ ] Métricas acessíveis via `metricas.service.js` com dados reais do Supabase
- [ ] Tela `/fila` renderizando conversas em espera com Realtime
- [ ] Botão "Assumir" funcional — muda o responsável da conversa
- [ ] Badge no sidebar mostrando contagem da fila
- [ ] Regra de escalonamento configurável via `bot_config`
- [ ] Testes unitários para as queries de métricas

## Rollback

Se algo quebrar, reverter a migration SQL e remover a rota `/fila` do router.
