# Relatório — Fase 3: Testes E2E por Rota (papelaria-bot)

**Data:** 24/08/2026
**Escopo:** validação técnica pré-Volta às Aulas, Fase 3 (Testes E2E por Rota), executada pelo agente responsável pelo backend do bot (`chatbot/papelaria-bot/`).
**Referência de contexto:** `analisa técnica.md` (prompt original das 8 rotas, com ressalvas — ver seção 6) e `PLANEJAMENTOS E IMPLEMENTAÇÕES/PLANO_MESTRE_IMPLEMENTACAO.md` (estado real do projeto).

> Este documento cobre só a Fase 3 (testes automatizados do bot). O trabalho de segurança no banco, a feature de fila de atendimento e o teste de carga (Fase 4/k6) foram feitos em paralelo por outras frentes no mesmo dia e estão documentados em `IMPLEMENTACAO_PROMPT05_VALIDACAO_VOLTA_AS_AULAS.md` — a seção 4 deste relatório resume os achados de desempenho de lá, sem duplicar autoria.

---

## 1. O que foi pedido

Cobrir com testes automatizados reais (não plano, código que roda) as 8 rotas do fluxo do bot, do início ao fim, dentro do processo do `papelaria-bot` — sem subir n8n, Evolution API ou Postgres reais. Onde uma rota depender de um sistema externo fora do controle do bot, testar só a fatia que é responsabilidade do bot e documentar a limitação em vez de forçar um teste frágil.

---

## 2. O que mudou / o que foi acrescentado

Nenhum arquivo de produção foi alterado. Foram criados **5 arquivos de teste novos**, todos em `chatbot/papelaria-bot/test/`, seguindo o padrão já estabelecido no projeto (monkey-patch via `require.cache` para dublar Supabase/Evolution API/n8n, chamando `receberWebhook`/`executarAcoes` como função direta, sem servidor HTTP real):

| Arquivo novo | Testes | Rota(s) coberta(s) |
|---|---|---|
| `test/utils/mediaProcessor.test.js` | 11 | Rota 8 — transcrição de áudio e descrição de imagem via OpenRouter (módulo que estava com 36% de linhas e 0% de funções cobertas) |
| `test/webhook/webhookController.rotas.test.js` | 12 | Rotas 1, 2, 3, 4, 5 e parte da 7 |
| `test/botEngine/actions.test.js` | 8 | `finalizarCadastroEPedido` — função que fecha o ciclo de venda, citada no Plano Mestre como "sem nenhum teste dedicado" |
| `test/webhook/webhookController.multimodal.test.js` | 10 | Rota 8 — integração ponta a ponta (áudio/imagem/PDF chegando pelo webhook) |
| `test/supabase/separacaoSemFilaFifo.contrato.test.js` | 3 | Rota 6 — teste de contrato (leitura do SQL versionado), não um teste de banco ao vivo |

**Total: 44 testes novos**, todos passando.

Nenhuma dependência nova foi adicionada ao `package.json` (continua Node test runner nativo, sem Jest/Mocha/Zod nesta tarefa — não havia rota HTTP nova a criar).

---

## 3. Diagnóstico dos testes

### 3.1 Resultado da suíte completa

```
npm test  →  node --test
```

| Métrica | Antes | Depois |
|---|---|---|
| Testes totais | 187 | **231** |
| Passando | 187 | **231** |
| Falhando | 0 | 0 |
| Suítes (arquivos) | 11 | 16 |

### 3.2 Cobertura (`node --test --experimental-test-coverage`)

| Métrica | Antes | Depois |
|---|---|---|
| Linhas | 80,23% | **87,48%** |
| Branches | 79,03% | **80,28%** |
| Funções | 83,41% | **86,49%** |

Destaques por arquivo (linhas):

| Arquivo | Antes | Depois |
|---|---|---|
| `src/utils/mediaProcessor.js` | 36,04% (0% funções) | **98,20%** (66,67% funções) |
| `src/webhook/webhookController.js` | 52,03% | **81,83%** |
| `src/botEngine/actions.js` | não aparecia no relatório (nunca era carregado de verdade em nenhum teste — `executarAcoes` era sempre dublado) | **84,11%** (63,41% branches, 80% funções) |

Pontos que continuam abaixo da média e são candidatos naturais para uma próxima rodada (fora do escopo desta tarefa): `clientesService.js` (61,06%), `evolutionApi.js` (65,22%), `orcamentosService.js` (68,12%), `n8nClient.js` (68,46%) — todos já eram fracos antes desta tarefa e não foram tocados agora porque o pedido era especificamente as 8 rotas E2E, não cobertura unitária geral.

### 3.3 Tabela rota × resultado

| # | Rota | Resultado | Motivo / observação |
|---|---|---|---|
| 1 | Triagem inicial (roteamento determinístico) | **Passou** | Cliente novo cai no menu principal sem "opção inválida"; opção "1" roteia certo para `SUBMENU_VENDAS`. Complementa (não duplica) `stateMachine.test.js` já existente. |
| 2 | Agente de Vendas (slot-filling, catálogo) | **Passou — parcial por natureza** | Testado o que é do bot: payload de saída pro n8n (`cliente_id`/`conversa_id` sempre do webhook, nunca de saída de IA), e o processamento da resposta dublada (envio ao cliente, transição de estado). O slot-filling/RAG em si roda inteiramente no n8n, fora do processo — não dá pra testar de verdade sem o n8n real no ar. |
| 3 | Agente de Orçamento / RPC `aceitar_orcamento` | **Passou — parcial por natureza** | Testado o que o bot prepara e entrega (protocolo, valor, status do pedido/orçamento ativo via `receberIntencaoFechamentoPedido`). A RPC em si roda no Postgres, acionada pelo n8n — fora do processo do bot. |
| 4 | Coleta de horário de retirada no fechamento | **Passou — parcial por natureza** | A extração de `forma_entrega`/`horario_retirada_desejado` acontece dentro do n8n. Confirmado que o bot repassa o texto final do agente ao cliente sem alterar/truncar, e decide o próximo estado corretamente a partir de `encerrar_atendimento_ia`. |
| 5 | Handoff automático IA → humano (escalação) | **Passou** | Três gatilhos testados: `acionarHumano:true` (falha técnica do agente), timeout/erro do n8n (retorna `null`), e comando explícito "atendente". Os três pausam o bot, notificam vendas e verificam escalonamento de fila corretamente. |
| 6 | Separação: checklist, ausência de separador → sem fila FIFO | **Não testável em processo do bot** (documentado via teste de contrato) | Busca no código-fonte confirma que nenhuma rota do bot toca `solicitacoes_separacao` nem as RPCs de separação — dashboard e app chamam a RPC `delegar_separacao` direto no Supabase. O teste de contrato lê o SQL versionado e prova, por inspeção estrutural, que a ausência de separador ativo é rejeição síncrona imediata (`raise exception`, antes do único `insert`) — nunca um enfileiramento. Reconfirmado contra o schema de produção (via MCP Supabase) que não existe nenhuma tabela de fila de separação. |
| 7 | Handoff separação → entrega (híbrido) | **Parcial** | A transição de status (separado → pronto → entregue) é 100% RPC + dashboard/app/n8n, sem nenhum código no bot. A única fatia do bot é comunicar o status "pronto" quando o cliente volta a falar — isso está coberto e passou. |
| 8 | Multimodal (áudio, imagem, PDF) | **Passou** | Classificador (`payloadParser.js`) já estava bem coberto. Agora `mediaProcessor.js` tem cobertura real (sucesso e falha de transcrição/descrição), e o controller tem testes de integração completos: transcrição → Agente de Vendas, comando falado por áudio, falha → fallback humano, sem `OPENROUTER_API_KEY`, bot pausado, PDF (inclusive com bot pausado). |

### 3.4 Achado colateral do próprio processo de teste (nota de qualidade, não bug de produção)

Durante a escrita de `webhookController.multimodal.test.js`, um `assert.deepEqual` contra uma referência de array mutável (`historico`, reaproveitada entre vários testes do mesmo arquivo) produziu um diagnóstico de falha **enganoso**: o `node --test` imprime o valor "actual" no relatório final da suíte, e como o array é mutado pelos testes seguintes antes do relatório ser impresso, o texto exibido não era o estado real no instante do `assert`, e sim o estado do array no fim de toda a suíte. Corrigido usando `[...historico]` (cópia/snapshot) no lugar da referência viva. Vale como padrão a adotar nos próximos arquivos de teste que reaproveitem arrays de captura entre testes.

---

## 4. Diagnóstico de desempenho

Teste de carga (Fase 4, k6) **não fez parte desta tarefa** — foi executado em paralelo por outra frente no mesmo dia. Resumo dos achados relevantes, registrados em `IMPLEMENTACAO_PROMPT05_VALIDACAO_VOLTA_AS_AULAS.md` (seção "Fase 4 — Carga (k6)"), reproduzido aqui só para dar visão completa ao leitor deste relatório:

- Em volume diário absoluto (50–200+ msgs/dia espalhadas num dia de 8h) o bot está confortável.
- **Ponto de ruptura real: rajada concentrada.** 150 conversas escrevendo quase juntas (cenário plausível em horário de pico de Volta às Aulas) esbarra no rate limit de 300 req/min por IP — 37% das requisições tomaram 429 nesse teste.
- **Achado crítico de comportamento, não de performance pura:** quando o mesmo cliente manda 2–3 mensagens seguidas enquanto o Agente de Vendas ainda processa a anterior, o lock em memória (`conversasComAgenteVendasEmAndamento`, em `webhookController.js`) descarta essas mensagens **silenciosamente** — sem chamar o agente, sem avisar o cliente, sem gravar no histórico. No teste, 90% das mensagens concorrentes da mesma conversa foram perdidas dessa forma.
- O dedupe por `mensagemId` (reenvio de verdade da Evolution API) se comportou corretamente mesmo sob concorrência.

Este achado de descarte silencioso é coerente com o Bloqueador B3 do Plano Mestre (locks em memória de processo) e reforça a prioridade de migrar para Redis com resposta explícita ao cliente, em vez de só documentar como dívida técnica futura.

---

## 5. Próximos passos sugeridos

Em ordem de prioridade prática para a Volta às Aulas (não é uma decisão de produto, é a leitura técnica de quem escreveu os testes):

1. **Corrigir o descarte silencioso de mensagens concorrentes** (achado de carga, seção 4) — hoje o cliente não recebe nenhuma resposta e a mensagem some sem rastro. É o achado de maior risco real para o pico de mensagens.
2. **Reavaliar o teto do rate limiter para rajada** (300 req/min por IP compartilhado entre todos os clientes que passam pela mesma instância da Evolution API) — separar taxa por rajada de taxa por volume médio diário.
3. **Cobrir os arquivos que continuam abaixo da média** listados na seção 3.2 (`clientesService.js`, `evolutionApi.js`, `orcamentosService.js`, `n8nClient.js`) — não foi escopo desta tarefa, mas são os próximos candidatos óbvios para uma Fase de "fundação de qualidade" (Fase 1 do Plano Mestre já prevê isso).
4. **Reconfirmar a rota 6 com um teste de banco de verdade** quando houver ambiente de Postgres local reproduzível (Supabase CLI, ver Bloqueador B6 do Plano Mestre) — o teste de contrato desta tarefa prova a intenção do SQL versionado, mas não substitui um teste de integração real contra um Postgres vivo.
5. **Repetir esta suíte de 231 testes em CI** assim que existir pipeline (Bloqueador B5 do Plano Mestre — hoje não há CI nenhum no monorepo) para que nenhuma dessas 8 rotas regrida silenciosamente.

---

## 6. Ressalva sobre o prompt original

O arquivo `analisa técnica.md` (raiz do repo), que definiu a lista das 8 rotas, contém duas afirmações desatualizadas em relação ao estado real do projeto confirmado nesta e em outras sessões:

- Cita "Redis: debounce, buffering de mensagens, lock de 7 segundos" como parte do `papelaria-bot` — na realidade o Redis existe só dentro do workflow n8n; o bot usa locks em memória de processo (`Set`), documentado como Bloqueador B3 no Plano Mestre.
- Instrui "`listaEscolar.js` deve permanecer desativado em produção" — confirmado com o dono do projeto que esse fluxo está **ativo intencionalmente**, aguardando atualização das listas escolares do ano letivo (ver `IMPLEMENTACAO_PROMPT05_VALIDACAO_VOLTA_AS_AULAS.md`, seção 1).

Nenhum teste desta tarefa tratou a ativação do `listaEscolar.js` como erro.

---

## 7. Arquivos relevantes

- `chatbot/papelaria-bot/test/utils/mediaProcessor.test.js`
- `chatbot/papelaria-bot/test/webhook/webhookController.rotas.test.js`
- `chatbot/papelaria-bot/test/webhook/webhookController.multimodal.test.js`
- `chatbot/papelaria-bot/test/botEngine/actions.test.js`
- `chatbot/papelaria-bot/test/supabase/separacaoSemFilaFifo.contrato.test.js`
