# App Mobile do Separador — Camada de Dados Real (18/08/2026)

Documenta a execução de `PLANEJAMENTOS E IMPLEMENTAÇÕES/PROMPT_IMPLEMENTACAO_PRE_APP_MOBILE.md` (Fases 1-4). Objetivo: tirar `app-mobile/` de protótipo 100% mockado (`src/mocks/db.js`) e ligá-lo ao Supabase/bot de produção, espelhando 1:1 o que já roda validado no painel web (`venancio-ai-ops/`). **Não inclui** as 28 telas do bundle de design nem RF-01/RF-02/RF-08 — isso é escopo de prompts futuros.

## Arquitetura

```
app-mobile/src/
├── supabase/
│   ├── largeSecureStore.js   ← storage adapter do Supabase Auth
│   └── separadorClient.js    ← client Supabase ISOLADO (storageKey própria)
├── services/
│   ├── separacaoSeparador.service.js  ← mesmo contrato do venancio-ai-ops
│   └── separadorAuth.service.js       ← login via bot, nunca signInWithPassword
├── contexts/
│   └── SeparadorAuthContext.js  ← { session, funcionario, carregando, login, logout }
└── features/…                ← telas existentes, agora ligadas ao service real
```

### Por que não é `expo-secure-store` puro

O Android Keystore limita `expo-secure-store` a ~2048 bytes por item. Uma sessão do Supabase (access_token JWT + refresh_token) costuma passar disso — usar `SecureStore` direto como `auth.storage` falharia em produção, não é uma simplificação segura.

`largeSecureStore.js` implementa o padrão oficial Supabase+Expo para este caso: uma chave AES pequena e aleatória fica no `SecureStore` (cabe no limite); o valor da sessão em si fica **cifrado** (nunca em texto puro) no `AsyncStorage`, que não tem limite de tamanho mas não é seguro por si só. Como o `AsyncStorage` só guarda ciphertext ilegível sem a chave — que só existe no `SecureStore` — isso cumpre a regra do dono do projeto ("sessão nunca em `AsyncStorage` puro, é token + PII").

Dependências novas por causa disso: `@react-native-async-storage/async-storage`, `aes-js`, `react-native-get-random-values` (polyfill de `crypto.getRandomValues`, que não existe nativamente em React Native).

### Login

Igual ao painel web: o app **nunca** chama `supabase.auth.signInWithPassword` direto. `separadorAuth.service.js` faz `POST {EXPO_PUBLIC_BOT_API_URL}/operador/separador/login` (rota já existe em produção, rate-limited e com lockout por tentativas — `chatbot/papelaria-bot/src/index.js`), e só aplica a sessão devolvida via `setSession(...)` no client isolado.

### Realtime

Todas as 3 telas (Painel, Detalhe, Notificações) assinam `postgres_changes` nas tabelas relevantes (`solicitacoes_separacao`, `solicitacoes_separacao_itens`, `solicitacoes_separacao_mensagens`, `notificacoes_internas`) e, no callback, refazem a query inteira — mesmo padrão já usado em produção no `venancio-ai-ops` (`useMinhasSolicitacoes.js`, `SeparadorSolicitacaoPage.jsx`): as listas do Separador são pequenas, refetch completo é mais simples que reidratar linha por linha e é o padrão real do projeto (diferente do que uma versão anterior deste documento de planejamento sugeria).

### Conclusão de separação (`concluir_separacao`)

A RPC já existe e funciona para o caminho normal — todo item marcado, que é a única forma do botão "Separação Pronta" habilitar (`todosSeparados`) — e está ligada em `DetalheSolicitacaoScreen.js`. O que fica **pendente de decisão do dono** (D1, ver `PROMPT_IMPLEMENTACAO_PRE_APP_MOBILE.md`) é só a **conclusão parcial** (chamar essa mesma RPC com item faltando, algo que ela hoje rejeita de propósito) — funcionalidade da tela 10 do bundle de design, fora do escopo deste trabalho. Como esta tela nunca chama a RPC com item pendente, não há conflito com essa decisão em aberto.

## Testes

`app-mobile/` ganhou `jest` (preset `jest-expo`) + `@testing-library/react-native` e um script `test`. Cobertura: os dois services novos (`separacaoSeparador.service.test.js`, `separadorAuth.service.test.js`), mockando a fronteira externa (client Supabase / `fetch` global) — mesmo espírito dos testes de service do bot (`chatbot/papelaria-bot/test/services/`). 19 testes, `npm test` passando.

## Configuração necessária (fora desta sessão)

`app-mobile/.env` (não versionado, só `.env.example` está no repo):
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_BOT_API_URL=
```
Mesmo projeto Supabase do `papelaria-bot`/`venancio-ai-ops` — usar a `anon key`, nunca `service_role`.

Se for testar via `expo start --web`, adicionar a origem local (ex. `http://localhost:8081`) a `DASHBOARD_ORIGINS` no `.env` do bot, **só em desenvolvimento**.

## Pendente de verificação manual (não verificável nesta sessão, sem device/credenciais reais)

- Login ponta-a-ponta contra o bot/Supabase de produção (código+PIN reais, rejeição com lockout de 5 tentativas).
- Realtime confirmado cruzando uma mudança feita no `venancio-ai-ops` (web) e vendo refletir no app sem F5 — só foi validado que o bundle compila e os testes de unidade passam.
- Execução em device/emulador Android e iOS reais.
- Decisão D1 (conclusão parcial / tela 10) — ver `PROMPT_IMPLEMENTACAO_PRE_APP_MOBILE.md`, Fase 0.

## Fase 4 — Índices de histórico (paralela, já aplicável)

`chatbot/papelaria-bot/supabase/extensao_indices_status_historico.sql` — índices em `pedidos_status_historico.pedido_id` e `orcamentos_status_historico.orcamento_id` (hoje só têm a PK). Idempotente (`IF NOT EXISTS`), ainda não aplicado no banco de produção — aplicar seguindo o padrão do projeto (nunca só pelo painel do Supabase).
