-- =====================================================================
-- VENÂNCIO AGENTES DE IA — Extensão de cadastro fiscal
-- =====================================================================
-- Roda depois de squemanovo.sql. Idempotente (seguro rodar mais de uma vez).
--
-- Adiciona em `clientes` os campos que o fluxo de cadastro fiscal do JS Bot
-- coleta (src/botEngine/states/cadastroFiscal.js) antes de qualquer
-- orçamento virar pedido, e a função `cliente_tem_cadastro_completo()` que
-- decide se esse fluxo pode ser pulado pra um cliente recorrente.
--
-- `cnpj`, `razao_social`, `tipo_pessoa` e `endereco` já existem em
-- squemanovo.sql — não são repetidos aqui. `endereco` guarda a string
-- agrupada "rua, número, complemento, bairro" (não vira colunas separadas).
-- =====================================================================

alter table clientes
  add column if not exists tem_cadastro_previo boolean not null default false,
  add column if not exists cpf text,
  add column if not exists nome_fantasia text,
  add column if not exists indicador_ie text,
  add column if not exists inscricao_estadual text,
  add column if not exists cep text,
  add column if not exists cidade text,
  add column if not exists estado text,
  add column if not exists telefone_contato text;

alter table clientes drop constraint if exists chk_indicador_ie_valido;
alter table clientes add constraint chk_indicador_ie_valido check (
  indicador_ie is null or indicador_ie in ('contribuinte', 'isento', 'nao_contribuinte')
);


-- Decide se o cliente já tem identidade fiscal suficiente pra pular o
-- formulário de cadastro fiscal e ir direto pro fechamento do pedido.
-- Propositalmente NÃO considera endereço/CEP: esses dados são pedidos de
-- novo a cada pedido (retirada na loja vs. entrega pode mudar), então nunca
-- entram no critério de "cadastro completo".
create or replace function cliente_tem_cadastro_completo(p_cliente_id uuid)
returns boolean as $$
  select case
    when tem_cadastro_previo then (cpf is not null or cnpj is not null)
    when tipo_pessoa = 'PF' then cpf is not null
    when tipo_pessoa = 'PJ' then
      cnpj is not null and razao_social is not null and indicador_ie is not null
      and (indicador_ie <> 'contribuinte' or inscricao_estadual is not null)
    else false
  end
  from clientes where id = p_cliente_id;
$$ language sql stable;


-- =====================================================================
-- Correção: rascunho -> aceito precisa ser uma transição direta válida
-- =====================================================================
-- squemanovo.sql só permitia 'rascunho' -> 'enviado'/'recusado', pensado pro
-- fluxo em que o Agente de Orçamento (n8n) manda o orçamento pro cliente
-- revisar antes de aceitar. Mas o fechamento do JS Bot (actions.js,
-- finalizarCadastroEPedido) cria o orçamento e chama aceitar_orcamento() na
-- hora, sem passar por "enviado" — o cliente já topou ao terminar o fluxo de
-- cadastro fiscal. Sem essa transição liberada, todo fechamento pelo JS Bot
-- falhava com "Transição de orçamento inválida: rascunho -> aceito" (visto em
-- produção em 20/07) e o orçamento ficava órfão em 'rascunho', sem virar pedido.
-- ⚠️ ATENÇÃO — 2026-07-30: Esta versão foi a correção do incidente de 20/07.
-- A versão canônica definitiva foi movida para correcoes_criticas.sql.
-- Este arquivo ainda é necessário para os campos fiscais de clientes.
create or replace function atualizar_status_orcamento(
  p_orcamento_id uuid,
  p_novo_status status_orcamento,
  p_origem text
)
returns orcamentos as $$
declare
  v_orc orcamentos;
  v_atual status_orcamento;
  v_permitido boolean;
begin
  select * into v_orc from orcamentos where id = p_orcamento_id for update;
  if not found then
    raise exception 'Orçamento % não encontrado', p_orcamento_id;
  end if;

  v_atual := v_orc.status;
  v_permitido := case v_atual
    when 'rascunho' then p_novo_status in ('enviado', 'recusado', 'aceito')
    when 'enviado'  then p_novo_status in ('aceito', 'recusado', 'expirado')
    else false
  end;

  if not v_permitido then
    raise exception 'Transição de orçamento inválida: % -> %', v_atual, p_novo_status;
  end if;

  update orcamentos set status = p_novo_status where id = p_orcamento_id;
  insert into orcamentos_status_historico (orcamento_id, status_anterior, status_novo, origem)
  values (p_orcamento_id, v_atual, p_novo_status, p_origem);

  select * into v_orc from orcamentos where id = p_orcamento_id;
  return v_orc;
end;
$$ language plpgsql;
