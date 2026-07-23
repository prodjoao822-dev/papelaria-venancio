// Recebe as requisições do webhook da Evolution API, valida e encaminha o
// payload para o motor do bot (stateMachine), persistindo cliente/conversa no
// Supabase e enviando a resposta de volta pelo WhatsApp.

const { parsePayload } = require('./payloadParser');
const clientesService = require('../services/clientesService');
const conversasService = require('../services/conversasService');
const escolasService = require('../services/escolasService');
const pedidosService = require('../services/pedidosService');
const orcamentosService = require('../services/orcamentosService');
const mensagensService = require('../services/mensagensService');
const arquivosClienteService = require('../services/arquivosClienteService');
const evolutionApi = require('../services/evolutionApi');
const reativacaoBot = require('../middlewares/reativacaoBot');
const stateMachine = require('../botEngine/stateMachine');
const comandosGlobais = require('../botEngine/comandosGlobais');
const intencaoFechamento = require('../botEngine/intencaoFechamento');
const actions = require('../botEngine/actions');
const n8nClient = require('../integracoes/n8nClient');
const notifyTargets = require('../config/notifyTargets');
const analyticsService = require('../services/analyticsService');
const logger = require('../utils/logger');

const STATUS_PEDIDO_LEGIVEL = {
  confirmado: 'confirmado',
  em_separacao: 'em separação',
  pronto: 'pronto pra retirada/entrega',
};

const STATUS_ORCAMENTO_LEGIVEL = {
  rascunho: 'em elaboração',
  enviado: 'enviado, aguardando sua resposta',
};

// Estados a partir dos quais a próxima mensagem do bot pode ser a lista de
// escolas (dinâmica, vinda do Supabase). Pré-carregamos antes de chamar a
// stateMachine porque ela é uma função pura/síncrona e não faz I/O sozinha.
const ESTADOS_QUE_PODEM_PRECISAR_DE_ESCOLAS = ['SUBMENU_VENDAS', 'LISTA_ESCOLAR_ESCOLA'];

// Estados cuja próxima mensagem decide se o orçamento vira pedido direto (Passo
// 0 do cadastro fiscal, ver Claudeinstruções.md seção 4) ou se precisa entrar
// no formulário de cadastro fiscal. Mesma lógica de prefetch de acima: a
// checagem em si é I/O, então roda aqui antes de chamar a stateMachine pura.
const ESTADOS_QUE_PODEM_PRECISAR_DE_CADASTRO_COMPLETO = ['COTACAO_EMPRESA_OBSERVACAO', 'LISTA_ESCOLAR_OBSERVACAO'];

// Só detecta "quero fechar/pagar" nesses dois estados: são exatamente onde o
// cliente cai depois que um pedido/orçamento já foi confirmado (menu principal
// ou submenu de vendas). De propósito NÃO cobre estados de texto livre (cadastro
// fiscal, lista de itens, observação) — "pagar"/"fechar" ali é conteúdo real do
// passo, não uma pergunta sobre um pedido já existente.
const ESTADOS_QUE_DETECTAM_INTENCAO_DE_FECHAMENTO = [comandosGlobais.ESTADO_MENU_PRINCIPAL, 'SUBMENU_VENDAS'];

// Guarda, só em memória do processo, os mensagemId que já começaram a ser
// processados mas ainda não foram persistidos em `conversas.ultima_mensagem_id`.
// Cobre o caso que o dedup por coluna no banco não cobre sozinho: duas cópias
// do mesmo webhook (retry da Evolution API) chegando em paralelo antes da
// primeira terminar de escrever — sem isso, as duas liam o mesmo estado antigo
// e cada uma respondia/notificava por conta própria (ver ARCHITECTURE_REVIEW.md).
// Não protege contra múltiplas instâncias do processo rodando ao mesmo tempo;
// suficiente para o deploy de uma instância única deste projeto.
const mensagensEmProcessamento = new Set();

function chaveEmProcessamento(conversaId, mensagemId) {
  return `${conversaId}:${mensagemId}`;
}

// Enquanto a conversa está em AGENTE_VENDAS_ATIVO, mensagens em sequência do
// mesmo cliente podem chegar antes da consulta anterior terminar (sem
// debounce do lado do WhatsApp/Evolution API). Sem esse lock, cada uma
// dispararia uma chamada síncrona separada pro mesmo cliente (risco
// documentado no prompt de integração de webhooks de agentes). Só em memória
// do processo — mesma limitação de instância única já aceita pelo lock de
// `mensagensEmProcessamento` acima.
const conversasComAgenteVendasEmAndamento = new Set();

const MENSAGEM_FALLBACK_AGENTE_VENDAS = 'Desculpa a demora! Vou te conectar com nossa equipe agora, um momento.';
const MENSAGEM_CONFIRMACAO_PDF_RECEBIDO = 'Recebemos seu arquivo! Já encaminhamos pra nossa equipe de vendas dar uma olhada.';

// Captura genérica de PDF: independe do estado da conversa (não avança nem
// altera a máquina de estados) e roda mesmo com o bot pausado — o grupo de
// Vendas monitora essa notificação separada da conversa individual do
// cliente, então vale encaminhar mesmo quando um humano já assumiu o
// atendimento. Sem OCR/parsing: quem decide o que fazer com o conteúdo é a
// Vanessa/vendas, olhando o arquivo.
async function receberDocumentoPdf(mensagem, dadosBrutosWebhook, cliente, conversaId) {
  const midia = await evolutionApi.baixarMidia(dadosBrutosWebhook);
  if (!midia?.base64) {
    throw new Error('Evolution API não retornou o conteúdo em base64 do PDF recebido.');
  }

  const { nomeArquivo, legenda: legendaDoCliente } = mensagem.documentoPdf;
  const legenda = `PDF recebido de ${cliente.nome || 'cliente sem nome'} (${cliente.telefone})`
    + (legendaDoCliente ? `\nLegenda do cliente: ${legendaDoCliente}` : '');

  await evolutionApi.enviarDocumentoBase64(notifyTargets.vendas, midia.base64, nomeArquivo, legenda);
  await evolutionApi.enviarTexto(cliente.telefone, MENSAGEM_CONFIRMACAO_PDF_RECEBIDO);

  // Best-effort: o arquivo já foi encaminhado pra Vendas acima, então uma
  // falha só no arquivamento (cópia de auditoria) não deve virar um erro 500
  // pro webhook nem repetir os envios já feitos.
  try {
    const salvo = await arquivosClienteService.salvarPdfRecebido({
      clienteId: cliente.id,
      nomeArquivo,
      base64: midia.base64,
    });
    await mensagensService.registrarMensagem(
      conversaId,
      'cliente',
      `Enviou o PDF "${nomeArquivo}" (encaminhado pra vendas${salvo.url ? `; cópia: ${salvo.url}` : ''}).`
    );
  } catch (erroArquivamento) {
    logger.erro(
      `Falha ao arquivar no Storage o PDF recebido do cliente ${cliente.telefone} (já encaminhado pra vendas)`,
      erroArquivamento
    );
  }
}

async function montarSessao(conversa) {
  let dados = conversa.dados || {};

  if (ESTADOS_QUE_PODEM_PRECISAR_DE_ESCOLAS.includes(conversa.estado_atual) && !dados.escolas) {
    const escolas = await escolasService.listarEscolasAtivas();
    dados = { ...dados, escolas };
  }

  return { estado: conversa.estado_atual, dados };
}

// Leitura de identidade antes do menu (PRD, seção "Reforço"): sempre que a
// resposta pousa no menu principal (conversa nova, "0"/"menu"/"*", ou opção
// inválida que mantém o cliente lá), avisa — sem bloquear — se já existe um
// pedido ou orçamento em andamento, pra ele não perder o fio do que já estava
// tratando. Roda depois da stateMachine (pura) decidir o destino: é só uma
// anotação informativa na mensagem de saída, não influencia navegação.
async function anexarStatusPedidoAtivo(resposta, clienteId) {
  const pedido = await pedidosService.pedidoAtivoCliente(clienteId);
  if (pedido) {
    const status = STATUS_PEDIDO_LEGIVEL[pedido.status] || pedido.status;
    return `Você já tem um pedido em andamento: protocolo *${pedido.protocolo}* (${status}).\n\n${resposta}`;
  }

  const orcamento = await pedidosService.orcamentoAtivoCliente(clienteId);
  if (orcamento) {
    const status = STATUS_ORCAMENTO_LEGIVEL[orcamento.status] || orcamento.status;
    return `Você já tem um orçamento em andamento: protocolo *${orcamento.protocolo}* (${status}).\n\n${resposta}`;
  }

  return resposta;
}

// Chamada síncrona ao Agente de Vendas (n8n) com rede de segurança: nunca
// deixa o cliente sem resposta. Se der timeout/erro, avisa o cliente, notifica
// um humano com a mensagem pendente e pausa o bot pra essa conversa
// (reaproveita `reativacaoBot`, o mesmo mecanismo usado quando um humano
// assume manualmente pelo WhatsApp da loja) — pra Vanessa assumir sem o bot
// interferir. `estadoFinal` no retorno indica o próximo `estado_atual`:
// `null` quando falhou (mantém o estado atual, quem chama decide o fallback).
async function consultarAgenteVendasComRedeDeSeguranca(cliente, conversaId, texto) {
  if (conversasComAgenteVendasEmAndamento.has(conversaId)) {
    logger.aviso(
      `Mensagem pro Agente de Vendas ignorada: já há uma consulta em andamento pra conversa ${conversaId}.`
    );
    return { ignorado: true, estadoFinal: null };
  }

  conversasComAgenteVendasEmAndamento.add(conversaId);
  try {
    const respostaAgente = await n8nClient.consultarAgenteVendas({
      cliente_id: cliente.id,
      conversa_id: conversaId,
      telefone: cliente.telefone,
      texto,
    });

    if (!respostaAgente) {
      await evolutionApi.enviarTexto(cliente.telefone, MENSAGEM_FALLBACK_AGENTE_VENDAS);
      await actions.executarAcoes(
        [{
          tipo: 'NOTIFICAR_HUMANO',
          alvo: 'vendas',
          dados: { intencao: `Timeout/erro do Agente de Vendas — mensagem pendente do cliente: "${texto}"` },
        }],
        cliente,
        conversaId
      );
      await reativacaoBot.pausarBot(conversaId);
      return { ignorado: false, estadoFinal: null };
    }

    await evolutionApi.enviarTexto(cliente.telefone, respostaAgente.resposta);
    return {
      ignorado: false,
      estadoFinal: respostaAgente.encerrar_atendimento_ia ? 'SUBMENU_VENDAS' : 'AGENTE_VENDAS_ATIVO',
    };
  } finally {
    conversasComAgenteVendasEmAndamento.delete(conversaId);
  }
}

// Cliente já tem pedido/orçamento e pergunta sobre fechar/pagar (ver
// intencaoFechamento.js). Sem gateway de pagamento (fora de escopo do PRD): só
// confirma o protocolo pro cliente e aciona um humano de Vendas pra combinar a
// forma de pagamento. Devolve null quando não há nada ativo pro cliente — quem
// chama decide deixar a mensagem cair no fluxo normal nesse caso.
async function receberIntencaoFechamentoPedido(cliente, conversaId) {
  const pedido = await pedidosService.pedidoAtivoCliente(cliente.id);
  if (pedido) {
    const orcamento = await orcamentosService.buscarOrcamentoPorId(pedido.orcamento_id);
    const valor = orcamento?.valor_total ? ` no valor de R$ ${Number(orcamento.valor_total).toFixed(2)}` : '';

    await actions.executarAcoes(
      [{
        tipo: 'NOTIFICAR_HUMANO',
        alvo: 'vendas',
        dados: { intencao: `Cliente perguntou sobre pagamento/fechamento do pedido protocolo ${pedido.protocolo}` },
      }],
      cliente,
      conversaId
    );

    return `Seu pedido (protocolo *${pedido.protocolo}*) já está confirmado${valor}! `
      + 'Ainda não processamos pagamento por aqui — já avisei nossa equipe pra combinar '
      + 'com você a forma de pagamento.';
  }

  const orcamentoAtivo = await pedidosService.orcamentoAtivoCliente(cliente.id);
  if (orcamentoAtivo) {
    await actions.executarAcoes(
      [{
        tipo: 'NOTIFICAR_HUMANO',
        alvo: 'vendas',
        dados: {
          intencao: 'Cliente perguntou sobre fechamento/pagamento do orçamento protocolo '
            + `${orcamentoAtivo.protocolo} (ainda em elaboração)`,
        },
      }],
      cliente,
      conversaId
    );

    return `Seu orçamento (protocolo *${orcamentoAtivo.protocolo}*) ainda está sendo preparado pela nossa `
      + 'equipe — assim que ficar pronto, te mandamos o valor por aqui. Já avisei que você tá aguardando.';
  }

  return null;
}

async function receberWebhook(req, res) {
  // A Evolution API dispara vários tipos de evento (conexão, status de
  // mensagem, etc.); só nos interessa mensagem recebida/enviada.
  if (req.body?.event && req.body.event !== 'messages.upsert') {
    return res.status(200).json({ ignorado: true });
  }

  const mensagem = parsePayload(req.body);
  if (!mensagem || (mensagem.texto === null && !mensagem.documentoPdf)) {
    logger.info('Payload de webhook ignorado: não é uma mensagem de texto ou PDF reconhecível.', req.body);
    return res.status(200).json({ ignorado: true });
  }

  try {
    const cliente = await clientesService.upsertCliente(mensagem.telefone, mensagem.nome);
    const conversa = await conversasService.buscarOuCriarConversa(cliente.id);

    // A Evolution API pode reenviar o mesmo webhook (retry de rede, reinício
    // da instância etc.). Se já processamos essa mensagem por completo pra
    // esta conversa, não repetimos notificação humana, envio de PDF nem
    // resposta ao cliente.
    if (mensagem.mensagemId && conversa.ultima_mensagem_id === mensagem.mensagemId) {
      logger.info(
        `Webhook duplicado ignorado: mensagemId ${mensagem.mensagemId} já processado (conversa ${conversa.id}).`
      );
      return res.status(200).json({ ok: true, duplicado: true });
    }

    const chaveDuplicidade = mensagem.mensagemId ? chaveEmProcessamento(conversa.id, mensagem.mensagemId) : null;
    if (chaveDuplicidade && mensagensEmProcessamento.has(chaveDuplicidade)) {
      logger.info(
        `Webhook duplicado ignorado: mensagemId ${mensagem.mensagemId} ainda em processamento (conversa ${conversa.id}).`
      );
      return res.status(200).json({ ok: true, duplicado: true });
    }
    if (chaveDuplicidade) mensagensEmProcessamento.add(chaveDuplicidade);

    try {
      if (mensagem.fromMe) {
        // A Evolution API also echoes the bot's own replies back through este
        // mesmo webhook com fromMe:true (o WhatsApp não distingue "mandado pela
        // API" de "digitado à mão no app" — é a mesma sessão autenticada). Sem
        // filtrar o eco, o bot pausava a si mesmo a cada resposta sua.
        if (evolutionApi.foiEnviadaPeloBot(mensagem.mensagemId)) {
          return res.status(200).json({ ok: true, ecoDoProprioBot: true });
        }

        // Sobrou um fromMe que não é nosso: um humano respondeu manualmente
        // pelo WhatsApp da loja. Pausa o bot para esta conversa.
        await reativacaoBot.pausarBot(conversa.id);
        return res.status(200).json({ ok: true, pausado: true });
      }

      // PDF do cliente: captura genérica, fora da máquina de estados (ver
      // receberDocumentoPdf acima) — roda mesmo com o bot pausado, então fica
      // antes da checagem de garantirBotAtivo.
      if (mensagem.documentoPdf) {
        try {
          await receberDocumentoPdf(mensagem, req.body.data, cliente, conversa.id);
        } catch (erro) {
          logger.erro(`Falha ao processar PDF recebido do cliente ${mensagem.telefone}`, erro);
        }

        await conversasService.atualizarEstadoConversa(
          conversa.id,
          conversa.estado_atual,
          conversa.dados,
          mensagem.mensagemId
        );
        return res.status(200).json({ ok: true, documentoRecebido: true });
      }

      const podeResponder = await reativacaoBot.garantirBotAtivo(conversa);
      if (!podeResponder) {
        // Bot pausado e ainda dentro da janela de atendimento humano: só registra a mensagem.
        return res.status(200).json({ ok: true, pausado: true });
      }

      // Handoff pro Agente de Vendas (B.2): enquanto a conversa estiver em
      // AGENTE_VENDAS_ATIVO, texto livre vai direto pro agente em vez de
      // passar pela stateMachine — só os comandos globais (0/menu, #, *,
      // ajuda, atendente/reclamação) continuam interceptando em qualquer estado.
      if (conversa.estado_atual === 'AGENTE_VENDAS_ATIVO' && !comandosGlobais.identificarComando(mensagem.texto)) {
        const { ignorado, estadoFinal } = await consultarAgenteVendasComRedeDeSeguranca(
          cliente,
          conversa.id,
          mensagem.texto
        );

        if (!ignorado) {
          await conversasService.atualizarEstadoConversa(
            conversa.id,
            estadoFinal || conversa.estado_atual,
            conversa.dados,
            mensagem.mensagemId
          );
        }

        return res.status(200).json({ ok: true });
      }

      // Cliente já tem pedido/orçamento ativo e pergunta sobre fechar/pagar (ver
      // intencaoFechamento.js) — só nos dois estados onde ele cai depois de um
      // pedido confirmado (menu principal / submenu de vendas), pra não
      // interceptar por engano "pagar"/"fechar" dentro de um passo de texto
      // livre (cadastro fiscal, lista de itens, observação).
      if (
        ESTADOS_QUE_DETECTAM_INTENCAO_DE_FECHAMENTO.includes(conversa.estado_atual)
        && intencaoFechamento.mencionaFecharOuPagar(mensagem.texto)
      ) {
        const respostaFechamento = await receberIntencaoFechamentoPedido(cliente, conversa.id);

        if (respostaFechamento) {
          await evolutionApi.enviarTexto(cliente.telefone, respostaFechamento);
          await conversasService.atualizarEstadoConversa(
            conversa.id,
            conversa.estado_atual,
            conversa.dados,
            mensagem.mensagemId
          );
          return res.status(200).json({ ok: true, intencaoFechamentoDetectada: true });
        }
        // Nenhum pedido/orçamento ativo: segue pro fluxo normal abaixo (o
        // fallback do próprio estado cuida do texto não reconhecido, como hoje).
      }

      const sessao = await montarSessao(conversa);

      const cadastroCompleto = ESTADOS_QUE_PODEM_PRECISAR_DE_CADASTRO_COMPLETO.includes(conversa.estado_atual)
        ? await clientesService.clienteTemCadastroCompleto(cliente.id)
        : undefined;

      const resultado = stateMachine.processarMensagem(sessao, mensagem.texto, {
        nomeCliente: cliente.nome,
        cadastroCompleto,
      });

      analyticsService.registrarEvento('estado_acessado', {
        cliente: cliente.telefone,
        estado: resultado.sessao.estado,
        mudouDeEstado: resultado.sessao.estado !== sessao.estado,
      });

      // CONSULTAR_AGENTE_VENDAS não passa pelo executor genérico de ações
      // (actions.js): ao contrário de NOTIFICAR_HUMANO/ENVIAR_ARQUIVO
      // (fire-and-forget, resposta já decidida pela stateMachine pura), essa
      // chamada é síncrona e é ela quem decide a resposta final ao cliente e
      // o próximo estado — por isso é tratada aqui no controller (B.4).
      const acaoConsultarAgenteVendas = resultado.acoes.find((acao) => acao.tipo === 'CONSULTAR_AGENTE_VENDAS');
      const demaisAcoes = acaoConsultarAgenteVendas
        ? resultado.acoes.filter((acao) => acao !== acaoConsultarAgenteVendas)
        : resultado.acoes;

      if (demaisAcoes.length > 0) {
        await actions.executarAcoes(demaisAcoes, cliente, conversa.id);
      }

      if (acaoConsultarAgenteVendas) {
        const { estadoFinal } = await consultarAgenteVendasComRedeDeSeguranca(
          cliente,
          conversa.id,
          acaoConsultarAgenteVendas.dados.intencao
        );

        await conversasService.atualizarEstadoConversa(
          conversa.id,
          estadoFinal || resultado.sessao.estado,
          resultado.sessao.dados,
          mensagem.mensagemId
        );

        return res.status(200).json({ ok: true });
      }

      await conversasService.atualizarEstadoConversa(
        conversa.id,
        resultado.sessao.estado,
        resultado.sessao.dados,
        mensagem.mensagemId
      );

      const resposta = resultado.sessao.estado === comandosGlobais.ESTADO_MENU_PRINCIPAL
        ? await anexarStatusPedidoAtivo(resultado.resposta, cliente.id)
        : resultado.resposta;

      await evolutionApi.enviarTexto(cliente.telefone, resposta);

      return res.status(200).json({ ok: true });
    } finally {
      if (chaveDuplicidade) mensagensEmProcessamento.delete(chaveDuplicidade);
    }
  } catch (erro) {
    logger.erro('Falha ao processar mensagem recebida do webhook', erro);
    analyticsService.registrarEvento('erro_processamento', { mensagem: erro.message });
    return res.status(500).json({ erro: 'Falha ao processar a mensagem.' });
  }
}

// Callback opcional do Agente de Orçamento (n8n -> JS Bot, contrato na seção 6
// do PRD): só fecha o ciclo de rastreabilidade num log de auditoria
// (`mensagens`) — não muda estado de conversa nem comportamento do cliente.
// Atualização de status de orçamento continua acontecendo só via
// orcamentosService.atualizarStatusOrcamento()/aceitarOrcamento(), nunca aqui.
async function receberCallbackAgenteOrcamento(req, res) {
  const { orcamento_id: orcamentoId, status, aceito } = req.body || {};

  if (!orcamentoId || !status) {
    return res.status(400).json({ erro: 'Payload inválido: orcamento_id e status são obrigatórios.' });
  }

  try {
    const orcamento = await orcamentosService.buscarOrcamentoPorId(orcamentoId);
    if (!orcamento) {
      logger.aviso(`Callback do Agente de Orçamento recebido para orçamento inexistente: ${orcamentoId}`);
      return res.status(404).json({ erro: 'Orçamento não encontrado.' });
    }

    await mensagensService.registrarMensagem(
      orcamento.conversa_id,
      'bot',
      `Callback do Agente de Orçamento: status="${status}", aceito=${Boolean(aceito)}.`
    );

    return res.status(200).json({ ok: true });
  } catch (erro) {
    logger.erro('Falha ao processar callback do Agente de Orçamento', erro);
    return res.status(500).json({ erro: 'Falha ao processar o callback.' });
  }
}

module.exports = { receberWebhook, receberCallbackAgenteOrcamento };
