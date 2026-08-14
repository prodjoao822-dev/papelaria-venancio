# Documento Mestre de Engenharia de Software

Este documento é o padrão oficial e obrigatório para o desenvolvimento, refatoração e revisão de código deste projeto. Ele deve ser utilizado pelo Claude Code e pela equipe de engenharia como um checklist rigoroso para garantir a adoção das melhores práticas baseadas em Clean Code, SOLID, 12-Factor App, OWASP, melhores práticas de Node.js, PostgreSQL/Supabase e LangChain (Agentes de IA).

---

## 1. Arquitetura

- [ ] **Garantir Arquitetura Baseada no 12-Factor App e SOLID**
  - **Objetivo**: Criar serviços modulares, desacoplados e escaláveis horizontalmente.
  - **Critério de aprovação**: A aplicação não deve armazenar estado local (stateless), as configurações devem vir estritamente do ambiente (Environment Variables), e os serviços de apoio (Backing services) devem ser tratados como recursos anexados.
  - **Como validar**: Inspecionar se existe gravação de estado em memória (ex: sessões em memória local em vez de Redis). Verificar se as classes respeitam o SRP (Single Responsibility Principle) e o DIP (Dependency Inversion Principle).
  - **Erros comuns**: Hardcoding de credenciais; classes ou módulos "Deus" que gerenciam múltiplas responsabilidades; dependência forte de implementações concretas em vez de interfaces.
  - **Boas práticas**: Aplique Injeção de Dependências. Separe rigorosamente a fase de build, release e run.
  - **Prioridade**: Crítico

---

## 2. Organização do Projeto & 3. Estrutura de Pastas

- [ ] **Organização Orientada a Domínio (Domain-Driven) / Feature-Based**
  - **Objetivo**: Facilitar a localização de código e o encapsulamento das regras de negócio.
  - **Critério de aprovação**: O código deve estar agrupado por domínio/módulo (ex: `/users`, `/orders`) e não por tipo técnica (ex: todas as rotas em `/routes`, todos os controllers em `/controllers`).
  - **Como validar**: Avaliar a árvore de diretórios. O módulo de um domínio específico deve conter suas próprias rotas, serviços e testes na mesma pasta ou estrutura próxima.
  - **Erros comuns**: Estrutura "Spaghetti" onde uma mudança de feature exige alteração em 10 pastas diferentes; dependências circulares entre domínios.
  - **Boas práticas**: Usar `index.js/ts` como entrypoint do módulo (padrão Facade) expondo apenas o necessário.
  - **Prioridade**: Alto

---

## 4. Clean Code

- [ ] **Código Limpo, Legível e Sem Duplicação**
  - **Objetivo**: Garantir que o código seja lido e compreendido como um texto claro.
  - **Critério de aprovação**: Funções curtas (idealmente < 20 linhas), nomes de variáveis explícitos e baseados na linguagem ubíqua (Ubiquitous Language), e ausência de código duplicado (DRY).
  - **Como validar**: Uso de linters (ESLint). Revisão por pares. Contagem de linhas das funções e níveis de indentação (evitar "callback hell" ou múltiplos `if/else` aninhados).
  - **Erros comuns**: Uso de nomes de variáveis obscuros (`data`, `val`, `x`), comentários explicando O QUE o código faz (ao invés de POR QUE faz), blocos `try/catch` gigantescos.
  - **Boas práticas**: Encapsular condicionais complexas em funções bem nomeadas (`isEligibleForDiscount()`). Tratar exceções de forma explícita.
  - **Prioridade**: Alto

---

## 5. Backend (Node.js)

- [ ] **Padrões e Confiabilidade Node.js**
  - **Objetivo**: Extrair a máxima performance e estabilidade do Node.js.
  - **Critério de aprovação**: Uso correto de `async/await`, tratamento global de exceções, ausência de bloqueio do Event Loop.
  - **Como validar**: Verificar a existência de handlers para `uncaughtException` e `unhandledRejection`. Auditar loops pesados ou operações criptográficas síncronas.
  - **Erros comuns**: Ignorar promessas rejeitadas; misturar `callbacks` com `Promises`; processamento intensivo de CPU na thread principal.
  - **Boas práticas**: Delegar tarefas de CPU intensivas para Worker Threads ou filas assíncronas (ex: BullMQ). Usar Node.js cluster ou PM2 para concorrência (Scale out).
  - **Prioridade**: Crítico

---

## 6. Banco de Dados (PostgreSQL / Supabase)

- [ ] **Performance e Integridade do Banco**
  - **Objetivo**: Consultas rápidas, dados consistentes e seguros.
  - **Critério de aprovação**: Todas as chaves estrangeiras devem ter índices adequados; Row-Level Security (RLS) do Supabase habilitado; migrações versionadas.
  - **Como validar**: Executar `EXPLAIN ANALYZE` nas queries lentas; auditar tabelas no Supabase para garantir que RLS não está desabilitado; verificar o esquema de migrações.
  - **Erros comuns**: N+1 queries em ORMs; tabelas sensíveis sem RLS, permitindo acesso anônimo via API do Supabase; falta de índices em colunas usadas em `WHERE`.
  - **Boas práticas**: Utilizar connection pooling; evitar trazer colunas desnecessárias (`SELECT *`); controlar transações para operações atômicas.
  - **Prioridade**: Crítico

---

## 7. APIs

- [ ] **APIs Seguras e Padronizadas**
  - **Objetivo**: Prover comunicação previsível, rápida e aderente ao REST ou GraphQL.
  - **Critério de aprovação**: Retornos com HTTP Status Codes adequados (200, 201, 400, 401, 403, 404, 500); rotas com paginação e rate limiting.
  - **Como validar**: Requisições de teste analisando headers, payloads e tempo de resposta.
  - **Erros comuns**: Retornar `200 OK` para erros (ex: `{ error: true }`); expor mensagens de stack trace no erro 500; falta de validação rigorosa de payload.
  - **Boas práticas**: Utilizar schema validation (ex: Zod, Joi); implementar versionamento na URL ou Headers (`/v1/users`).
  - **Prioridade**: Alto

---

## 8. Segurança & 9. LGPD

- [ ] **Mitigação de Riscos OWASP e Proteção de Dados (PII)**
  - **Objetivo**: Impedir vazamentos, ataques de injeção e violações de autorização (BOLA), garantindo conformidade com LGPD.
  - **Critério de aprovação**: Nenhuma dependência com vulnerabilidades críticas; autenticação robusta; autorização em nível de objeto (Broken Object Level Authorization evitado); dados sensíveis criptografados ou anonimizados.
  - **Como validar**: Scans de SAST/DAST; verificar se todos os endpoints validam se o usuário logado *realmente* é dono do recurso acessado (ex: `GET /users/:id/invoices`); auditar logs para garantir que senhas ou PII não são logados.
  - **Erros comuns**: Confiar no ID recebido no payload sem checar propriedade (BOLA); armazenar senhas em texto puro ou com hashes fracos; vazar CPFs/Cartões nos logs.
  - **Boas práticas**: Seguir OWASP API Security Top 10; aplicar o Princípio do Menor Privilégio; implementar exclusão lógica/física para atender ao direito ao esquecimento (LGPD).
  - **Prioridade**: Crítico

---

## 10. Performance & 11. Escalabilidade

- [ ] **Sistema Resiliente e de Alta Disponibilidade**
  - **Objetivo**: Garantir respostas rápidas e capacidade de crescimento sob demanda.
  - **Critério de aprovação**: Respostas da API em menos de 200ms no P95; capacidade de instanciar novos contêineres sem impacto lateral.
  - **Como validar**: Testes de carga (K6, Artillery); monitoramento de APM.
  - **Erros comuns**: Gargalos de disco/rede síncronos; ausência de cache em rotas pesadas e pouco atualizadas.
  - **Boas práticas**: Cache com Redis; CDN para assets estáticos; processamento background para envio de e-mails/relatórios.
  - **Prioridade**: Alto

---

## 12. Agentes de IA (LangChain / Multi-agent)

- [ ] **Arquitetura Multi-agente e RAG Eficiente**
  - **Objetivo**: Integrar LLMs de forma modular, segura e com baixo consumo de tokens desnecessários.
  - **Critério de aprovação**: Responsabilidades divididas por agentes (Subagents, Router); pipelines RAG com Retrieval preciso; contexto restrito.
  - **Como validar**: Inspecionar os prompts para garantir a presença de Guardrails; analisar consumo de tokens nos logs; testar casos fora do domínio para ver se a IA recusa amigavelmente.
  - **Erros comuns**: Agentes "faz-tudo" com contextos gigantes (15K+ tokens) que geram confusão e alto custo; falta de filtragem nas respostas recuperadas pelo RAG; prompt injection vulnerável.
  - **Boas práticas**: Utilizar roteadores (Routers) para direcionar chamadas para agentes especialistas; limitar a injeção de contexto no RAG; manter o histórico de conversação isolado.
  - **Prioridade**: Alto

---

## 13. n8n

- [ ] **Workflows Automatizados Manteníveis**
  - **Objetivo**: Organizar automações de forma que não virem caixas-pretas insustentáveis.
  - **Critério de aprovação**: Workflows fragmentados por processos menores; tratamento de erros globais com nós de Error Trigger.
  - **Como validar**: Revisão visual dos workflows buscando nós soltos; checagem de execução e tratamento de falha.
  - **Erros comuns**: Workflows gigantescos no n8n ("spaghetti visual"); credenciais inseridas direto em nós HTTP; falta de log ou notificação quando um fluxo falha silenciosamente.
  - **Boas práticas**: Dividir em sub-workflows executados via node "Execute Workflow"; gerenciar credenciais via sistema do n8n; usar nós "Stop and Error".
  - **Prioridade**: Médio

---

## 14. Observabilidade & 15. Logs

- [ ] **Visibilidade Total do Comportamento do Sistema**
  - **Objetivo**: Saber rapidamente quando, onde e por que um erro ocorreu.
  - **Critério de aprovação**: Logs estruturados em JSON; uso de Correlation IDs para rastrear uma requisição de ponta a ponta.
  - **Como validar**: Buscar uma requisição no agregador de logs (ex: Datadog, ELK) e confirmar se é possível rastrear todos os serviços tocados usando um ID único.
  - **Erros comuns**: Uso excessivo de `console.log()` não formatado em produção; falta de métricas essenciais (RED: Rate, Errors, Duration).
  - **Boas práticas**: Tratar os logs como fluxos de eventos contínuos (12-Factor App); alertar em taxas de erro acima de limites aceitáveis; mascarar dados sensíveis antes de logar.
  - **Prioridade**: Alto

---

## 16. Testes

- [ ] **Cobertura Confiável e Automatizada**
  - **Objetivo**: Prevenir regressões e atestar o funcionamento das regras de negócio.
  - **Critério de aprovação**: Testes unitários para regras de negócio isoladas; testes de integração para banco/APIs; testes rodando automaticamente no CI.
  - **Como validar**: Executar cobertura de código (`npm run test:cov`) e garantir mínimo acordado (ex: 80%); simular falha no CI barrando o PR.
  - **Erros comuns**: Testes atrelados à implementação e não ao comportamento; mocks excessivos que não testam nada real; testes instáveis (flaky tests).
  - **Boas práticas**: Padrão Arrange-Act-Assert (AAA); utilizar banco de dados em memória ou containers descartáveis (Testcontainers) para testes de integração.
  - **Prioridade**: Alto

---

## 17. Deploy & 18. Manutenção

- [ ] **Esteiras CI/CD e Imagens Docker Otimizadas**
  - **Objetivo**: Entregas rápidas, padronizadas e seguras.
  - **Critério de aprovação**: Builds de Docker multi-stage (imagem de produção enxuta e sem dependências de dev); execução de processos na imagem Docker como usuário não-root.
  - **Como validar**: Analisar tamanho da imagem Docker gerada; inspecionar `Dockerfile` em busca de `USER node` ou similar. Validar pipeline do GitHub Actions/GitLab CI.
  - **Erros comuns**: Rodar containers como `root`; utilizar a tag `latest` na produção em vez de tags fixas de versão/commit; misturar variáveis de build com variáveis de runtime.
  - **Boas práticas**: Seguir rigorosamente a separação entre Build, Release e Run; usar `WORKDIR` explícito; evitar uso de `sudo` dentro dos containers.
  - **Prioridade**: Crítico

---
*Este documento é gerado dinamicamente para manter os padrões de qualidade e segurança do sistema. Todo PR e alteração de código deve estar em conformidade com as regras estipuladas.*
