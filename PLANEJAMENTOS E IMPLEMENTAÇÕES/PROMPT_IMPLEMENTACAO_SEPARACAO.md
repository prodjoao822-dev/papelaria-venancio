# Prompt — Implementação do backend de Separação Delegada (fase pré-app mobile)

Copie e cole o conteúdo abaixo (a partir de "---") como prompt inicial de uma nova conversa Claude Code, na raiz do monorepo.

---

Vamos implementar o **backend real** do fluxo de "solicitação de separação delegada" que motivou o desenho do app mobile (Operador delega, Separador executa, chat interno, prioridade imediata/agendada, notificações). **Não construa o app mobile agora** — a decisão já foi tomada: primeiro o motor (Supabase: schema, RPCs, realtime, notificações), testado através do painel web existente (`venancio-ai-ops`), que já tem auth e design system prontos. O app mobile vem depois, consumindo essa mesma camada já validada.

## Leia isto primeiro, antes de desenhar qualquer coisa

1. `SKILLS/AUDITORIA_INTEGRACAO.md` — auditoria de integração de 27/07. Contém o mapa real de arquitetura (bot × dashboard × n8n × Supabase), os padrões que já funcionam bem e devem ser replicados (RPC como trilha auditável, RLS via `eh_operador_ativo()`/`eh_admin()`, idempotência de SQL), e os erros de segurança já cometidos no passado que **não podem se repetar** (segredo em texto plano em workflow, webhook sem autenticação, campo controlado por IA sem validação de UUID/posse).
2. `chatbot/papelaria-bot/supabase/extensao_dashboard.sql` — define `eh_operador_ativo()`, `eh_admin()`, `set_atualizado_em()`, o padrão de RLS usado em todas as extensões seguintes, e as tabelas `notificacoes`/`templates_mensagem` (que são para notificar **cliente** via WhatsApp — não confundir com o que vamos construir, que é notificação **interna** para a equipe).
3. `chatbot/papelaria-bot/supabase/extensao_funcionarios_responsaveis.sql` — **já existe uma tabela `funcionarios`** (`nome`, `papeis text[]`, `ativo`), usada hoje só para a Ficha de Separação em papel/impressão (`FichaSeparacaoPage.jsx`, `pedidos.service.js#atribuirResponsavel/marcarItemSeparado/atualizarItemFicha`, RPC `atribuir_responsavel_pedido`). **Ela não tem login nenhum** — é um cadastro leve sem conta no Supabase Auth, diferente de `operadores` (que loga via `supabase.auth.signInWithPassword`, ver `venancio-ai-ops/src/contexts/AuthContext.jsx`).
4. `chatbot/papelaria-bot/supabase/squemanovo.sql` — schema principal. `status_pedido` tem só 5 valores reais; a tradução para os 8 status "de vitrine" é feita em `venancio-ai-ops/src/utils/statusDerivado.js` — **não mexer nisso, não duplicar essa lógica**.
5. O prompt de design das telas do app (se ainda estiver salvo no histórico/scratchpad da conversa anterior) — ele descreve o comportamento-alvo em detalhe (prioridade imediata vs. agendada, checklist, chat interno vinculado à solicitação, separação rápida como exceção visual). Use-o como especificação funcional, mesmo construindo só o backend + telas web agora.

## O gap real a resolver

O que existe hoje (Ficha de Separação) é um modelo **informal, sem delegação real**: o operador escolhe um responsável num dropdown, o "responsável" nunca loga em lugar nenhum, não há fila, não há chat, não há prioridade, não há notificação. O que o app mobile vai precisar é um modelo **de solicitação rastreável**:

- Operador cria uma **solicitação de separação** vinculada a um pedido, escolhendo o Separador, a prioridade (`imediata` | `agendada`) e, se agendada, o horário de retirada.
- O Separador **precisa logar** (código de funcionário + PIN de 6 dígitos) para ver só as solicitações dele — isso é autenticação nova, porque `funcionarios` hoje não tem nenhuma.
- Status da solicitação evolui `pendente → em_andamento → pronta`, em tempo real, visível tanto para quem delegou quanto para quem separa.
- Chat interno **por solicitação** (não um chat geral).
- "Separação Rápida": operador separa ele mesmo (pedido pequeno, até 7 itens, prioridade imediata) — deve gerar o mesmo tipo de registro rastreável, só que autoatribuído, não bypassar a trilha de auditoria.
- Notificações internas (push, mais tarde; por enquanto, pelo menos os eventos gravados de forma consultável) para 4 eventos: solicitação delegada, separação concluída, nova mensagem no chat, tarefa agendada vencendo.

Decida você a forma exata de autenticação do Separador (PIN sobre `funcionarios`, ou uma tabela nova, ou Supabase Auth com e-mail sintético) — mas justifique a escolha considerando que: (a) não pode reusar sem adaptação o padrão de `operadores` porque separadores não têm e-mail; (b) qualquer mecanismo de PIN precisa de hash (nunca PIN em texto plano no banco) e de rate limit contra força bruta, seguindo o mesmo espírito do rate limiting já aplicado no bot (`src/middlewares/rateLimiter.js`, achado item 9 da auditoria); (c) o reset de PIN é feito por um Operador administrativo, não self-service.

## O que construir

### 1. Schema Supabase (novo arquivo `extensao_separacao_delegada.sql`, idempotente, seguindo exatamente o padrão dos arquivos `extensao_*.sql` existentes — `create table if not exists`, `drop trigger if exists` antes de recriar, RLS com `eh_operador_ativo()`/`eh_admin()`/`service_role_full_access`)

- Autenticação/PIN do Separador (extensão de `funcionarios` ou tabela nova) — hash de PIN, código de funcionário único, controle de tentativas.
- `solicitacoes_separacao`: pedido_id, operador_delegante_id, separador_id, prioridade (`imediata`/`agendada`), horario_retirada (nullable, obrigatório se agendada), status (`pendente`/`em_andamento`/`pronta`/`cancelada`), tipo (`delegada`/`rapida` — para diferenciar a Separação Rápida da fila formal), timestamps.
- `solicitacoes_separacao_mensagens`: chat interno vinculado à solicitação (autor, papel do autor, texto, timestamp).
- Tabela de eventos/notificações internas (distinta de `notificacoes`, que é para o cliente) — pelo menos os 4 eventos do design. Se o mecanismo de push real (Expo push tokens) ficar fora de escopo por não termos o app ainda, deixe a tabela pronta para o app consumir depois e registre os eventos mesmo sem envio de push de fato.
- RPCs no mesmo espírito de `atribuir_responsavel_pedido` / `atualizar_status_pedido` — toda transição de status passa por função, nunca por UPDATE direto do client, para manter a trilha auditável. Pelo menos: criar solicitação (delegar), assumir/iniciar, marcar item separado, concluir separação, cancelar, enviar mensagem no chat.
- Realtime: garantir que as tabelas novas entram na publicação `supabase_realtime` (ver como as tabelas existentes já usadas por `usePedidos.js`/`useAtendimento.js` foram habilitadas) para status e chat atualizarem sem polling.

### 2. Telas web mínimas em `venancio-ai-ops` para testar o fluxo de ponta a ponta (reaproveitando o design system existente — `src/styles/main.css`, componentes de `src/components/ui/`, padrão de `src/services/*.service.js` com hooks de realtime em `src/hooks/`)

- Delegar separação (a partir de um pedido existente).
- Lista de solicitações com status ao vivo (visão do operador que delegou).
- Tela do Separador: login por código+PIN, lista de solicitações dele (imediata vs. agendada, visualmente distintas), checklist com checkbox por item, botão "Separação Pronta" habilitado só quando tudo marcado.
- Chat interno da solicitação, dos dois lados.
- Separação Rápida como fluxo visualmente diferenciado (não o caminho padrão), limitado a pedidos com até 7 itens.

Essas telas não precisam ser bonitas de verdade — precisam existir para provar que cada RPC/realtime funciona antes de qualquer app mobile ser escrito. Pode ser uma rota nova tipo `/separacao` sem entrar no menu principal se fizer sentido, mas sem quebrar nada do que já existe (`FichaSeparacaoPage.jsx` continua existindo e funcionando — não a remova nem a substitua, ela é um fluxo diferente que pode conviver com este).

### 3. Testes

Siga o padrão dos testes que já existem no bot (`chatbot/papelaria-bot/test/`) para as RPCs novas se houver camada de teste equivalente no lado Supabase/dashboard, ou pelo menos valide manualmente cada RPC via SQL Editor/console antes de considerar pronto, documentando o roteiro de teste manual usado.

## Como paralelizar com subagentes

Depois de ler os 4 arquivos de contexto acima e decidir o desenho do schema (isso é sequencial — não dá pra paralelizar a decisão de arquitetura), dispare subagentes em paralelo para as partes independentes:

- **Agente A (schema + RPCs + RLS + realtime)** — escreve o `extensao_separacao_delegada.sql` completo.
- **Agente B (autenticação do Separador)** — projeta e implementa o mecanismo de PIN (hash, rate limit, RPC de login) como parte do mesmo arquivo de schema ou um companheiro, coordenando com o Agente A no nome das tabelas/colunas antes de escrever (evite os dois inventarem nomes diferentes para a mesma coisa — combine o contrato antes de paralelizar a escrita).
- **Agente C (telas web de operador — delegar, acompanhar, separação rápida)** — só pode começar depois que o schema do Agente A estiver aplicado/estável, porque depende dos nomes reais de tabela/RPC.
- **Agente D (telas web de separador — login, checklist, chat)** — mesma dependência do Agente C, mas outra área do código, pode rodar em paralelo com C.

Depois de tudo escrito, rode você mesmo (não delegue) uma verificação final: aplique o SQL, teste o flufo completo (delegar → separador loga → assume → marca itens → conclui → chat trocado nos dois lados → separação rápida) e reporte o que funcionou e o que não.

## Restrições de segurança (não repetir os erros já documentados na auditoria)

- Nenhum PIN, senha ou segredo em texto plano — nem no banco, nem em código, nem em log.
- Nenhuma nova rota/webhook sem autenticação, se algo precisar ser exposto via bot/n8n.
- RLS de verdade em toda tabela nova — sem policy `anon` aberta (esse foi um erro real da linhagem de schema legada, item crítico da auditoria).
- Nenhuma credencial financeira ou documental de cliente aparece nesse fluxo — é operação interna de separação, mesma restrição do prompt de design das telas.
