# AUDITORIA COMPLETA E MAPEAMENTO DA ENGENHARIA — VENÂNCIO AI

Estamos iniciando uma nova etapa do projeto VENÂNCIO AI.

O projeto já possui Dashboard, JS Bot, agentes de IA, workflows n8n, Supabase/PostgreSQL, Redis, Evolution API e outras integrações.

Agora, antes de continuar adicionando funcionalidades, quero fazer uma **auditoria completa e profunda de toda a estrutura do projeto**.

Esta primeira etapa é de **ENTENDIMENTO E DIAGNÓSTICO**.

## REGRA PRINCIPAL

**NÃO ALTERE, NÃO APAGUE, NÃO REESCREVA E NÃO REFARE O CÓDIGO NESTA ETAPA.**

Quero primeiro entender completamente o sistema atual.

Você pode utilizar subagentes especializados para analisar partes diferentes do projeto e depois consolidar tudo.

---

# PARTE 1 — MAPEAMENTO COMPLETO DO PROJETO

Analise o projeto inteiro, pasta por pasta e arquivo por arquivo.

Quero entender:

* Estrutura de diretórios
* Finalidade de cada pasta
* Finalidade de cada arquivo relevante
* Dependências entre arquivos
* Entradas e saídas
* Serviços
* APIs
* Banco de dados
* Workflows
* Integrações
* Configurações
* Variáveis de ambiente
* Scripts
* Processos de execução

Não apenas liste os arquivos.

**Explique o papel deles dentro do sistema.**

Identifique também:

* Arquivos duplicados
* Arquivos aparentemente abandonados
* Código morto
* Código experimental
* Código temporário
* Código que parece não ser utilizado
* Dependências desnecessárias
* Configurações antigas
* Implementações paralelas que fazem a mesma coisa

Porém, NÃO classifique algo como inútil sem verificar suas referências e dependências.

---

# PARTE 2 — AULA COMPLETA SOBRE O SISTEMA

Quero que você explique o projeto como se estivesse ensinando um desenvolvedor que está estudando JavaScript e engenharia de software.

Preciso entender o sistema de ponta a ponta.

Explique:

### Frontend

* Como o Dashboard funciona
* Componentes
* Estados
* Hooks
* Comunicação com backend
* Requisições
* Autenticação
* Atualizações em tempo real

### Backend / APIs

Explique:

* Como as requisições entram
* Como são processadas
* Como os dados circulam
* Como chegam ao banco
* Como as respostas retornam

Explique os conceitos utilizados no projeto:

* HTTP
* HTTPS
* GET
* POST
* PUT/PATCH
* DELETE
* Headers
* Body
* Query Parameters
* Status HTTP
* JSON
* Webhooks
* REST
* Autenticação
* Autorização
* CORS

Sempre conecte a explicação com exemplos reais encontrados no projeto.

Não quero uma aula genérica de HTTP.

Quero entender:

**"Onde isso acontece dentro do VENÂNCIO AI?"**

---

# PARTE 3 — FLUXO COMPLETO DO ATENDIMENTO

Mapeie o atendimento de ponta a ponta.

Por exemplo:

Cliente
↓
WhatsApp
↓
Evolution API
↓
JS Bot
↓
Redis / debounce
↓
Roteamento
↓
Agente IA
↓
n8n
↓
Ferramentas / Banco
↓
Supabase
↓
Resposta
↓
Cliente

Explique exatamente o que acontece em cada etapa.

Para cada etapa informe:

* Quem recebe
* O que recebe
* O que transforma
* Para onde envia
* Qual tecnologia executa
* Onde pode falhar
* Como o erro é tratado

Faça o mesmo para o fluxo de:

**Dashboard → Agentes → n8n → Banco**

e para o fluxo operacional de:

**Pedido → Delegação → Separação → Conclusão**

---

# PARTE 4 — BANCO E ESTRUTURA DE DADOS

Explique como os dados estão estruturados.

Mapeie:

* Tabelas
* Relacionamentos
* Chaves
* Índices
* RLS
* RPCs
* Estados
* Histórico
* Dados de clientes
* Pedidos
* Produtos
* Conversas
* Agentes
* Separação

Explique o caminho de um dado desde sua criação até sua utilização.

Quero conseguir responder:

**"Se eu precisar alterar essa informação no futuro, onde preciso mexer?"**

---

# PARTE 5 — ARQUITETURA ATUAL

Desenhe mentalmente a arquitetura atual do sistema e explique:

* Frontend
* Backend
* Banco
* IA
* n8n
* WhatsApp
* Redis
* APIs
* Realtime
* Autenticação

Identifique:

* Dependências fortes
* Acoplamento
* Pontos únicos de falha
* Componentes críticos
* Gargalos
* Componentes difíceis de substituir
* Componentes que podem crescer independentemente

---

# PARTE 6 — REQUISITOS NÃO FUNCIONAIS

Agora faça uma análise técnica de:

### Performance

Procure:

* Código pesado
* Processamentos desnecessários
* Consultas repetidas
* N+1 queries
* Chamadas duplicadas
* Loops desnecessários
* Re-renderizações
* Requests desnecessários
* Uso excessivo de memória
* Operações síncronas desnecessárias

### Escalabilidade

Analise se a arquitetura consegue suportar inicialmente:

**50 a 200 mensagens de atendimento por dia**

e considere também crescimento futuro.

Identifique os pontos que podem virar gargalo.

### Manutenção

Analise:

* Organização
* Modularidade
* Legibilidade
* Nomenclatura
* Duplicação
* Complexidade
* Comentários
* Documentação
* Separação de responsabilidades

### Confiabilidade

Analise:

* Tratamento de erros
* Retry
* Timeout
* Fallback
* Idempotência
* Concorrência
* Race conditions
* Falhas de APIs
* Falhas de banco
* Falhas do LLM
* Falhas do n8n

---

# PARTE 7 — CLEAN CODE

Avalie o código seguindo princípios de:

* Clean Code
* SOLID
* DRY
* KISS
* Separation of Concerns
* Modularidade
* Baixo acoplamento
* Alta coesão

Quero exemplos concretos encontrados no projeto.

Não diga apenas:

"Esse código poderia ser melhor."

Explique:

**O que está ruim → por que está ruim → qual o impacto → como deveria ser estruturado.**

---

# PARTE 8 — CÓDIGO DESNECESSÁRIO

Faça uma classificação dos elementos encontrados:

### 🟢 Manter

Código utilizado e importante.

### 🟡 Investigar

Código cuja utilização não está clara.

### 🔴 Possível remoção

Código aparentemente morto, duplicado ou obsoleto.

IMPORTANTE:

Antes de sugerir remoção, procure referências, imports, chamadas, workflows e dependências.

---

# PARTE 9 — SEGURANÇA

Faça uma vistoria básica de segurança:

* Secrets
* Variáveis de ambiente
* Tokens
* APIs
* Webhooks
* Autenticação
* Autorização
* RLS
* CORS
* Dados sensíveis
* Logs
* Exposição de informações

Identifique riscos reais.

---

# PARTE 10 — OBSERVABILIDADE

Analise:

* Logs
* Erros
* Monitoramento
* Rastreamento
* Identificação de falhas
* Health checks
* Auditoria

Quero saber:

**Se o sistema quebrar hoje, eu consigo descobrir rapidamente onde quebrou?**

---

# PARTE 11 — ARQUITETURA IDEAL

Somente DEPOIS de compreender a arquitetura atual, proponha uma arquitetura mais organizada.

Não quero reconstruir o projeto do zero.

Quero saber:

**Como podemos evoluir o que já existe?**

Priorize:

* Simplicidade
* Manutenção
* Clareza
* Baixo acoplamento
* Segurança
* Performance
* Escalabilidade
* Facilidade de desenvolvimento

---

# PARTE 12 — PREPARAÇÃO PARA AS PRÓXIMAS ETAPAS

Depois da auditoria, considere estas prioridades futuras:

1. Analisar/refatorar a estrutura do projeto
2. Começar o desenvolvimento do App Mobile
3. Definir integração Dashboard + Agentes
4. Pesquisar arquitetura de Deploy
5. Executar testes de volume de 50–200 mensagens
6. Organizar o fluxo operacional de separação
7. Buscar feedback dos usuários que utilizarão o sistema

Analise quais dessas etapas possuem dependências entre si e qual deve acontecer primeiro.

---

# DOCUMENTO FINAL

Ao terminar, gere um **Artifact completo em Markdown** contendo:

## 1. Visão geral do sistema

## 2. Mapa completo da arquitetura

## 3. Estrutura de pastas e arquivos

## 4. Explicação técnica do funcionamento

## 5. Fluxo completo do atendimento

## 6. Fluxo dos dados

## 7. Arquitetura do banco

## 8. Integrações

## 9. Agentes e n8n

## 10. Dashboard

## 11. Pontos fortes

## 12. Problemas encontrados

## 13. Código desnecessário ou suspeito

## 14. Problemas de performance

## 15. Problemas de escalabilidade

## 16. Problemas de manutenção

## 17. Problemas de segurança

## 18. Riscos arquiteturais

## 19. Arquitetura recomendada

## 20. Dependências entre as próximas etapas

## 21. Plano de evolução

---

# IMPORTANTE

Este documento também terá uma finalidade educacional.

Quero aprender com o projeto.

Portanto, quando explicar alguma tecnologia, conceito ou decisão arquitetural:

**explique primeiro o conceito e depois mostre como ele aparece no VENÂNCIO AI.**

Não quero somente uma auditoria.

Quero sair dessa análise entendendo:

> **"Como o meu próprio sistema funciona, por que ele foi construído dessa forma, onde cada parte está e o que preciso entender para conseguir mantê-lo e evoluí-lo sozinho."**

Não faça alterações nesta etapa.

Primeiro vamos compreender completamente o sistema.

Depois da análise, utilizaremos o documento produzido para planejar as refatorações e implementações.
