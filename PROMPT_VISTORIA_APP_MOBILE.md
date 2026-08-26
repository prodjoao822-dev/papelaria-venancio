# VISTORIA E DESENVOLVIMENTO CONTÍNUO — App Mobile (Papelaria Venâncio)

Você vai assumir a responsabilidade pelo desenvolvimento do **app mobile** (`app-mobile/`, React Native + Expo) do projeto Papelaria Venâncio a partir de agora. Este prompt te dá o contexto necessário pra começar; a partir daqui, sessões futuras nesta mesma conversa devem continuar cuidando desse app.

Você tem acesso ao repositório — analise o código real antes de tomar decisões. Não precisa redigitar o que já consegue verificar.

## Contexto do projeto

Papelaria Venâncio é um ecossistema de atendimento via WhatsApp (JS Bot + agentes de IA em n8n) + painel administrativo web (`venancio-ai-ops/`) + este app mobile, todos sobre o mesmo banco Supabase/Postgres. O app mobile é de **uso interno exclusivo da equipe** (não é pro cliente final) — hoje serve dois papéis de funcionário:

- **Separador**: recebe solicitações de separação delegadas pelo Operador, confere item a item de um pedido, marca como pronto.
- **Entregador**: recebe entregas delegadas, aceita, inicia rota, marca como entregue (ou registra insucesso), pode abrir uma ocorrência se algo der errado em campo.

Um mesmo funcionário pode ter os dois papéis ao mesmo tempo (`funcionarios.papeis` é um array) — o app já mostra as abas certas conforme o papel de quem logou (`app-mobile/src/navigation/AppNavigator.js`).

**Leia antes de mexer em qualquer coisa:**
- `DOCUMENTAÇÃO/Requisitos_Addendum_Entrega_Ocorrencia.md` — especificação do fluxo de Entrega/Ocorrência (schema, RPCs, decisões de arquitetura).
- `DOCUMENTAÇÃO/App_Mobile_Camada_Dados_Real.md` — arquitetura da camada de dados do app (client Supabase isolado, auth via bot, padrão de realtime).
- `app-mobile/AGENTS.md` — aviso de que a API do Expo mudou; leia a doc versionada (v54) antes de escrever código de navegação/tela se tiver dúvida.

## Arquitetura atual (não recriar, reaproveitar)

- **Auth**: login por código de funcionário + PIN de 6 dígitos, via `POST {EXPO_PUBLIC_BOT_API_URL}/operador/separador/login` (nome da rota é histórico — hoje aceita qualquer funcionário com papel `separacao` ou `entrega`, devolve `funcionario.papeis`). Sessão fica em `app-mobile/src/contexts/SeparadorAuthContext.js` (nome também histórico — serve qualquer papel), usando um client Supabase isolado (`app-mobile/src/supabase/separadorClient.js`) com storage cifrado (`largeSecureStore.js`).
- **Services**: `separacaoSeparador.service.js` (Separador) e `entregaEntregador.service.js` (Entregador) — cada função wrappa uma RPC (`assumir_separacao`, `concluir_separacao`, `assumir_entrega`, `concluir_entrega`, `abrir_ocorrencia`, etc.). RLS já restringe cada funcionário aos próprios dados — as queries não precisam (nem devem) filtrar manualmente por funcionário.
- **Telas**: `app-mobile/src/features/solicitacoes/` (Separador: Painel, Detalhe, Chat, ConfirmacaoEnvio) e `app-mobile/src/features/entregas/` (Entregador: Painel, Detalhe).
- **Padrão de realtime**: cada tela de detalhe assina `postgres_changes` na tabela relevante e refaz a query inteira no callback (não reidrata linha a linha — listas são pequenas, é intencional).
- **Regra de ouro do projeto**: toda escrita crítica passa por RPC `SECURITY DEFINER` que resolve o ator internamente (`auth.uid()`/`funcionario_atual_id()`) — nunca aceitar id de ator vindo do client. Não inventar padrão novo pra isso.
- Não existe tabela de chat pra `solicitacoes_entrega` (decisão consciente) — "Registrar Ocorrência" é o canal equivalente pro Entregador sinalizar problema.

## O que fazer

Uma vistoria completa do app: identificar falhas, bugs, informação faltando, e melhorar o design — mas o **funcional vem primeiro**. A pergunta certa pra cada tela é "isso dá pro funcionário fazer o trabalho dele direito?", não só "está bonito?".

### Já identificados (comece por aqui, são reais, não suposição)

1. **Separador não vê os itens antes de assumir.** Em `app-mobile/src/features/solicitacoes/DetalheSolicitacaoScreen.js`, a lista de itens (`FlatList`) só é renderizada quando `!isPendente` (linhas ~176-209) — antes de clicar "Assumir Solicitação", a tela mostra só um texto genérico, sem nenhum produto. O separador está assumindo uma solicitação às cegas. Ajuste pra mostrar a lista de itens (mesmo que sem checkbox interativo ainda) já na tela de pendente — ele precisa saber o que vai separar antes de assumir.

2. **Entregador não vê o que está entregando.** `app-mobile/src/services/entregaEntregador.service.js` (`SELECT_SOLICITACAO_ENTREGA`) não busca `itens_pedido` nenhum — só `pedidos(protocolo, valor_total, endereco_entrega, clientes(nome, telefone))`. A tela `DetalheEntregaScreen.js` não tem como mostrar produtos porque o dado nunca chega. Ajuste o SELECT (mesmo padrão de join já usado em `separacaoSeparador.service.js`: `itens:solicitacoes_separacao_itens (itens_pedido(nome_item, quantidade))` — mas aqui o pedido já tem seus itens em `itens_pedido` direto, não precisa passar por uma tabela de solicitação) pra trazer os itens do pedido, e mostre isso na tela — o entregador precisa saber o que está levando, não só pra quem e onde.

3. **Informação do endereço pode estar incompleta pro trabalho de campo.** Confirme que `DetalheEntregaScreen.js` mostra tudo que o entregador precisa pra não errar: endereço completo, telefone do cliente (já mostra), observações do pedido (`pedidos.observacoes`, se existir — confirme se essa coluna é buscada), horário previsto (já mostra). Avalie se falta uma ação rápida tipo "abrir no mapa" (deep link `geo:`/Google Maps a partir do endereço) ou "ligar pro cliente" (deep link `tel:`) — não é frescura, é o tipo de coisa que separa um app usável de um que só mostra dado.

4. **Lentidão perceptível ao navegar entre telas.** O dono do produto relatou uma pequena lentidão ao clicar/navegar. Investigue: canais de realtime não sendo desmontados corretamente (`removeChannel` em todo `useEffect` cleanup — confirme que está em toda tela, não só nas que já vi), refetch completo acontecendo em cascata sem necessidade, ausência de `React.memo`/otimização em listas, transições do `@react-navigation/native-stack` mal configuradas, imagens/assets não otimizados. Não adivinhe a causa sem medir — mas comece pelos `useEffect` de subscription, é o suspeito mais comum nesse tipo de sintoma.

### Depois disso, vistoria completa

Passe por **todas** as telas (`Home`, `Notificacoes`, `Perfil`, `Painel`/`Detalhe`/`Chat`/`ConfirmacaoEnvio` do Separador, `Painel`/`Detalhe` do Entregador, `Login`) procurando:
- Informação que falta (dado que existe no banco mas não aparece na tela, ou que deveria existir e não existe).
- Estados mal tratados (loading, erro, vazio — cada tela trata isso de verdade ou só assume que vai dar certo?).
- Fluxos incompletos ou botões que não fazem nada.
- Onde o visual atrapalha entender a informação (hierarquia confusa, texto pequeno demais, cor sem significado).

Depois de mapear, proponha e implemente as correções — mas siga o padrão de qualidade já estabelecido no projeto (RPCs pra escrita crítica, ator sempre resolvido no servidor, reaproveitar componentes/estilos já existentes em vez de inventar novos, sem sobre-engenharia).

## Restrições

- Não mexa no painel web (`venancio-ai-ops/`) nem no bot (`chatbot/papelaria-bot/`) a não ser que precise mudar um contrato compartilhado (ex: um SELECT que também existe do lado do dashboard) — nesse caso, replique a mudança dos dois lados pra não divergir, é o padrão que o projeto já segue.
- Sem RLS/schema novo sem necessidade — o banco já está modelado (ver addendum). Se achar que falta algo no banco, primeiro confirme lendo o schema real via Supabase antes de propor mudança.
- Rode `npm test` (`app-mobile/`) antes de considerar qualquer mudança pronta — já existe suíte Jest cobrindo os services.
- Não tem device/emulador disponível pra teste visual real nesse ambiente (provavelmente) — deixe claro no que reportar o que foi validado por código/teste automatizado vs. o que precisa de confirmação visual humana.
