# Análise dos arquivos de `PLANEJAMENTOS E IMPLEMENTAÇÕES/` — o que foi apagado e por quê

**Data:** 25/08/2026
**Status:** ✅ Limpeza já executada, a seu pedido. Este arquivo virou o **registro do que foi apagado e por quê**, caso precise lembrar depois.

**O que foi apagado (7 arquivos, tudo que já estava implementado/era só histórico):**
`DIAGNOSTICO_VENANCIO.md`, `IMPLEMENTACAO_VENANCIO.md`, `PROMPT_IMPLEMENTACAO_SEPARACAO.md`, `promptexecução.md`, `PROMPT_ESTRUTURA_APP_MOBILE.md`, `PROMPT_IMPLEMENTACAO_PRE_APP_MOBILE.md`, `PROMPT_HANDOFF_IMPLEMENTACAO.md`.

- Os 4 primeiros já estavam **versionados no git** — se um dia precisar reler algum, dá pra recuperar com `git log -- "PLANEJAMENTOS E IMPLEMENTAÇÕES/<nome do arquivo>"` (peça ajuda quando precisar, é simples).
- Os 3 últimos (`PROMPT_ESTRUTURA_APP_MOBILE.md`, `PROMPT_IMPLEMENTACAO_PRE_APP_MOBILE.md` e `PROMPT_HANDOFF_IMPLEMENTACAO.md`) **não estavam no git**, então por segurança eu guardei uma cópia de cada numa pasta temporária antes de apagar — se quiser uma cópia permanente de algum deles, é só pedir antes que essa pasta temporária seja limpa pelo sistema.
- Confirmei antes de apagar `PROMPT_IMPLEMENTACAO_PRE_APP_MOBILE.md` que o pedido dele (ligar o app do celular no banco de dados de verdade) **realmente foi concluído** — o app hoje já tem client Supabase real, `expo-secure-store` e serviços reais (`separacaoSeparador.service.js`, `separadorAuth.service.js`, `entregaEntregador.service.js`), sem pasta de mocks.
- **`PROMPT_HANDOFF_IMPLEMENTACAO.md` inicialmente fiquei em dúvida** (ele continha o ponto de segurança crítico da seção 3 abaixo — as 3 RPCs de orçamento acessíveis sem login). Isso foi **confirmado como resolvido de verdade em produção** (consulta direta ao banco: as 3 RPCs — `criar_orcamento_com_itens_tx`, `aceitar_orcamento`, `atualizar_status_orcamento` — não têm mais permissão de execução para `anon`, e a view `v_clientes_crm` não tem mais leitura liberada pra `anon`). Com isso confirmado, apaguei o arquivo também.

**O que ficou na pasta (4 arquivos — precisam de atenção real, nenhum é lixo):**
`PLANO_DEPLOY_DOCKER_ORACLE.md`, `PLANO_MESTRE_IMPLEMENTACAO.md`, `IMPLEMENTACAO_PROMPT05_VALIDACAO_VOLTA_AS_AULAS.md`, `RELATORIO_FASE3_TESTES_E2E_BOT.md`.

O resto deste arquivo (seções 1 a 6) é a análise original que embasou essa decisão — mantida como referência. **Nota:** a seção 3 abaixo, que fala do ponto de segurança em aberto, está desatualizada por causa da confirmação acima — pode ser lida só como histórico de como cheguei à decisão.

---

## 1. O que é cada arquivo, em uma linha

| Arquivo | Data | O que é | Pode apagar? |
|---|---|---|---|
| `DIAGNOSTICO_VENANCIO.md` | 30/07 | Um raio-x de bugs de "pedido sumindo/duplicando" | **Sim** — os bugs listados nele já foram corrigidos no mesmo dia (confirmado no arquivo seguinte) |
| `IMPLEMENTACAO_VENANCIO.md` | 03/08 | Atualização depois de uma sessão de testar o bot ao vivo pelo WhatsApp, corrigindo 14 bugs | **Sim** — é histórico, e o estado atual do projeto está descrito de forma mais completa e atualizada no Plano Mestre |
| `PLANO_DEPLOY_DOCKER_ORACLE.md` | 13/08 | O plano de como colocar o bot num servidor de verdade (hoje ele roda só no seu computador) | **Não apague ainda** — é um plano que **nunca foi executado**. Se apagar, perde a receita pronta pra quando for fazer o deploy |
| `PLANO_MESTRE_IMPLEMENTACAO.md` | 15/08 | O documento mais importante da pasta — mapa completo do projeto, lista de problemas por gravidade, plano de 8 fases | **Não apague** — é a fonte de verdade atual do projeto |
| `PROMPT_ESTRUTURA_APP_MOBILE.md` | (antes de 14/08) | Pedido original pra criar as telas do app do celular só com dados fictícios (sem ligar no banco de verdade ainda) | **Sim** — essa etapa já foi concluída, o app já existe |
| `PROMPT_HANDOFF_IMPLEMENTACAO.md` | 15/08 | Um "bilhete de passagem de turno" pra continuar o trabalho numa conversa nova, explicando como os agentes especializados (bot, banco, dashboard, etc.) deveriam se organizar | **Sim, com uma ressalva** — ver alerta de segurança na seção 3 antes de apagar |
| `PROMPT_IMPLEMENTACAO_PRE_APP_MOBILE.md` | 18/08 | Plano técnico detalhado pra ligar o app do celular no banco de dados de verdade (login real, dados reais, etc.) | **Provavelmente sim** — tudo indica que isso já foi feito (ver seção 4), mas não achei confirmação por escrito específica |
| `PROMPT_IMPLEMENTACAO_SEPARACAO.md` | (antes de 15/08) | Pedido original pra construir o sistema de "separar pedido" (operador delega, separador executa, chat interno) | **Sim** — já confirmado como pronto e funcionando no Plano Mestre |
| `promptexecução.md` | (mais antigo) | Um "modo de operação" genérico, tipo um manual de como a IA deveria se comportar como equipe (Tech Lead, Arquiteto, QA, etc.) | **Sim** — não fala de nenhuma tarefa específica do projeto, é só um estilo de trabalho que já foi substituído pelos agentes especializados de hoje |
| `RELATORIO_FASE3_TESTES_E2E_BOT.md` | 24/08 | Relatório que eu mesmo escrevi ontem sobre os testes automatizados que criei pro bot | **Não precisa apagar** — é recente e ainda relevante |

---

## 2. O que já está PRONTO (confirmado)

Juntando as informações de todos os arquivos, isso aqui já está funcionando de verdade, testado:

- **O bot do WhatsApp funciona de ponta a ponta**: cliente manda mensagem, cai no menu certo, consegue comprar (a IA busca produto, monta orçamento e fecha o pedido de verdade no banco).
- **Vários bugs graves de "pedido sumindo ou duplicando"** (do diagnóstico de 30/07) foram corrigidos.
- **14 bugs reais** encontrados testando ao vivo pelo WhatsApp (03/08) foram corrigidos, incluindo um grave: a IA às vezes dizia "pedido fechado!" pro cliente sem o pedido existir de verdade — isso foi bloqueado.
- **Sistema de separação de pedido** (operador escolhe quem separa, a pessoa recebe, marca os itens, conversa por chat interno) está pronto e com boas práticas de segurança no banco de dados.     
- **Login por código + PIN** para quem separa pedido e quem entrega — pronto.
- **Correção de uma falha de segurança** (24/08): 5 funções do banco que registravam "quem fez o quê" podiam ser enganadas — corrigido.
- **Fila de atendimento** (24/08, feature nova): quando o bot passa uma conversa pra um humano, agora tem uma aba mostrando quem está esperando, com alerta se acumular gente.
- **Meus testes automatizados** (ontem, 24/08): 231 testes cobrindo as principais rotas do bot, sem nenhuma falha.
- **Teste de carga** (24/08): o bot aguenta o movimento esperado de Volta às Aulas, mas tem um ponto de atenção real (ver seção 5).

---

## 3. 🔴 Ponto de atenção antes de apagar — não consegui confirmar

O `PLANO_MESTRE_IMPLEMENTACAO.md` (15/08) apontou como **prioridade máxima, "corrigir hoje"**: qualquer pessoa com a chave pública do site conseguia ler dados de clientes (nome, telefone, CPF/CNPJ, endereço) **sem login nenhum**, e também conseguia criar/aprovar pedidos falsos direto no banco, também sem login.

O `PROMPT_HANDOFF_IMPLEMENTACAO.md` (escrito depois, no mesmo dia ou logo após) diz que **metade da correção já tinha sido feita**, e dá o comando exato que faltava rodar para terminar de fechar essa brecha.

Eu tentei confirmar agora se esse comando final foi mesmo executado, mas a ferramenta que tenho disponível hoje não consegue checar essa permissão específica no banco. Nenhum dos arquivos mais recentes (24/08) menciona esse item especificamente — eles falam de uma correção parecida, mas em outras funções do banco (essa outra, essa sim, confirmada como corrigida).

**Recomendação:** antes de apagar `PLANO_MESTRE_IMPLEMENTACAO.md` e `PROMPT_HANDOFF_IMPLEMENTACAO.md`, peça para alguém confirmar diretamente no painel do Supabase (ou peça pro agente do banco de dados confirmar) se essas 3 permissões abaixo já foram removidas do acesso público:

- `aceitar_orcamento`
- `atualizar_status_orcamento`
- `criar_orcamento_com_itens_tx`

Se já foram removidas, pode apagar os dois arquivos tranquilo. Se ninguém souber confirmar, o mais seguro é resolver isso primeiro e só depois apagar — é o único item de "risco real de vazamento de dado de cliente" que apareceu em toda a pasta.

---

## 4. O que ainda FALTA fazer (pendências reais)

Isso é o que os documentos mais recentes ainda listam como não feito. Não é urgente pra hoje, mas vale ter essa lista em algum lugar (por exemplo, copiada pra um novo arquivo, ou pro seu gerenciador de tarefas) antes de apagar tudo:

1. **Colocar o bot num servidor de verdade** — hoje ele roda no computador. Já existe o plano pronto (`PLANO_DEPLOY_DOCKER_ORACLE.md`), só falta executar.
2. **O banco de dados de produção tem mais regras de segurança do que o que está guardado nos arquivos do projeto** — se algum dia precisar recriar o banco do zero usando só esses arquivos, ele sairia menos seguro do que o de hoje. Precisa exportar as regras que só existem no banco ao vivo para um arquivo.
3. **Rotacionar (trocar) a chave secreta que conecta o bot ao WhatsApp** — ela já apareceu em texto aberto num log uma vez. A empresa que hospeda essa conexão (Cloudfy) não permite trocar o valor facilmente; ficou registrado como risco aceito por enquanto.
4. **Mensagens que chegam muito rápido em sequência da mesma conversa podem sumir silenciosamente** — achado no teste de carga de ontem (24/08). O cliente não recebe erro nem resposta, a mensagem simplesmente não é processada. É o achado de maior risco real pra Volta às Aulas.
5. **O login do Operador (equipe de balcão) no painel ainda é por e-mail e senha**, diferente do Separador/Entregador que já usa código+PIN. A ideia era unificar, mas ainda não foi feito.
6. **Faltam duas funcionalidades que nunca chegaram a ser construídas**: "tarefas agendadas" e "lista de espera de produto".
7. **Notificação push no celular** (avisar o funcionário mesmo com o app fechado) — ainda não existe.
8. **Sem esteira automática de testes (CI)** — os testes existem e passam, mas ainda dependem de alguém rodar manualmente.

---

## 5. Acompanhamento simples da minha parte (testes, ontem)

Só pra fechar o quadro: os 231 testes automatizados que criei ontem cobrem o bot inteiro nas partes mais importantes (o menu, a passagem pro atendimento humano, receber áudio/foto/PDF, etc.) e todos passaram. O único achado de risco real veio do teste de carga (item 4 da lista acima, feito por outra parte do trabalho no mesmo dia) — vale resolver antes do pico de Volta às Aulas.

---

## 6. Recomendação final, resumida

- **Apague sem medo:** `DIAGNOSTICO_VENANCIO.md`, `IMPLEMENTACAO_VENANCIO.md`, `PROMPT_ESTRUTURA_APP_MOBILE.md`, `PROMPT_IMPLEMENTACAO_SEPARACAO.md`, `promptexecução.md`.
- **Apague depois de confirmar o ponto de segurança da seção 3:** `PROMPT_HANDOFF_IMPLEMENTACAO.md`.
- **Não apague ainda (são planos ainda não executados, sem substituto):** `PLANO_DEPLOY_DOCKER_ORACLE.md`, `PLANO_MESTRE_IMPLEMENTACAO.md`.
- **Provavelmente pode apagar, mas dê uma olhada rápida no app do celular antes pra confirmar que já usa dado real:** `PROMPT_IMPLEMENTACAO_PRE_APP_MOBILE.md`.
- **Mantenha (são recentes):** `IMPLEMENTACAO_PROMPT05_VALIDACAO_VOLTA_AS_AULAS.md`, `RELATORIO_FASE3_TESTES_E2E_BOT.md`, e este arquivo.
