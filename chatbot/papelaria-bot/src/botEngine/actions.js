// Ações reutilizáveis disparadas pelos estados do bot: notificar um humano,
// enviar um arquivo (ex.: PDF de lista de material) direto para o cliente,
// fechar um pedido de verdade (FINALIZAR_CADASTRO_E_PEDIDO) ou criar só um
// orçamento em rascunho pro Agente de Orçamento precificar em segundo plano
// (CRIAR_ORCAMENTO_LISTA_ESCOLAR). Os estados (botEngine/states/*) só
// descrevem a intenção da ação (função pura, sem I/O); é aqui que ela vira
// uma chamada real à Evolution API/Supabase/n8n.

const { resolverAlvo } = require('../config/notifyTargets');
const evolutionApi = require('../services/evolutionApi');
const clientesService = require('../services/clientesService');
const orcamentosService = require('../services/orcamentosService');
const conversasService = require('../services/conversasService');
const n8nClient = require('../integracoes/n8nClient');
const logger = require('../utils/logger');

const ROTULOS_TIPO_ORCAMENTO = {
  cotacao_empresa: 'Cotação para empresa',
  lista_escolar: 'Lista escolar',
  venda_geral: 'Venda geral',
};

const ROTULOS_INDICADOR_IE = { contribuinte: 'Contribuinte', isento: 'Isento', nao_contribuinte: 'Não contribuinte' };

function montarMensagemNotificacao(cliente, acao) {
  const linhas = [
    'Novo contato pelo bot da Venâncio:',
    `Cliente: ${cliente.nome || 'sem nome'} (${cliente.telefone})`,
  ];

  if (acao.dados?.intencao) linhas.push(`Assunto: ${acao.dados.intencao}`);
  if (acao.dados?.escola) linhas.push(`Escola: ${acao.dados.escola}`);
  if (acao.dados?.ano) linhas.push(`Ano/série: ${acao.dados.ano}`);
  if (acao.dados?.periodo) linhas.push(`Período: ${acao.dados.periodo}`);
  if (acao.dados?.itens) linhas.push(`Itens:\n${acao.dados.itens}`);
  if (acao.dados?.observacao) linhas.push(`Observação: ${acao.dados.observacao}`);
  if (acao.dados?.materialEnviadoAutomaticamente) {
    linhas.push('(o PDF da lista já foi enviado automaticamente pro cliente)');
  }

  return linhas.join('\n');
}

async function notificarHumano(acao, cliente) {
  const telefoneDestino = await resolverAlvo(acao.alvo);
  if (!telefoneDestino) {
    logger.erro(`Nenhum telefone configurado para o alvo de notificação "${acao.alvo}"`);
    return;
  }

  await evolutionApi.enviarTexto(telefoneDestino, montarMensagemNotificacao(cliente, acao));
}

async function enviarArquivoParaCliente(acao, cliente) {
  const { caminhoArquivo, nomeArquivo } = acao.dados;
  await evolutionApi.enviarArquivo(cliente.telefone, caminhoArquivo, nomeArquivo);
}

function mensagemConfirmacaoProtocolo(protocolo) {
  return `Pedido confirmado! Seu protocolo é *${protocolo}*. `
    + 'Em breve mandamos o orçamento certinho por aqui. Qualquer dúvida, é só chamar.';
}

// Monta a mensagem pro grupo de vendas com tudo pronto pro operador copiar no
// Shop Control — o bot não valida nem busca esses dados lá, só repassa.
function mensagemDadosFiscaisProOperador(cliente, cadastroFiscal, origemOrcamento, pedido) {
  const linhas = [
    'Novo pedido confirmado pelo bot (cadastro fiscal pronto pro Shop Control):',
    `Cliente: ${cliente.nome || 'sem nome'} (${cliente.telefone})`,
    `Protocolo do pedido: ${pedido.protocolo}`,
    `Tipo: ${ROTULOS_TIPO_ORCAMENTO[origemOrcamento.tipo] || origemOrcamento.tipo}`,
  ];

  if (!cadastroFiscal) {
    linhas.push('Cadastro fiscal: cliente recorrente, dados já cadastrados no sistema.');
  } else if (cadastroFiscal.tem_cadastro_previo) {
    linhas.push(`Cadastro fiscal: cliente informou que já tem cadastro (CPF/CNPJ: ${cadastroFiscal.cpf || cadastroFiscal.cnpj}).`);
  } else {
    linhas.push('--- Dados fiscais ---');
    linhas.push(`Tipo de pessoa: ${cadastroFiscal.tipo_pessoa}`);
    if (cadastroFiscal.cpf) linhas.push(`CPF: ${cadastroFiscal.cpf}`);
    if (cadastroFiscal.cnpj) linhas.push(`CNPJ: ${cadastroFiscal.cnpj}`);
    if (cadastroFiscal.razao_social) linhas.push(`Razão Social: ${cadastroFiscal.razao_social}`);
    if (cadastroFiscal.nome_fantasia) linhas.push(`Nome Fantasia: ${cadastroFiscal.nome_fantasia}`);
    if (cadastroFiscal.indicador_ie) linhas.push(`Indicador IE: ${ROTULOS_INDICADOR_IE[cadastroFiscal.indicador_ie] || cadastroFiscal.indicador_ie}`);
    if (cadastroFiscal.inscricao_estadual) linhas.push(`Inscrição Estadual: ${cadastroFiscal.inscricao_estadual}`);
    if (cadastroFiscal.cep) linhas.push(`CEP: ${cadastroFiscal.cep}`);
    if (cadastroFiscal.endereco) linhas.push(`Endereço: ${cadastroFiscal.endereco}`);
    if (cadastroFiscal.cidade) linhas.push(`Cidade: ${cadastroFiscal.cidade}`);
    if (cadastroFiscal.estado) linhas.push(`Estado: ${cadastroFiscal.estado}`);
    if (cadastroFiscal.nome) linhas.push(`Nome: ${cadastroFiscal.nome}`);
    if (cadastroFiscal.telefone_contato) linhas.push(`Telefone de contato: ${cadastroFiscal.telefone_contato}`);
  }

  linhas.push('--- Pedido ---');
  linhas.push(`Itens:\n${origemOrcamento.itensTexto}`);
  if (origemOrcamento.observacoes) linhas.push(`Observações: ${origemOrcamento.observacoes}`);

  return linhas.join('\n');
}

// Se criar/aceitar o orçamento falhar (banco fora do ar, transição inválida
// etc.), o cliente já viu "Perfeito! Já estou confirmando seu pedido...". A
// mensagem "Perfeito! Já estou confirmando..." é enviada pelo webhookController
// antes desta função ser chamada (desde a correção de A7 em 2026-07-30), e,
// sem o tratamento abaixo, o cliente nunca mais ouviria falar do pedido de
// novo — visto em produção em 20/07 (orçamento ficava órfão em 'rascunho',
// cliente sem confirmação nem erro).
function mensagemFalhaFechamento(cliente, origemOrcamento, cadastroFiscal) {
  const linhas = [
    'FALHA ao confirmar pedido pelo bot — precisa de atenção manual:',
    `Cliente: ${cliente.nome || 'sem nome'} (${cliente.telefone})`,
    `Tipo: ${ROTULOS_TIPO_ORCAMENTO[origemOrcamento.tipo] || origemOrcamento.tipo}`,
    `Itens:\n${origemOrcamento.itensTexto}`,
  ];

  if (origemOrcamento.observacoes) linhas.push(`Observações: ${origemOrcamento.observacoes}`);
  if (cadastroFiscal) linhas.push('(cadastro fiscal foi coletado nesta conversa — conferir no Supabase antes de pedir de novo)');

  return linhas.join('\n');
}

// Roda uma etapa best-effort (mandar uma mensagem, chamar o n8n) sem deixar
// a falha dela derrubar as etapas seguintes. Antes desta função, um blip de
// rede na PRIMEIRA mensagem (ex.: confirmação pro cliente) lançava e abortava
// a função inteira — Vanessa nunca era avisada e o Agente de Orçamento nunca
// era acionado, mesmo com o pedido já criado e aceito no banco (visto em
// teste real em 22/07: ECONNRESET na confirmação ao cliente calou as duas
// notificações seguintes sem nenhum aviso).
async function rodarEtapaBestEffort(descricaoErro, cliente, etapa) {
  try {
    await etapa();
  } catch (erro) {
    logger.erro(`${descricaoErro} (cliente ${cliente.telefone})`, erro);
  }
}

// Mensagem pro grupo de vendas quando a lista escolar de "outra escola" (fora
// do catálogo) já virou um orçamento em rascunho — ver criarOrcamentoListaEscolar.
function mensagemNovoOrcamentoListaEscolar(cliente, orcamento, origemOrcamento) {
  const linhas = [
    'Nova lista escolar (escola fora do catálogo) virou orçamento pelo bot:',
    `Cliente: ${cliente.nome || 'sem nome'} (${cliente.telefone})`,
    `Protocolo do orçamento: ${orcamento.protocolo}`,
    `Itens:\n${origemOrcamento.itensTexto}`,
  ];

  if (origemOrcamento.observacoes) linhas.push(`Observações: ${origemOrcamento.observacoes}`);
  linhas.push('(o Agente de Orçamento já foi acionado pra calcular os preços)');

  return linhas.join('\n');
}

function mensagemFalhaOrcamentoListaEscolar(cliente, origemOrcamento) {
  const linhas = [
    'FALHA ao criar orçamento de lista escolar (escola fora do catálogo) pelo bot — precisa de atenção manual:',
    `Cliente: ${cliente.nome || 'sem nome'} (${cliente.telefone})`,
    `Itens:\n${origemOrcamento.itensTexto}`,
  ];

  if (origemOrcamento.observacoes) linhas.push(`Observações: ${origemOrcamento.observacoes}`);

  return linhas.join('\n');
}

// Lista escolar de "outra escola" (fora do catálogo, ver
// src/botEngine/states/listaEscolar.js): cria só o ORÇAMENTO (fica em
// 'rascunho', nunca vira pedido aqui) e dispara o Agente de Orçamento no n8n
// pra precificar em segundo plano. Sem cadastro fiscal, sem pergunta de
// entrega/endereço — isso tudo é responsabilidade do Agente de Vendas quando
// o cliente voltar a falar (ferramenta "Fechar Orçamento" já existente no
// n8n, com a regra dos R$100 e tudo). A pausa no fim (pausarPosPedido) é o
// que garante essa retomada: o orçamento nasce em 'rascunho', que
// orcamento_ativo_cliente já trata como "ativo" — quando o cliente volta a
// falar, reativacaoBot.garantirBotAtivo detecta o gatilho e o
// webhookController manda a mensagem direto pro Agente de Vendas em vez do
// menu principal (mesmo mecanismo de finalizarCadastroEPedido, sem pedido
// nenhum aqui).
async function criarOrcamentoListaEscolar(acao, cliente, conversaId) {
  const { origemOrcamento } = acao.dados;
  let orcamento;

  try {
    orcamento = await orcamentosService.criarOrcamentoComItens({ clienteId: cliente.id, conversaId, ...origemOrcamento });
  } catch (erro) {
    logger.erro(`Falha ao criar orçamento de lista escolar do cliente ${cliente.telefone}`, erro);
    await rodarEtapaBestEffort('Falha ao avisar vendas sobre falha ao criar orçamento de lista escolar', cliente, async () => evolutionApi.enviarTexto(
      await resolverAlvo('vendas'),
      mensagemFalhaOrcamentoListaEscolar(cliente, origemOrcamento)
    ));
    return;
  }

  await rodarEtapaBestEffort('Falha ao notificar vendas sobre o novo orçamento de lista escolar', cliente, async () => evolutionApi.enviarTexto(
    await resolverAlvo('vendas'),
    mensagemNovoOrcamentoListaEscolar(cliente, orcamento, origemOrcamento)
  ));

  await rodarEtapaBestEffort('Falha ao notificar o Agente de Orçamento', cliente, () => n8nClient.notificarAgenteOrcamento({
    cliente_id: cliente.id,
    orcamento_id: orcamento.id,
    protocolo: orcamento.protocolo,
    tipo: origemOrcamento.tipo,
    payload: { itens: origemOrcamento.itensTexto, observacoes: origemOrcamento.observacoes },
  }));

  await rodarEtapaBestEffort('Falha ao pausar o bot após criar o orçamento da lista escolar', cliente, () => conversasService.pausarPosPedido(conversaId));
}

// Fecha o ciclo do cadastro fiscal (ver src/botEngine/states/cadastroFiscal.js):
// grava o cadastro fiscal coletado (quando houver), cria o orçamento com os
// itens, aceita direto (vira pedido) e avisa cliente + grupo de vendas.
// Best-effort com o Agente de Orçamento no n8n — não deve travar a confirmação
// ao cliente, que já foi enviada antes dessa chamada.
async function finalizarCadastroEPedido(acao, cliente, conversaId) {
  const { origemOrcamento, cadastroFiscal } = acao.dados;
  let orcamento;
  let pedido;

  try {
    if (cadastroFiscal) {
      await clientesService.atualizarCadastroFiscal(cliente.id, cadastroFiscal);
    }
    orcamento = await orcamentosService.criarOrcamentoComItens({ clienteId: cliente.id, conversaId, ...origemOrcamento });
    pedido = await orcamentosService.aceitarOrcamento(orcamento.id, 'js_bot');
  } catch (erro) {
    logger.erro(`Falha ao criar/aceitar orçamento do cliente ${cliente.telefone}`, erro);
    await rodarEtapaBestEffort('Falha ao avisar cliente sobre problema técnico no pedido', cliente, () => evolutionApi.enviarTexto(
      cliente.telefone,
      'Tivemos um problema técnico ao confirmar seu pedido. Já avisamos nossa equipe e já já te retornamos — não precisa refazer nada.'
    ));
    await rodarEtapaBestEffort('Falha ao avisar vendas sobre problema técnico no pedido', cliente, async () => evolutionApi.enviarTexto(
      await resolverAlvo('vendas'),
      mensagemFalhaFechamento(cliente, origemOrcamento, cadastroFiscal)
    ));
    return;
  }

  await rodarEtapaBestEffort('Falha ao enviar confirmação de protocolo ao cliente', cliente, () => evolutionApi.enviarTexto(
    cliente.telefone,
    mensagemConfirmacaoProtocolo(pedido.protocolo)
  ));

  await rodarEtapaBestEffort('Falha ao notificar vendas sobre o pedido fechado', cliente, async () => evolutionApi.enviarTexto(
    await resolverAlvo('vendas'),
    mensagemDadosFiscaisProOperador(cliente, cadastroFiscal, origemOrcamento, pedido)
  ));

  await rodarEtapaBestEffort('Falha ao notificar o Agente de Orçamento', cliente, () => n8nClient.notificarAgenteOrcamento({
    cliente_id: cliente.id,
    orcamento_id: orcamento.id,
    protocolo: orcamento.protocolo,
    tipo: origemOrcamento.tipo,
    payload: { itens: origemOrcamento.itensTexto, observacoes: origemOrcamento.observacoes },
  }));

  // Pausa automática pós-pedido: com o pedido já criado, o bot silencia esta
  // conversa até o cliente voltar a falar — aí reativa na hora e cai no Agente
  // de Vendas com o contexto do pedido (ver reativacaoBot.garantirBotAtivo e
  // webhookController.receberWebhook). Best-effort: uma falha aqui não desfaz o
  // pedido nem as notificações já enviadas acima.
  await rodarEtapaBestEffort('Falha ao pausar o bot após o pedido', cliente, () => conversasService.pausarPosPedido(conversaId));
}

const EXECUTORES_POR_TIPO = {
  NOTIFICAR_HUMANO: notificarHumano,
  ENVIAR_ARQUIVO: enviarArquivoParaCliente,
  FINALIZAR_CADASTRO_E_PEDIDO: finalizarCadastroEPedido,
  CRIAR_ORCAMENTO_LISTA_ESCOLAR: criarOrcamentoListaEscolar,
};

async function executarAcoes(acoes, cliente, conversaId) {
  for (const acao of acoes) {
    const executor = EXECUTORES_POR_TIPO[acao.tipo];

    if (!executor) {
      logger.aviso(`Ação desconhecida ignorada: ${acao.tipo}`);
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop -- ações são poucas e sequenciais, sem necessidade de paralelismo
      await executor(acao, cliente, conversaId);
    } catch (erro) {
      logger.erro(`Falha ao executar ação "${acao.tipo}" para o cliente ${cliente.telefone}`, erro);
    }
  }
}

module.exports = { executarAcoes };
