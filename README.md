# Papelaria Venâncio — Atendimento com IA no WhatsApp

Sistema completo de atendimento, vendas e operação para a Papelaria Venâncio, com um agente de IA no WhatsApp que atende clientes, faz orçamentos e acompanha pedidos do início ao fim.

## O problema

Uma papelaria atende muitos clientes pelo WhatsApp, especialmente na temporada de listas escolares. Sem automação, mensagens se acumulam, orçamentos demoram e pedidos se perdem no meio de conversas dispersas.

## A solução

Um ecossistema conectado que automatiza o atendimento no WhatsApp e organiza a operação interna:

- **Agente de IA no WhatsApp** responde dúvidas, identifica intenção, monta orçamentos e acompanha pedidos.
- **Dashboard web** para o time operacional acompanhar conversas, orçamentos, pedidos e separações.
- **App mobile** para separadores e entregadores executarem a separação e entrega com checklist e notificações.
- **Banco de dados unificado** com histórico de clientes, conversas, orçamentos e pedidos.

## Funcionalidades principais

- Atendimento automatizado via WhatsApp com agentes de IA.
- Geração de orçamentos a partir de listas escolares.
- Fluxo de pedido: orçamento → aceite → pagamento → separação → entrega.
- Painel operacional com timeline do pedido e controle de retiradas.
- Notificações em tempo real para operadores e separadores.
- App mobile para separação e entrega.

## Tecnologias

- **Chatbot / IA:** Node.js, JavaScript, n8n, Evolution API, LLM
- **Dashboard:** React, Vite, jsPDF
- **App mobile:** React Native, Expo, React Navigation
- **Backend / Banco:** Supabase, PostgreSQL, Redis
- **DevOps:** GitHub Actions

## Arquitetura

```
Cliente → WhatsApp → Evolution API → papelaria-bot (Node.js) → n8n (agentes de IA) → Supabase/PostgreSQL → Dashboard + App Mobile
```

## Status

Em fase final de desenvolvimento. O chatbot, dashboard e app mobile já estão integrados e em testes. A documentação completa de arquitetura, requisitos e fluxos está em `DOCUMENTAÇÃO/`.

## Documentação

- [Documentação de requisitos](DOCUMENTAÇÃO/Venancio_Documentacao_Requisitos.pdf)
- [Guia mestre de engenharia](DOCUMENTAÇÃO/Guia_Mestre_Engenharia.md)
- [Diagrama de fluxo de atendimento](DOCUMENTAÇÃO/DIAGRAMA%20(ESTRUTURA%20DE%20FLUXO%20DE%20ATENDIMENTO).png)
- [Análise de arquitetura](ANALISE%20ARQUITETURA%20FINAL.MD)

---

Desenvolvido por João Victor Monteiro de Souza.
