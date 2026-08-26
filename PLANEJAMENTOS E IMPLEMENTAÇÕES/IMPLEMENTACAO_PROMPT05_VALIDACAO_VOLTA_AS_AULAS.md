# PROMPT-05 — Validação Técnica, Segurança e Testes (Pré-Volta às Aulas)

**Data:** 24/08/2026
**Escopo:** Fase 1 (raio-x técnico) + correções de segurança + feature de fila de atendimento + testes E2E/carga, tudo executado no mesmo dia por decisão do João.

---

## 0. Como chegamos aqui

A Fase 1 (análise técnica geral, artifact "Raio-X Técnico Fase 1") mapeou o estado real de `papelaria-bot`, `venancio-ai-ops`, workflows n8n e o schema Supabase, e levantou 5 achados críticos + 10 perguntas abertas. O João respondeu todas as perguntas e pediu para executar tudo no mesmo dia, incluindo uma feature nova (fila de atendimento) que surgiu durante essa conversa. Este documento registra o que foi de fato implementado a partir dali.

---

## 1. Decisões do João (base de tudo que segue)

| Tema | Decisão |
|---|---|
| `listaEscolar.js` ativo em produção | Intencional — fica ativo, aguardando atualização das listas escolares do ano letivo |
| `analisa técnica.md` (raiz do repo) | Confirmado como prompt de tarefa desatualizado — fonte de verdade real é `DOCUMENTAÇÃO/` + Plano Mestre |
| Bloqueadores B0/B1 (RPC) | Tratados como fechados (confirmado por evidência SQL de execução em produção, 15/08) |
| Tool "Consultar Produtos" removida do Agente de Vendas | Intencional — RAG/Busca Inteligente é a base que a substitui |
| Tool "Consultar Alternativa de Qualidade" (Tier de Material) | Recriar a tool dedicada |
| Apikey da Evolution API exposta em texto plano | Rotação real não é viável (infra gerenciada pela Cloudfy) — decisão: migrar pra credencial gerenciada sem trocar o valor agora |
| RLS permitindo bypass das RPCs | Corrigir — segurança tem prioridade |
| `assumirConversa` sem checar login de verdade | Criar RPC própria resolvendo o ator via sessão |
| "Agendar Follow-up" / "Encerrar Conversa" | Implementar a melhor opção disponível |
| Fila de atendimento (feature nova, pedida pelo João) | Visibilidade de espera + distribuição automática entre operadores + alerta de volume — as três juntas |
| Testes | Fazer os automatizados de E2E (Fase 3) e carga (Fase 4) hoje também |

---

## 2. Bloco A — Segurança no banco (Supabase)

### O que foi corrigido

**Achado original:** as RPCs `atualizar_status_pedido_dashboard`, `atualizar_status_orcamento_dashboard`, `aceitar_orcamento_dashboard` e `atribuir_responsavel_pedido` rodavam como *invoker* (não `SECURITY DEFINER`) — ou seja, só funcionavam porque a RLS de `pedidos`/`orcamentos`/históricos/`eventos` permitia UPDATE/INSERT direto pra qualquer operador ativo. Isso significava que qualquer operador podia pular a RPC inteira e escrever direto via REST, inclusive falsificando quem fez o quê no histórico de auditoria.

**Migração `b7_fecha_bypass_rls_rpcs_criticas`:**
1. Convertidas para `SECURITY DEFINER` (com `search_path = public`, mesmo padrão das RPCs já corrigidas como `aceitar_orcamento`): `atualizar_status_pedido_dashboard`, `atualizar_status_orcamento_dashboard`, `aceitar_orcamento_dashboard`, `atribuir_responsavel_pedido`, `atualizar_status_pedido`. A checagem de `auth.uid()`/`eh_operador_ativo()` já existia dentro delas — só deixaram de depender da RLS permissiva pra funcionar.
2. Removidas as policies `operadores_atualizacao`/`operadores_escrita` de `pedidos`, `orcamentos`, `pedidos_status_historico`, `orcamentos_status_historico` e `eventos` — confirmado antes (grep + leitura de código) que não havia nenhum uso legítimo de escrita direta nessas tabelas fora das RPCs (o único código que escrevia direto em `eventos`, `eventLogService.registrar()`, nunca é chamado em lugar nenhum do dashboard).
3. Criadas as RPCs `assumir_conversa_dashboard(p_conversa_id)` e `liberar_conversa_dashboard(p_conversa_id)`, `SECURITY DEFINER`, resolvendo o operador via `auth.uid()` — substituem o `UPDATE` direto que `atendimentoService.assumirConversa` fazia aceitando `operador_id` vindo do client sem checar login de verdade.
4. Defesa em profundidade: `conversas.operador_id` deixou de ser gravável por UPDATE direto de qualquer client (`REVOKE`/`GRANT` por coluna) — só as RPCs acima conseguem gravar essa coluna agora. As demais colunas (`status`, `bot_ativo`, `prioridade`, `tags` etc.) continuam graváveis normalmente, sem mudança nenhuma pras funções `toggleIA`/`atualizarPrioridade`/tags.

Verificado após aplicar: as 7 funções estão `SECURITY DEFINER` com `search_path` fixo, as policies de escrita sumiram das 5 tabelas (só sobrou leitura + `service_role_full_access`), e a coluna `operador_id` não aparece mais na lista de colunas graváveis por `authenticated`. Advisor de segurança do Supabase não acusou nada novo além do aviso genérico esperado pra funções `SECURITY DEFINER`.

**Impacto no dia a dia:** nenhum. É mudança de permissão interna, não muda nenhum clique/passo de quem usa o dashboard.

---

## 3. Bloco B — Fila de atendimento (feature nova)

Não existia nenhum conceito de "operador disponível" nem distribuição de conversas no projeto — construído do zero.

### Banco (migração `fila_atendimento_heartbeat_distribuicao`)
- `operadores.ultimo_heartbeat` (novo) — atualizado pela RPC `registrar_heartbeat_operador()`, chamada pelo dashboard a cada ~20s enquanto a tela de Atendimento está aberta.
- Trigger `trg_distribuir_conversa` em `conversas`: sempre que uma conversa fica com `bot_ativo=false` e `operador_id` nulo (bot escalou pra humano), tenta atribuir automaticamente ao operador com heartbeat recente (últimos 90s) e menos conversas abertas no momento. Se ninguém estiver "online", a conversa fica sem dono mesmo, visível na fila manual.

### Dashboard (`venancio-ai-ops`)
- `atendimento.service.js`: `assumirConversa`/`liberarConversa` agora chamam as RPCs novas (sem mais mandar `operador_id` do client); nova função `registrarHeartbeat()`.
- Hook novo `useHeartbeatOperador.js`: dispara o heartbeat no mount e a cada 20s.
- Nova aba "Fila" em `AtendimentoPage.jsx`, usando o critério já existente `bot_ativo=false && operador_id is null` (não `status`), ordenada por tempo de espera — cada conversa mostra badge "⏳ aguardando há Xmin".
- Chip de "aguardando" no cabeçalho vira alerta visual (pulsante) quando ultrapassa 5 conversas na fila.
- "Encerrar Conversa" agora funciona de verdade (`atualizarStatus(id, 'finalizado')`, atrás de confirmação).
- "Agendar Follow-up" agora funciona de verdade — como a tabela `followups` já existente no banco não tem policy de acesso pra operador (só `service_role`) e não tem coluna de conversa, ficou pra trás como ideia futura; a implementação de hoje usa uma tag `followup:AAAA-MM-DD` na própria conversa, com badge destacado (inclusive quando está atrasado).

**Impacto no dia a dia:** a tela de Atendimento ganha uma aba "Fila", um alerta visual de volume alto, e os dois botões que só mostravam aviso de "não implementado" agora funcionam. Conversas escaladas pra humano podem começar a aparecer já atribuídas automaticamente a um operador, sem precisar que alguém clique "Assumir" manualmente — só quando tiver algum operador com a tela de Atendimento aberta no momento.

---

## 4. Bloco C — n8n

### Prompt do Agente de Vendas (`qqN54gUwSLYq14bZ`)
Removida toda a lógica de escolha entre "Consultar Produtos" (tool que não existe mais desde a refatoração de RAG de 22/08) e "Busca Inteligente" — agora o prompt só referencia "Busca Inteligente" como base única de busca, com a instrução ajustada pra mandar a frase qualificada completa (busca semântica funciona melhor assim) em vez de truncar pra uma palavra-chave. Todas as regras de disciplina anti-alucinação, "não mencionar estoque" e "Perguntar ao Operador" quando não encontra foram preservadas.

Correção extra necessária: o campo de onde vem o `produto_id` mudou de `id` (formato antigo) pra `metadata.produto_id` (formato da Busca Inteligente) — ajustado em todo o prompt, incluindo a seção Tier de Material que tinha ficado pra trás.

### Tool "Consultar Alternativa de Qualidade" (Tier de Material)
Recriada como `httpRequestTool`, consultando a tabela `produtos_relacionados` (mesma usada pelo Product Engine do dashboard) filtrando por `produto_id` + `tipo=alternativa`, usando a credencial gerenciada já existente do Supabase. Conectada de volta ao Agente de Vendas.

### Apikey da Evolution API (workflow "Notificação Status Pedido")
Migrada do texto plano (node `Set · Config`) pra credencial gerenciada `httpHeaderAuth`, reaproveitando a mesma credencial já usada pelo workflow "Agente Orçamento" (mesma instância, mesmo valor — não foi possível rotacionar o valor porque a infra é gerenciada pela Cloudfy). `errorWorkflow` desse workflow também foi vinculado ao Error Handler global, igual os outros 3 workflows ativos já tinham.

Validação (`n8n_validate_workflow`) limpa nos dois workflows alterados, sem erros nem avisos novos.

**Pendência que ficou anotada, não bloqueadora:** rotacionar o valor da apikey de verdade depende de acesso ao painel da Cloudfy ou abrir chamado com o suporte deles — fora do nosso controle direto.

---

## 5. Bloco D — Testes

### Fase 3 — E2E por rota
44 testes novos em 5 arquivos (`chatbot/papelaria-bot/test/`), usando o padrão de dublagem de serviços já estabelecido no projeto (sem bater em Supabase/Evolution/n8n reais). `npm test`: **231/231 passando** (era 187 antes). Cobertura subiu de 80,2%/79,0%/83,4% pra **87,5%/80,3%/86,5%** (linhas/branches/funções) — destaque pro multimodal (`mediaProcessor.js`), que estava praticamente sem teste (36%/0%) e foi pra 98%/67%.

Das 8 rotas do escopo original: as que são 100% responsabilidade do bot (triagem, handoff IA→humano, multimodal) foram testadas de ponta a ponta e passaram. As que dependem do n8n/RPC rodando fora do processo do bot (Agente de Vendas, Agente de Orçamento, separação, entrega) foram testadas na parte que É do bot (o que ele manda e o que ele faz com a resposta) — testar o resto exigiria o n8n real rodando, e isso ficou documentado explicitamente em vez de forçar um teste que não provaria nada.

### Fase 4 — Carga (k6)
Instalado k6 (binário via `winget`, não é pacote npm). Criado servidor de teste (`chatbot/papelaria-bot/loadtest/server-teste.js`, app Express real com serviços externos dublados) e 3 cenários de carga (`chatbot/papelaria-bot/loadtest/webhook.k6.js`): pico realista (150 conversas em rajada), concorrência na mesma conversa, e mensagens duplicadas.

**Resultados:**
- Em volume diário absoluto (50-200+ msgs/dia espalhadas num dia de 8h) o bot está confortável — é muito abaixo de qualquer limite testado.
- **O ponto de ruptura real é rajada concentrada**: 150 conversas escrevendo quase juntas (plausível num horário de pico de Volta às Aulas) já esbarra no rate limit de 300 req/min por IP — 37% das requisições tomaram 429 nesse teste. Isso é uma configuração de produção legítima, mas vale reavaliar o teto pensando em rajada, não só em volume médio.
- **Achado crítico de comportamento (não é sobre performance):** quando um cliente manda 2-3 mensagens seguidas enquanto o Agente de Vendas ainda está processando a mensagem anterior da mesma conversa, o lock (`conversasComAgenteVendasEmAndamento`) **descarta essas mensagens silenciosamente** — não chama o agente, não avisa o cliente, não grava nada no histórico. No teste, 90% das mensagens concorrentes da mesma conversa foram engolidas dessa forma. Num pico real, isso é risco de perder mensagem de cliente sem nenhum rastro pra investigar depois.
- O dedupe por `mensagemId` (mensagem duplicada de verdade, reenvio da Evolution API) funcionou corretamente mesmo sob concorrência — esse mecanismo está sólido.

**Recomendações registradas, não aplicadas ainda (decisão do João):**
1. Reavaliar o teto do rate limiter pra rajada de pico (hoje 300/min por IP, compartilhado entre todos os clientes porque todos passam pela mesma instância da Evolution API).
2. Trocar o descarte silencioso do lock por conversa por uma resposta explícita ("ainda processando sua mensagem anterior") e passar a registrar essas mensagens no histórico mesmo quando descartadas.

---

## 6. O que ficou pendente / não foi feito

- **Rotação real da apikey da Evolution API** — depende de acesso ao painel/suporte da Cloudfy.
- **Silent-drop do lock por conversa** (achado do teste de carga) — não corrigido, só documentado e recomendado.
- **Teto do rate limiter sob rajada** — não alterado, só sinalizado.
- **Tabela `followups`** — existe pronta no banco mas sem RLS pra operador; ideia pra evoluir o Agendar Follow-up depois do pico, migrando da tag atual pra essa tabela.
- Achados de menor severidade já listados na Fase 1 (débito técnico geral de cada componente) que não faziam parte do pedido de hoje continuam como estavam — ver o artifact "Raio-X Técnico Fase 1".
