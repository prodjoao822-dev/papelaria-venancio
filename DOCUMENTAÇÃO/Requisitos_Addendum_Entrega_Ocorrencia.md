# Addendum aos Requisitos — Papel Entregador e Ocorrências

Complementa `Venancio_Documentacao_Requisitos.pdf` (v1.0, Agosto/2026). Documento vivo — igual ao PDF, revisar a cada nova fase.

**Decisão que este addendum registra:** a Seção 8 do PDF ("Decisões de Arquitetura") fixou deliberadamente **dois papéis** (Operador/Separador), tratando comportamento híbrido como regra de negócio (RN-01) em vez de estrutura de permissão. Essa decisão foi **revisitada e substituída** em 19/08/2026: o sistema passa a ter um **terceiro papel de primeira classe, Entregador**, com token/sessão e telas próprias — mesmo padrão já usado pelo Separador. Motivo: o desenho de fluxo (`Desenho arquitetual da estrutura de fluxo do pedido.excalidraw`) formaliza Entrega como uma etapa com fila operacional ativa (delegar → assumir → em rota → concluir/insucesso), o que exige estado consultável em tempo real — o mesmo motivo pelo qual Separação já é um subsistema próprio e não um metadado sobre `pedidos`. Tratar Entrega como "regra de negócio em cima do Operador" (like RN-01) não sustentaria isso.

## Contexto de negócio (Ocorrência)

Além do caso operacional (item faltante, endereço não encontrado, cliente ausente, produto avariado — problemas durante separação/entrega), Ocorrência cobre o caso de **pós-venda**: troca, devolução, produto errado. Esse segundo grupo é o mais crítico para o dono: precisa que a busca de pedido (lupa do dashboard) sempre encontre o cliente/pedido certo, para que uma troca possa ser processada contra o histórico real quando o cliente retorna à loja.

## Modelo de papéis (App Mobile)

Um único app (`app-mobile`), três telas por papel — não três apps separados. No login (código + PIN), o backend do bot resolve o papel do funcionário e devolve isso na sessão; o app roteia para a tela correspondente (Operador / Separador / Entregador), mesmo padrão de `separadorAuthController` generalizado para aceitar qualquer papel.

## Modelo de dados novo

### `solicitacoes_entrega` (espelha `solicitacoes_separacao`)
- `pedido_id`, `entregador_id`, `delegado_por_id` (operador)
- `status` enum: `pendente` | `em_rota` | `entregue` | `insucesso` | `cancelada`
- `endereco_entrega` (snapshot), `horario_previsto`
- `iniciada_em`, `concluida_em`, `cancelada_em`

### `ocorrencias`
- `pedido_id` (sempre), `solicitacao_separacao_id` / `solicitacao_entrega_id` (opcionais)
- `tipo` enum:
  - Operacionais: `item_faltante`, `endereco_nao_encontrado`, `cliente_ausente`, `produto_avariado`
  - Pós-venda: `troca`, `devolucao`, `produto_errado`
- `criado_por_id`, `status` (`aberta`/`resolvida`), `descricao`, `resolucao_texto`, `criado_em`, `resolvida_em`

### RPCs (todas resolvendo ator via `auth.uid()`/`funcionario_atual_id()`, nunca client-supplied)
`delegar_entrega`, `assumir_entrega`, `iniciar_rota`, `concluir_entrega`, `registrar_insucesso_entrega`, `cancelar_entrega`, `abrir_ocorrencia`, `resolver_ocorrencia`.

**Pré-requisito da Fase A:** corrigir o Bloqueador B1 (`atribuir_responsavel_pedido` e RPCs irmãs aceitam `p_operador_id`/`p_funcionario_id` do client em vez de resolver via `auth.uid()`) antes de generalizar o padrão — senão o fluxo de Entrega nasce com o mesmo furo de autorização (BOLA).

## Fases

**Fase A — Modelagem (banco).** Tabelas + RPCs acima + fix B1. Critério de aceite: RPCs testadas para os 3 papéis; nenhuma aceita id de ator do client; transições inválidas rejeitadas.

**Fase B — Dashboard (Operador).** Nova `LogisticaPage` lendo `solicitacoes_entrega`; tela de Ocorrências (abrir/resolver); botão "Delegar Entrega". Critério de aceite: Operador delega, acompanha em tempo real, resolve ocorrência.

**Fase C — App Mobile (Entregador).** Generalizar login/auth por papel; telas fila/detalhe/concluir/ocorrência/chat, reaproveitando infra do Separador. Critério de aceite: Entregador loga, vê fila real, conclui ou registra ocorrência, Operador vê em tempo real.

**Fase D — Timeline unificada (Evento).** View SQL unindo históricos existentes + eventos de entrega + ocorrências. Critério de aceite: detalhe do pedido mostra linha do tempo completa.

## Status de progresso

- [x] Fase A — banco (aplicado em produção 19/08/2026: `chatbot/papelaria-bot/supabase/extensao_entrega_ocorrencia.sql`). Bônus: já achamos e ligamos a tabela `eventos` (timeline), que já existia em produção mas não estava documentada nos arquivos lidos até então — isso adianta parte da Fase D.
- [x] Fase B — dashboard (LogisticaPage/OcorrenciasPage/PedidoModal; bug pré-existente de busca por nome de cliente corrigido no processo, afetava Header/Pedidos/Orçamentos também)
- [x] Fase C — app mobile (19/08/2026): login generalizado (`separador/login` aceita papel `entrega`, devolve `papeis`), tabs condicionais por papel, telas de fila/detalhe/ocorrência do Entregador. Sem chat de entrega (decisão consciente, sem tabela pra isso).
- [x] Fase D — timeline (19/08/2026): `eventosService.buscarPorPedido` + `TimelinePedido.jsx`, plugada no `PedidoModal.jsx` no lugar do histórico antigo (só status). Validado com dado real de produção: PED-2026-0128 mostra a cadeia completa orçamento→pedido→entrega→ocorrência num pedido que o próprio dono testou de ponta a ponta.

## Concluído

As 4 fases (A/B/C/D) estão prontas e validadas com dado real de produção (não só build/teste — o fluxo completo aconteceu de verdade: orçamento aceito → pedido confirmado → separado → pronto → entrega delegada a um Entregador real (Fabiano) → assumida → em rota → entregue → ocorrência de endereço aberta, tudo aparecendo na timeline). Pendências conhecidas, não bloqueadoras, para uma fase de polimento futura:
- `notificacoes_internas` (CHECK `operador`/`separador`) não foi estendido pra `entregador` — push notification pro Entregador ainda não existe, hoje ele depende de abrir o app e ver a fila via Realtime.
- `solicitacoes_separacao` não tem trigger pra `eventos` — a timeline não mostra eventos de separação (só pedido/orçamento/entrega/ocorrência).
- Policy de leitura de `operadores` não cobre funcionários — `delegado_por`/`ator` operador pode aparecer sem nome quando consultado pelo app do Entregador (dashboard não é afetado).
