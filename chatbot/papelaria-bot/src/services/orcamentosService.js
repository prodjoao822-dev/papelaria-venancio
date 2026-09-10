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

// Divide o texto livre de itens em itens individuais. O caminho normal é uma
// linha por item (é o que o bot pede). Mas cliente real costuma colar a lista
// inteira de um PDF numa mensagem só, SEM quebra de linha nenhuma — aí o
// `.split('\n')` antigo devolvia a lista toda como UM item só, o Agente de
// Orçamento (n8n) casava esse blob gigante com um produto qualquer de
// similaridade baixa e fechava o pedido com um valor completamente errado
// (incidente real PED-2026-0270, 08/09/2026: ~30 itens viraram "2x 1 caderno
// R$23,98"). Aqui a gente tenta reconhecer os limites de item por outros sinais.
function segmentarItens(itensTexto) {
  const texto = (itensTexto || '').trim();
  if (!texto) return [];

  // 1) Tem quebra de linha? Ela é o separador — respeita o que o cliente fez.
  if (texto.includes('\n')) return texto.split('\n');

  // 2) Linha única. (a) Prefixo de quantidade com zero à esquerda ("01 ",
  //    "02 ", "04 ") é o formato clássico de lista escolar copiada de PDF, e
  //    zero à esquerda praticamente nunca aparece no meio da descrição de um
  //    item ("500 folhas", "180g", "111 peças" não têm zero à esquerda), então
  //    é um limite de item confiável. Corta ANTES de cada "0N " seguido de letra.
  const porQuantidadeComZero = texto
    .split(/(?=\b0\d{1,2}\s+[A-Za-zÀ-ÿ])/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (porQuantidadeComZero.length >= 2) return porQuantidadeComZero;

  // 2b) Vírgula ou ponto-e-vírgula separando itens ("2 cadernos, 3 canetas").
  if (/[,;]/.test(texto)) {
    const porPontuacao = texto.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
    if (porPontuacao.length >= 2) return porPontuacao;
  }

  // 3) Não deu pra separar com confiança — devolve como um item só. O Agente
  //    de Orçamento (n8n) tem uma trava de tamanho que joga itens longos
  //    demais pra precificação manual em vez de chutar um preço.
  return [texto];
}

// Quebra o texto livre de itens em linhas de itens_orcamento. Sem produto/preço:
// quem precifica é o Agente de Orçamento no n8n a partir do protocolo criado aqui.
function itensDeTexto(itensTexto) {
  return segmentarItens(itensTexto)
    .map((linha) => linha.trim())
    .filter(Boolean)
    .map(itemDeLinha);
}

// Antes, esta função fazia 2 chamadas Supabase separadas (insert em `orcamentos`
// e depois insert em `itens_orcamento`) sem transação: uma falha na segunda
// deixava o orçamento órfão, sem nenhum item (achado M2 do diagnóstico de
// 30/07/2026). Agora chama a RPC `criar_orcamento_com_itens_tx`
// (supabase/correcoes_criticas.sql), que faz as duas inserções na mesma
// transação PL/pgSQL — ou cria orçamento + itens juntos, ou nenhum dos dois.
async function criarOrcamentoComItens({ clienteId, conversaId, tipo, escolaId, itensTexto, observacoes }) {
  const itensJson = itensDeTexto(itensTexto).map((item) => ({
    produto_id: item.produto_id || null,
    descricao_livre: item.descricao_livre || null,
    quantidade: item.quantidade,
    valor_unitario: item.valor_unitario || null,
  }));

  // `p_itens` vai como ARRAY, nunca como JSON.stringify(...). O supabase-js já
  // serializa o objeto inteiro de parâmetros pro corpo da requisição: mandar a
  // string aqui faz o parâmetro chegar no Postgres como um jsonb ESCALAR (uma
  // string JSON) em vez de array, e a função quebra em jsonb_array_length com
  // "cannot get array length of a scalar" (22023) — visto em teste real em
  // 08/08/2026, o cliente recebia "tivemos um problema técnico" no fim do fluxo.
  const { data: orcamento, error } = await supabase.rpc('criar_orcamento_com_itens_tx', {
    p_cliente_id: clienteId,
    p_conversa_id: conversaId || null,
    p_tipo: tipo,
    p_escola_id: escolaId || null,
    p_observacoes: observacoes || null,
    p_itens: itensJson,
  });

  if (error) {
    logger.erro(`Falha ao criar orçamento para o cliente ${clienteId}`, error);
    throw new Error(`Não foi possível criar o orçamento: ${error.message}`);
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
