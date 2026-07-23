# Venâncio AI Operations — Dashboard Operacional

Central operacional de vendas, pedidos e atendimento integrado ao WhatsApp com IA.

> **Unificado com o banco do bot.** Este dashboard não usa mais um projeto
> Supabase próprio — ele lê/escreve no mesmo projeto onde o `papelaria-bot`
> já roda em produção. Ver `supabase/README.md` para os arquivos de schema
> reais (em `chatbot/papelaria-bot/supabase/`).

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + Vite + CSS puro |
| Backend | Supabase (PostgreSQL + Realtime + Auth) |
| Orquestração | n8n |
| WhatsApp | Evolution API |
| IA | OpenAI + LangChain (ai-service/) |
| Cache | Redis (ai-service/) |

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

### WhatsApp (Evolution API)

Configure `VITE_EVOLUTION_API_URL` no `.env`.

O fluxo completo:
```
Evolution API → n8n webhook → AI Service → Supabase → Dashboard (realtime)
```

### IA (ai-service/)

Serviço Node.js separado com:
- OpenAI GPT-4
- LangChain com tools (buscarProduto, criarOrcamento, registrarPedido)
- Buffer Redis para mensagens em rajada
- Memória conversacional no Supabase

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
| VPS + Nginx | n8n + Evolution API + AI Service |
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
