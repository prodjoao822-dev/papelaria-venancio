# Venâncio AI Operations — Dashboard Operacional

Central operacional de vendas, pedidos e atendimento integrado ao WhatsApp com IA.

> **Unificado com o banco do bot.** Este dashboard não usa mais um projeto
> Supabase próprio — ele lê/escreve no mesmo projeto onde o `papelaria-bot`
> já roda em produção. Os arquivos de schema reais ficam em
> `chatbot/papelaria-bot/supabase/`. As migrations antigas deste projeto
> (de um Supabase separado, já apagado) foram movidas pra
> `_deprecated/venancio-ai-ops-supabase-legado/` — histórico morto,
> nunca reaplicar.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + Vite + CSS puro |
| Backend | Supabase (PostgreSQL + Realtime + Auth) |
| Orquestração | n8n |
| WhatsApp | Evolution API |
| IA | Agentes n8n (Vendas + Orçamento), chamados direto pelo JS Bot — ver [nota abaixo](#ia-agentes-n8n) |

---

## Setup Rápido

### 1. Instalar dependências

```bash
cd venancio-ai-ops
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env` e preencha com o **mesmo projeto Supabase do `papelaria-bot`**
(`chatbot/papelaria-bot/.env`, variável `SUPABASE_URL` — só a URL é igual,
a anon key é diferente da service key que o bot usa):

```env
VITE_SUPABASE_URL=https://SEU_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=SEU_ANON_KEY
```

> Encontre a anon key em: Supabase Dashboard → Project Settings → API

### 3. Criar o banco de dados

No [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql/new),
na pasta `chatbot/papelaria-bot/supabase/`, nesta ordem:

1. `schema.sql`
2. `squemanovo.sql`
3. `extensao_cadastro_fiscal.sql`
4. `extensao_dashboard.sql`

Depois, crie o primeiro operador: crie um usuário em
Authentication → Users, e rode
`insert into operadores (id, nome, papel) values ('<uuid do usuário>', 'Seu Nome', 'admin');`

### 4. Rodar em desenvolvimento

```bash
npm run dev
```

Acesse: http://localhost:3000

---

## Estrutura de Pastas

```
src/
├── supabase/          # Cliente Supabase singleton
├── utils/
│   ├── status.js      # Definição dos 8 status, transições e ações
│   ├── formatters.js  # Formatação de moeda, data, telefone
│   └── constants.js   # Constantes da aplicação
├── services/          # Camada de acesso ao Supabase (sem lógica de UI)
│   ├── pedidos.service.js
│   ├── clientes.service.js
│   └── produtos.service.js
├── contexts/
│   └── AppContext.jsx  # Toast + eventos realtime globais
├── hooks/
│   ├── usePedidos.js   # Pedidos com realtime integrado
│   └── useClientes.js
├── components/
│   ├── layout/         # Sidebar, Header, Layout
│   ├── ui/             # Toast, Spinner, EmptyState, ConfirmDialog
│   ├── pedidos/        # StatusBadge, PedidoRow, PedidoModal, Filtros
│   └── dashboard/      # KpiCard, RealtimeIndicator
└── pages/              # DashboardPage, PedidosPage, ClientesPage, etc.
```

---

## Status dos Pedidos

| Status | Descrição |
|--------|-----------|
| `NOVO_PEDIDO` | Pedido recebido, aguardando ação |
| `AGUARDANDO_CONFIRMACAO` | IA enviou orçamento, aguardando cliente |
| `EM_SEPARACAO` | Operador iniciou separação |
| `SEPARADO` | Itens separados, aguardando próximo passo |
| `PRONTO_RETIRADA` | Pronto para o cliente retirar |
| `SAIU_ENTREGA` | Em rota de entrega |
| `FINALIZADO` | Pedido concluído |
| `CANCELADO` | Pedido cancelado |

---

## Integrações Futuras

### n8n

Configure `VITE_N8N_WEBHOOK_BASE` no `.env`. O sistema já dispara webhooks nos eventos:
- `POST /novo-pedido` — quando um pedido é criado
- `POST /status-atualizado` — quando o status muda

Importe os workflows de `automation/workflows/`.

### WhatsApp (via JS Bot)

Configure `VITE_BOT_API_URL` no `.env`, apontando para a URL pública do JS Bot
(`chatbot/papelaria-bot`). O dashboard chama `POST /operador/mensagens/enviar`
nele — a credencial da Evolution API fica só no `.env` do bot, nunca numa
variável `VITE_*` do dashboard (o bundle do frontend é público).

O fluxo completo (ver detalhes na seção [IA (Agentes n8n)](#ia-agentes-n8n) abaixo):
```
Evolution API → JS Bot → Agentes n8n → Supabase → Dashboard (realtime)
```

### IA (Agentes n8n) {#ia-agentes-n8n}

A IA **não** roda em um serviço Node.js separado (`ai-service/`) — essa pasta
nunca chegou a existir de fato neste repositório e não faz parte da
arquitetura em produção. O fluxo real é:

```
Evolution API → JS Bot (chatbot/papelaria-bot) → Agentes n8n → Supabase → Dashboard (realtime)
```

O JS Bot fala **direto** com dois workflows n8n via `n8nClient.js`
(`chatbot/papelaria-bot/src/integracoes/n8nClient.js`):
- **Agente de Vendas** — consulta síncrona, com timeout (`consultarAgenteVendas`)
- **Agente de Orçamento** — notificação best-effort, fire-and-forget (`notificarAgenteOrcamento`)

Cada um é um workflow n8n independente (ver `chatbot/AGENTE DE IA (N8N)/` na
raiz do monorepo), configurado via `N8N_ORCAMENTO_WEBHOOK_URL` e
`N8N_VENDAS_WEBHOOK_URL` no `.env` do próprio JS Bot — não no `.env` deste
dashboard. `VITE_N8N_WEBHOOK_BASE` (aqui no `venancio-ai-ops`) é uma
integração separada: webhooks de notificação de pedido/status
(`/novo-pedido`, `/status-atualizado`), não a IA em si.

> **Descontinuado:** qualquer menção anterior a um `ai-service/` (Node.js +
> LangChain + Redis) neste README ou no `ConfigPage.jsx` descrevia um plano
> que nunca foi implementado. Não há nada para desligar ou remover — só a
> documentação estava desatualizada.

---

## Build para Produção

```bash
npm run build
```

A pasta `dist/` pode ser servida por qualquer servidor estático (Nginx, Vercel, Netlify, Caddy).

### Deploy recomendado

| Serviço | Para |
|---------|------|
| Vercel / Netlify | Dashboard (gratuito) |
| VPS + Nginx | n8n + Evolution API + JS Bot (chatbot/papelaria-bot) |
| Supabase Cloud | Banco de dados (gerenciado) |

---

## Preparação para APK/Mobile

A arquitetura permite migração progressiva:

1. **Fase atual**: HTML/React no browser
2. **Fase 2**: React Native (reusa 70% dos services e hooks)
3. **Fase 3**: Capacitor (wrapper APK do React atual)

---

## Escalabilidade no Volta às Aulas

O sistema foi projetado para o pico de dezembro/janeiro:

- **Redis buffer**: absorve rajadas de 20-30 msgs em segundos
- **Supabase Realtime**: WebSockets nativos, sem polling
- **n8n queue mode**: processa fila sem sobrecarga
- **RLS granular**: múltiplos operadores com isolamento

---

*Venâncio AI Operations v1.0 — MVP Fase 1*
