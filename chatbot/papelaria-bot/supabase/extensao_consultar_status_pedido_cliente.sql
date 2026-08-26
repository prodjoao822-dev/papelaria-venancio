-- Tool "Consultar Status do Pedido" do Agente de Vendas (n8n, workflow "Agente
-- vendedor") — resolve o gap descoberto em 22/08: o agente não tinha como
-- responder "está pronto?"/"cadê meu pedido?" durante o atendimento, porque
-- nenhuma ferramenta consultava o pedido em andamento do cliente.
--
-- Devolve o pedido mais recente do cliente já com uma frase pronta em
-- português natural (não o enum cru de `pedidos.status`) — mesmo motivo de
-- `templates_mensagem` no workflow "Notificação Status Pedido (WhatsApp)":
-- nunca expor vocabulário interno (status_pedido, forma_entrega) pro
-- agente/cliente traduzir sozinho, arriscando inconsistência ou vazamento de
-- termo técnico (o prompt do Agente de Vendas já proíbe isso explicitamente).
--
-- Não é SECURITY DEFINER de propósito — mesmo padrão de pedido_ativo_cliente()
-- e buscar_produto_fuzzy() (squemanovo.sql / extensao_fuzzy_produtos): quem
-- chama (bot/n8n) já usa a service_role key, que bypassa RLS sozinha.
create or replace function consultar_status_pedido_cliente(p_cliente_id uuid)
returns table(protocolo text, status_mensagem text, forma_entrega text, criado_em timestamptz)
language sql
stable
as $$
  select
    p.protocolo,
    case
      when p.status = 'confirmado' then 'Recebemos o pedido e já estamos preparando tudo.'
      when p.status = 'em_separacao' then 'O pedido está sendo separado pela nossa equipe agora.'
      when p.status = 'pronto' and p.forma_entrega = 'retirada' and p.pronto_para_retirada_em is not null then 'O pedido já está separado e pronto para retirada na loja!'
      when p.status = 'pronto' and p.forma_entrega <> 'retirada' and p.saiu_para_entrega_em is not null then 'O pedido já saiu para entrega.'
      when p.status = 'pronto' then 'O pedido já foi separado e está pronto pra despacho.'
      when p.status = 'concluido' then 'Esse pedido já foi finalizado.'
      when p.status = 'cancelado' then 'Esse pedido foi cancelado.'
      else 'Não consegui identificar o status certo agora.'
    end as status_mensagem,
    p.forma_entrega,
    p.criado_em
  from pedidos p
  where p.cliente_id = p_cliente_id
  order by p.criado_em desc
  limit 1;
$$;
