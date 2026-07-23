// Operações de escrita/leitura em "orcamentos" e "itens_orcamento" do Supabase.
// A criação em si é uma inserção direta (orçamento nasce sempre em 'rascunho');
// toda transição de status depois disso passa pelas funções centrais do banco
// (atualizar_status_orcamento / aceitar_orcamento) — nunca por UPDATE direto,
// pra manter orcamentos_status_historico e a cópia pra itens_pedido consistentes.

const supabase = require('./supabaseClient');
const logger = require('../utils/logger');

// Clientes costumam digitar a lista com marcador ("- 2 evas", "* 2 evas"),
// que precisa sair ANTES de procurar a quantidade — senão "- 2 evas" não bate
// com REGEX_QUANTIDADE_NA_FRENTE (não começa com dígito) e o item inteiro
// (incluindo o "2") vira descrição com quantidade 1. Visto em teste real em
// 23/07: "- 2 evas" virou "1x - 2 evas" no orçamento, e o valor total saiu
// contando só 1 unidade em vez de 2.
const REGEX_MARCADOR_DE_LISTA = /^[-*•]\s*/;

// Se a linha (já sem marcador de lista) começar com um número (ex.: "2 papeis
// fotograficos", "3x lapis"), interpreta como a quantidade pedida e tira só
// esse prefixo da descrição — qualquer outro número no meio do texto (ex.:
// "500 folhas", "180g") continua fazendo parte da descrição, só o prefixo é
// quantidade. Sem isso, todo item nascia com quantidade 1 mesmo quando o
// cliente escrevia "2 papeis...", e o Agente de Orçamento (n8n) precificava
// certo por unidade mas o valor total do item saía errado (1x em vez de 2x)
// — visto em teste real em 22/07.
const REGEX_QUANTIDADE_NA_FRENTE = /^(\d+)\s*x?\s+(.+)$/i;

function itemDeLinha(linha) {
  const linhaSemMarcador = linha.replace(REGEX_MARCADOR_DE_LISTA, '');
  const match = linhaSemMarcador.match(REGEX_QUANTIDADE_NA_FRENTE);
  if (!match) {
    return { descricao_livre: linhaSemMarcador, quantidade: 1 };
  }
  return { descricao_livre: match[2], quantidade: Number(match[1]) };
}

// Quebra o texto livre de itens (uma linha por item, como o cliente digitou no
// WhatsApp) em linhas de itens_orcamento. Sem produto/preço: quem precifica é
// o Agente de Orçamento no n8n a partir do protocolo criado aqui.
function itensDeTexto(itensTexto) {
  return (itensTexto || '')
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean)
    .map(itemDeLinha);
}

async function criarOrcamentoComItens({ clienteId, conversaId, tipo, escolaId, itensTexto, observacoes }) {
  const { data: orcamento, error: erroOrcamento } = await supabase
    .from('orcamentos')
    .insert({
      cliente_id: clienteId,
      conversa_id: conversaId,
      tipo,
      escola_id: escolaId || null,
      observacoes: observacoes || null,
    })
    .select()
    .single();

  if (erroOrcamento) {
    logger.erro(`Falha ao criar orçamento para o cliente ${clienteId}`, erroOrcamento);
    throw new Error(`Não foi possível criar o orçamento: ${erroOrcamento.message}`);
  }

  const itens = itensDeTexto(itensTexto).map((item) => ({ ...item, orcamento_id: orcamento.id }));

  if (itens.length > 0) {
    const { error: erroItens } = await supabase.from('itens_orcamento').insert(itens);

    if (erroItens) {
      logger.erro(`Falha ao gravar itens do orçamento ${orcamento.id}`, erroItens);
      throw new Error(`Não foi possível gravar os itens do orçamento: ${erroItens.message}`);
    }
  }

  return orcamento;
}

async function aceitarOrcamento(orcamentoId, origem) {
  const { data, error } = await supabase.rpc('aceitar_orcamento', {
    p_orcamento_id: orcamentoId,
    p_origem: origem,
  });

  if (error) {
    logger.erro(`Falha ao aceitar o orçamento ${orcamentoId}`, error);
    throw new Error(`Não foi possível aceitar o orçamento ${orcamentoId}: ${error.message}`);
  }

  return data;
}

// Usado pelo callback do Agente de Orçamento (POST /webhook/agente-orcamento)
// pra descobrir a conversa dona do orçamento e gravar o log de auditoria lá —
// não faz parte de nenhum fluxo de transição de status.
async function buscarOrcamentoPorId(orcamentoId) {
  const { data, error } = await supabase
    .from('orcamentos')
    .select()
    .eq('id', orcamentoId)
    .maybeSingle();

  if (error) {
    logger.erro(`Falha ao buscar orçamento ${orcamentoId}`, error);
    throw new Error(`Não foi possível buscar o orçamento ${orcamentoId}: ${error.message}`);
  }

  return data;
}

async function atualizarStatusOrcamento(orcamentoId, novoStatus, origem) {
  const { data, error } = await supabase.rpc('atualizar_status_orcamento', {
    p_orcamento_id: orcamentoId,
    p_novo_status: novoStatus,
    p_origem: origem,
  });

  if (error) {
    logger.erro(`Falha ao atualizar status do orçamento ${orcamentoId} para ${novoStatus}`, error);
    throw new Error(`Não foi possível atualizar o orçamento ${orcamentoId}: ${error.message}`);
  }

  return data;
}

module.exports = {
  criarOrcamentoComItens,
  aceitarOrcamento,
  atualizarStatusOrcamento,
  buscarOrcamentoPorId,
  itensDeTexto,
};
