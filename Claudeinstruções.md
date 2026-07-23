# PRD — Venâncio Agentes de IA (Fase: Orçamentos, Pedidos e Cadastro Fiscal)

## 1. Contexto

O `papelaria-bot` (JS Bot) já está em produção real: máquina de estados determinística,
comandos globais, idempotência, pausa/reativação por humano, 57 testes. O que falta é
conectar esse bot ao funil comercial de verdade — hoje "Cotação empresa" e "Lista
escolar (outra escola)" terminam em notificar a Vanessa manualmente, sem criar
orçamento formal, sem envolver o Agente de IA de orçamento no n8n, e sem coletar o
cadastro fiscal que o operador precisa pra separar e emitir nota fiscal no Shop
Control.

Esta fase conecta essas pontas.

## 2. Escopo Desta Fase

**Entra:**
- Extensão do schema (orçamentos/pedidos como entidades separadas, cadastro fiscal)
- Novo fluxo de cadastro fiscal, disparado antes de qualquer orçamento virar pedido
- `orcamentosService.js` e `pedidosService.js` no JS Bot
- `n8nClient.js` — integração JS Bot → webhook do Agente de Orçamento
- Reformulação do `Agente Principal` (n8n) → `Agente de Vendas` puro (sem mais classificar intenção)
- Construção do `Agente de Orçamento` (hoje só um stub/subworkflow vazio)
- Comando global de escalação (`atendente`/`reclamação`)

**Fica de fora (backlog, não bloqueia esta fase):**
- Integração via API com o Shop Control (por enquanto, dado só fica pronto pro operador copiar)
- Dashboard interno (Fase 2, já mapeado no schema via `configuracoes`)
- Deploy em Railway/Render (segue local + ngrok por enquanto)
- Analytics persistente (segue em memória)

## 3. Banco de Dados

Rodar, nesta ordem, no Supabase:
1. `schema_final_venancio.sql` (se ainda não rodado — cria `orcamentos`, `pedidos`, `itens_*`, `followups`, `memorias`, `configuracoes`, funções centrais)
2. `extensao_cadastro_fiscal.sql` (novo — campos fiscais em `clientes` + `cliente_tem_cadastro_completo()`)

Nenhum script apaga dado existente. Ambos são idempotentes (seguro rodar de novo).

## 4. Novo Fluxo — Cadastro Fiscal

**Gatilho:** disparado logo antes de chamar `aceitar_orcamento()`, em qualquer rota de
Vendas (Lista Escolar, Cotação Empresa, Venda Geral) — porque nota fiscal é exigida
independente do tipo de venda.

**Passo 0 — checagem silenciosa:** antes de perguntar qualquer coisa, o bot chama
`cliente_tem_cadastro_completo(cliente_id)`. Se `true`, pula direto pra
`aceitar_orcamento()` — cliente recorrente não repete o formulário.

**Passo 1 — pergunta de atalho:**
> "Você já tem cadastro em nosso sistema? (sim/não)"
- **Sim** → "Pode me informar seu CPF ou CNPJ?" → salva em `clientes.tem_cadastro_previo = true` e no campo correspondente (cpf/cnpj) → segue pro fechamento. **O bot não valida nem busca no Shop Control** — só repassa o dado pro operador procurar lá manualmente.
- **Não** → segue pro Passo 2.

**Passo 2 — coleta (agrupada em blocos, não campo a campo):**
1. "Pessoa física ou jurídica?"
2. Se PF: CPF. Se PJ, tudo numa mensagem só: *"Me manda numa mensagem só: CNPJ, Razão Social, Nome Fantasia"* → depois pergunta Indicador de IE (contribuinte/isento/não contribuinte) → se contribuinte, pede Inscrição Estadual
3. "Qual o CEP?"
4. Endereço agrupado: *"Agora me manda: rua, número, complemento (se tiver) e bairro, numa mensagem só"*
5. "Cidade e estado?"
6. Nome (se ainda não tiver) e telefone de contato (se diferente do WhatsApp)
7. Salva tudo em `clientes` → segue pro fechamento

**Passo 3 — fechamento:** chama `aceitar_orcamento(orcamento_id, origem: 'js_bot')` →
pedido nasce com status `confirmado` → bot confirma protocolo pro cliente → mensagem
extra pro grupo de atendimento com os dados fiscais prontos pro operador copiar no
Shop Control.

### Arquivo novo
`src/botEngine/states/cadastroFiscal.js` — fluxo escrito à mão (como
`listaEscolar.js`/`cotacaoEmpresa.js`), não a config declarativa do `menuEngine`
(tem lógica condicional demais: PF vs PJ, contribuinte vs não).

## 5. Novos Arquivos — Mapeados na Estrutura Real

| Arquivo | Papel |
|---|---|
| `src/services/orcamentosService.js` | Cria orçamento + itens; chama `atualizar_status_orcamento` / `aceitar_orcamento` |
| `src/services/pedidosService.js` | Consulta `pedido_ativo_cliente()` / `orcamento_ativo_cliente()` — usado no `webhookController` pra decidir "retoma fluxo" vs "mostra menu" |
| `src/botEngine/states/cadastroFiscal.js` | Fluxo descrito na seção 4 |
| `src/integracoes/n8nClient.js` | Chama o webhook do Agente de Orçamento (contrato na seção 6) |
| Extensão de `cotacaoEmpresa.js` | Depois de "observação", cria orçamento (hoje só notifica) e encaminha pro cadastro fiscal |
| Extensão de `listaEscolar.js` (ramo "outra escola") | Mesma coisa |
| Extensão de `comandosGlobais.js` | Novo comando `atendente`/`reclamação` — funciona em qualquer estado, aciona `actions.js` pra notificar a liderança imediatamente |

### Decisão de design a confirmar
`stateMachine.js` é função pura (sem I/O) — não pode chamar
`cliente_tem_cadastro_completo()` ou `pedido_ativo_cliente()` diretamente. Essas
checagens acontecem no `webhookController` (que já faz I/O) e o resultado entra como
parâmetro extra em `stateMachine.processarMensagem()`, do mesmo jeito que
`estado_atual`/`dados` já entram hoje.

## 6. Contrato JS Bot ↔ Agente de Orçamento (n8n)

```json
// JS Bot → n8n
{
  "cliente_id": "uuid",
  "orcamento_id": "uuid",
  "protocolo": "ORC-2026-0001",
  "tipo": "lista_escolar",
  "payload": { "escola": "...", "itens": [...], "preferencias": "..." }
}

// n8n → JS Bot (opcional, se precisar confirmar recebimento)
{ "orcamento_id": "uuid", "status": "recebido", "aceito": true }
```

O n8n nunca cria `cliente_id` nem `orcamento_id` — só recebe e processa o que o JS
Bot já gerou. Atualização de status do orçamento (`enviado`, `aceito`, `recusado`)
passa sempre por `atualizar_status_orcamento()` / `aceitar_orcamento()`, nunca por
`UPDATE` direto na tabela.

## 7. Mudanças nos Agentes n8n

| Hoje | Vira |
|---|---|
| `Agente Principal` (FAQ + classifica intenção via tag `[INTENT:...]`) | **Agente de Vendas** puro — sem tag de intenção, sem `Switch Roteador`. Recebe a mensagem já sabendo que é rota Venda Geral (o JS Bot decidiu isso antes de acionar) |
| `Agente Comercial` (subworkflow vazio, "será conectado aqui") | **Agente de Orçamento** — recebe o payload da seção 6, monta valores com base em `produtos`, grava em `itens_orcamento`, chama `atualizar_status_orcamento(..., 'enviado', 'agente_orcamento')` |
| `Switch Roteador`, `Extrai Intenção`, `Prepara Payload Multi-Agent` | **Removidos** — roteamento é 100% do JS Bot agora |
| `conversation_state` (tabela) | Já descartada — substituída por `conversas.estado_atual`/`dados` |

## 8. Critérios de Aceitação

- [ ] Cliente com cadastro completo não recebe nenhuma pergunta de cadastro fiscal ao fechar pedido
- [ ] Cliente PF só vê pergunta de CPF; cliente PJ só vê CNPJ/Razão Social/Nome Fantasia/IE
- [ ] Se Indicador de IE = "contribuinte", Inscrição Estadual é obrigatória antes de prosseguir
- [ ] Resposta "sim" na pergunta de cadastro prévio pula direto pra pergunta de CPF/CNPJ, sem repetir o formulário completo
- [ ] `aceitar_orcamento()` cria o pedido e copia todos os itens de `itens_orcamento` pra `itens_pedido` numa única transação
- [ ] Reenvio do mesmo webhook da Evolution API não duplica orçamento nem notificação (idempotência já existente precisa cobrir o novo fluxo também)
- [ ] Comando `atendente`/`reclamação` interrompe qualquer estado atual e notifica o grupo/liderança imediatamente
- [ ] `Agente de Vendas` não emite mais a tag `[INTENT:...]` em nenhuma resposta
- [ ] `Agente de Orçamento` grava protocolo, itens e valor total corretamente em `orcamentos`/`itens_orcamento`

## 9. Riscos e Pontos em Aberto

| Risco | Mitigação proposta |
|---|---|
| 11+ perguntas de cadastro fiscal derrubam taxa de conclusão | Agrupar em blocos (seção 4) — mesma técnica já usada em `cotacaoEmpresa.js` |
| Cliente PF pedindo Lista Escolar pode achar estranho ter que dar CEP/endereço completo | Confirmar com o negócio: talvez CEP/endereço só seja obrigatório quando há entrega, não retirada na loja — está em aberto, não implementado ainda |
| Sem integração real com Shop Control, dado pode ficar desatualizado (operador cadastra lá, bot não sabe) | Fora de escopo por ora; documentar como próximo passo de integração |
| `stateMachine.js` puro precisa que TODO dado de I/O (identidade, pedido ativo, cadastro completo) seja resolvido antes de chamá-la — risco de crescer demais os parâmetros passados | Se isso acontecer, agrupar num único objeto `contexto` em vez de parâmetros soltos |

## 10. Plano de Implementação Sugerido (ordem)

1. Rodar `schema_final_venancio.sql` + `extensao_cadastro_fiscal.sql` no Supabase
2. `orcamentosService.js` + `pedidosService.js` (services novos, sem tocar states ainda)
3. `cadastroFiscal.js` (state novo, testável isolado — 57 testes existentes viram o padrão a seguir)
4. Plugar `cadastroFiscal.js` no fim de `cotacaoEmpresa.js` e `listaEscolar.js` (ramo outra escola)
5. `n8nClient.js` + webhook real acionando o Agente de Orçamento
6. Reformular `Agente Principal` → `Agente de Vendas` no n8n (remover tag de intenção)
7. Construir `Agente de Orçamento` a partir do subworkflow stub existente
8. Comando global `atendente`/`reclamação`
9. Rodar toda a suíte de testes + teste manual ponta a ponta via ngrok

## 11. Fora de Escopo — Não Implementar Agora

- Integração via API com Shop Control
- Dashboard interno
- Deploy em produção definitiva (Railway/Render)
- Analytics persistente em banco
