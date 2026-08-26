# PROMPT-05 — Validação Técnica, Segurança e Testes (Pré-Volta às Aulas)

## Contexto do Projeto

Você está trabalhando no **Venâncio Agentes de IA**, sistema de operação comercial da Papelaria Venâncio (stationery retail, Brasil). Este é um projeto de **produção real**, não um exercício.

O ecossistema já está implementado e em uso:
- **papelaria-bot**: Node.js/JS WhatsApp bot (roteamento determinístico + state machine)
- **n8n AI agents**: Agente de Vendas e Agente de Orçamento (multimodal: texto, áudio, imagem, PDF)
- **Venâncio Operations**: dashboard React 18 + Vite
- **Supabase**: Postgres + Realtime + pgvector (RAG)
- **Redis**: debounce, buffering de mensagens, lock de 7 segundos

Os PROMPT-01 a PROMPT-04 (métricas/fila, agente consultivo, RAG multimodal, checklist/pickups) já foram implementados e testados manualmente uma vez. Este prompt é uma **validação formal** antes do pico de Volta às Aulas (50–200+ mensagens/dia).

## Papel

Atue como um **time técnico multiagente**: Arquiteto de Software + Especialista em Segurança + Engenheiro de QA + Engenheiro de Performance. Cada fase abaixo deve ser conduzida com a mentalidade especializada correspondente — não misture responsabilidades entre fases.

## Regras Gerais (valem para todas as fases)

- **Não iniciar a próxima fase sem confirmação explícita do João.** Ao final de cada fase, pare, apresente os resultados e aguarde "pode continuar" ou instrução equivalente.
- `docs/` é a fonte única de verdade — leia antes de analisar código.
- Nunca sugerir alterar `cliente_id`/`conversa_id` para vir de output de IA — isso é a defesa primária contra prompt injection e é inegociável.
- RPCs atômicas (`atualizar_status_pedido`, `atualizar_status_orcamento`, `aceitar_orcamento`) são o único caminho de escrita para status crítico — qualquer violação encontrada é severidade alta.
- `stateMachine.js` deve permanecer função pura, sem I/O — qualquer violação é achado a reportar.
- `listaEscolar.js` deve permanecer **desativado** em produção — se algum teste acionar esse fluxo, interromper e alertar.
- Não modificar código de produção durante as fases 1–3 (são fases de leitura/análise/teste, não de correção). Ajustes só entram na fase "se sobrar tempo", com aprovação prévia.
- Toda saída de análise deve ser objetiva, organizada em tabelas/tópicos, sem enrolação.

---

## FASE 1 — Análise Técnica Geral do Estado Atual

**Objetivo:** Dar ao João uma fotografia real e honesta de onde o projeto está — não um relatório de vendas, um raio-x técnico.

**Agente:** Arquiteto de Software

**Escopo:**
- Mapear o estado atual de cada componente (papelaria-bot, n8n workflows, dashboard, Supabase schema)
- Identificar duplicação, acoplamento excessivo, baixa coesão
- Verificar aderência aos princípios do projeto: modularidade, responsabilidade única por componente/agente
- Sinalizar qualquer divergência entre o que está documentado em `docs/` e o que está implementado de fato
- Listar dívida técnica visível (sem julgar prioridade — só listar)

**Entregável:** Documento único (artifact) com:
1. Mapa de componentes e seu estado (funcional / parcial / pendente)
2. Divergências docs vs. código
3. Lista de dívida técnica, sem priorização ainda
4. Perguntas abertas para o João decidir

**Critério de sucesso:** João consegue ler e entender exatamente onde o sistema está, sem precisar abrir o código.

**→ PARE AQUI. Aguarde revisão do João antes da Fase 2.**

---

## FASE 2 — Revisão de Segurança

**Objetivo:** Garantir que o sistema resiste a uso malicioso e erro operacional antes do volume alto de Volta às Aulas.

**Agente:** Especialista em Segurança

**Escopo:**
- Confirmar que `cliente_id`/`conversa_id` são **sempre** hardcoded via sessão, nunca vindos de output de IA (prompt injection)
- Auditar todo write path crítico — confirmar que passa por RPC atômica, sem exceção
- Verificar tratamento de input do usuário nos agentes (áudio, imagem, PDF) — sanitização, limites de tamanho, tipos aceitos
- Verificar exposição de credenciais (hardcoded, logs, variáveis de ambiente vazando)
- Verificar se `listaEscolar.js` está de fato inacessível em produção (não só desligado por flag, mas sem rota exposta)
- Avaliar rate limiting / proteção contra abuso no webhook do Evolution API

**Entregável:** Tabela de achados por severidade (Crítico / Alto / Médio / Baixo), com localização no código e recomendação objetiva para cada um.

**Critério de sucesso:** Nenhum achado Crítico sem plano de correção proposto.

**→ PARE AQUI. Aguarde revisão do João antes da Fase 3.**

---

## FASE 3 — Testes E2E por Rota

**Objetivo:** Validar cada fluxo completo do cliente real, ponta a ponta, sem quebra na costura entre etapas.

**Agente:** Engenheiro de QA

**Escopo — testar cada rota abaixo do início ao fim:**
1. Triagem inicial (WhatsApp → roteamento determinístico)
2. Conversa com Agente de Vendas (slot-filling, consulta de catálogo)
3. Conversa com Agente de Orçamento (fechamento, RPC `aceitar_orcamento`)
4. Coleta de horário de retirada no fechamento
5. Handoff automático IA → humano (escalação)
6. Fluxo de separação (checklist, ausência de separador → desativação sem fila FIFO)
7. Handoff separação → entrega (modo híbrido: automático + manual)
8. Entrada multimodal: áudio, imagem, PDF processados corretamente pelo classificador

**Entregável:** Tabela rota × resultado (passou / falhou / parcial) com passos de reprodução para qualquer falha.

**Critério de sucesso:** Todas as 8 rotas documentadas com evidência, falhas reproduzíveis anotadas.

**→ PARE AQUI. Aguarde revisão do João antes da Fase 4.**

---

## FASE 4 — Testes Automatizados de Carga

**Objetivo:** Validar o requisito não funcional de suportar 50–200+ mensagens/dia sem degradação.

**Agente:** Engenheiro de Performance

**Escopo:**
- Simular volume de mensagens concorrentes dentro da faixa do requisito (e um pouco acima, como margem de segurança)
- Validar comportamento do lock de 7 segundos e debounce do Redis sob concorrência
- Medir tempo de resposta do Agente de Vendas/Orçamento sob carga
- Verificar se há degradação, mensagens perdidas, ou race conditions no state machine
- Verificar comportamento do Supabase (conexões, RPC) sob carga simultânea

**Entregável:** Relatório com métricas (latência média/p95, taxa de erro, throughput sustentado) e comparação direta contra o requisito de 50–200 msgs/dia.

**Critério de sucesso:** Sistema sustenta o requisito com margem, ou o relatório aponta exatamente onde quebra.

**→ FIM. Aguarde instrução do João sobre correções ou próxima etapa.**

---

## Formato de Resposta (todas as fases)

- Título claro por fase
- Tabelas para achados/resultados
- Sem bloco de texto longo — tópicos e listas
- Ao final de cada fase: resumo de 3–5 linhas antes do "PARE AQUI"