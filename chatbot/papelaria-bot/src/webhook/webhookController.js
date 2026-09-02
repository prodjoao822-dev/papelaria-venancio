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
const mediaProcessor = require('../utils/mediaProcessor');
const env = require('../config/env');
const reativacaoBot = require('../middlewares/reativacaoBot');
const stateMachine = require('../botEngine/stateMachine');
const comandosGlobais = require('../botEngine/comandosGlobais');
const intencaoFechamento = require('../botEngine/intencaoFechamento');
const actions = require('../botEngine/actions');
const n8nClient = require('../integracoes/n8nClient');
const notifyTargets = require('../config/notifyTargets');
const analyticsService = require('../services/analyticsService');
const escalonamentoService = require('../services/escalonamentoService');
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
// LISTA_ESCOLAR_OBSERVACAO saiu daqui em 27/08/2026: o caminho de "escola fora
// do catálogo" não passa mais pelo cadastro fiscal (decisão do dono — pedir
// CPF/CNPJ pra uma família comprando material escolar era burocracia
// decorativa, ver listaEscolar.js), então esse estado nunca mais usa
// `contexto.cadastroCompleto` — manter aqui só geraria uma consulta ao
// Supabase sem efeito nenhum a cada lista escolar concluída.
const ESTADOS_QUE_PODEM_PRECISAR_DE_CADASTRO_COMPLETO = ['COTACAO_EMPRESA_OBSERVACAO'];

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

// Conversas que já receberam o aviso de "mensagem concorrente" NESTA janela de
// processamento (ver avisarMensagemConcorrente). Existe pra o aviso sair no
// máximo uma vez por janela: sem isso, um cliente que dispara 5 mensagens
// durante uma consulta lenta recebia 5 avisos idênticos, e um reenvio do mesmo
// webhook pela Evolution API repetia o aviso pra uma mensagem só (o dedup por
// `ultima_mensagem_id` não chega a ser gravado quando a mensagem é descartada
// pelo lock). Ciclo de vida colado no lock acima: quem segura o lock limpa as
// duas entradas no mesmo `finally`, então nada fica crescendo em memória.
const conversasJaAvisadasDeConcorrencia = new Set();

// Fila de mensagens que chegaram durante o lock de `conversasComAgenteVendasEmAndamento`
// (29/08/2026): substitui o comportamento de "descarta e só avisa" adotado em
// 26/08/2026 (ver comentário de `avisarMensagemConcorrente`). Teste real nesse
// dia mostrou o problema de verdade: cliente mandou "sim" (confirmando um item)
// e logo em seguida "quero pilot gel tbm" — o "sim" foi processado normal, mas
// o "pilot gel" ficou só registrado no histórico e nunca chegou a ser
// respondido; o cliente teve que perceber sozinho e pedir de novo. Cada entrada
// é um array de textos CRUS (na ordem de chegada) — quem esvazia é o `finally`
// de consultarAgenteVendasComRedeDeSeguranca, assim que o lock daquela conversa
// é liberado (ver reprocessarFilaConcorrente). Mesma limitação de memória de
// processo dos outros locks deste arquivo.
const filaDeMensagensConcorrentes = new Map();

// Lock por conversa: impede segunda mensagem disparar FINALIZAR_CADASTRO_E_PEDIDO
// enquanto a primeira ainda está processando (ver diagnóstico A1).
const conversasEmFinalizacao = new Set();

const MENSAGEM_FALLBACK_AGENTE_VENDAS = 'Desculpa a demora! Vou te conectar com nossa equipe agora, um momento.';
const MENSAGEM_CONFIRMACAO_PDF_RECEBIDO = 'Recebemos seu arquivo! Já encaminhamos pra nossa equipe de vendas dar uma olhada.';
const MENSAGEM_CONFIRMACAO_AUDIO_RECEBIDO = 'Recebi seu áudio! Já chamei alguém da nossa equipe pra te ouvir e responder por aqui. Só um instante 😊';
const MENSAGEM_CONFIRMACAO_IMAGEM_RECEBIDA = 'Recebi sua imagem! Já chamei alguém da nossa equipe pra dar uma olhada e responder por aqui. Só um instante 😊';
const MENSAGEM_MENSAGEM_CONCORRENTE = 'Só um instante, ainda estou vendo sua mensagem anterior 😊';

// Rede de segurança pra áudio: usada quando a transcrição (OpenRouter, ver
// mediaProcessor.js) não está configurada ou falhou, e também quando o bot
// está pausado (a IA não deve responder por cima de um humano já atendendo).
// `avisarVanessa` vem de `podeResponder`: quando um humano já está tocando a
// conversa ele já viu o áudio no WhatsApp da loja, e notificar de novo viraria
// spam (em 10/08 uma cliente mandou 4 áudios seguidos numa conversa que a loja
// já estava atendendo na mão). Nesse caso só registramos no histórico, pra
// tela de Atendimento não ficar com um buraco.
async function receberAudioFallback(mensagem, cliente, conversaId, { avisarVanessa }) {
  const { notaDeVoz, duracaoSegundos } = mensagem.audio;
  const rotulo = notaDeVoz ? 'um áudio' : 'um arquivo de áudio';
  const duracao = duracaoSegundos ? ` de ${duracaoSegundos}s` : '';

  if (avisarVanessa) {
    await evolutionApi.enviarTexto(
      notifyTargets.vendas,
      `🎧 ${cliente.nome || 'Cliente sem nome'} (${cliente.telefone}) mandou ${rotulo}${duracao} `
      + 'no WhatsApp da loja. Não deu pra transcrever automaticamente — precisa de atendimento humano.'
    );
    await evolutionApi.enviarTexto(cliente.telefone, MENSAGEM_CONFIRMACAO_AUDIO_RECEBIDO);
  }

  // Best-effort, mesmo critério do PDF: o aviso pra Vanessa já saiu, uma falha
  // só de registro não pode virar erro pro webhook.
  try {
    await mensagensService.registrarMensagem(conversaId, 'cliente', `Enviou ${rotulo}${duracao}.`);
  } catch (erro) {
    logger.erro(`Áudio de ${cliente.telefone} tratado, mas falhou ao registrar no histórico`, erro);
  }
}

// Mesma lógica do áudio, pra quando a descrição da imagem (OpenRouter, ver
// mediaProcessor.js) não está configurada, falhou, ou o bot está pausado.
async function receberImagemFallback(mensagem, cliente, conversaId, { avisarVanessa }) {
  if (avisarVanessa) {
    await evolutionApi.enviarTexto(
      notifyTargets.vendas,
      `🖼️ ${cliente.nome || 'Cliente sem nome'} (${cliente.telefone}) mandou uma imagem `
      + 'no WhatsApp da loja. Não deu pra descrever automaticamente — precisa de atendimento humano.'
    );
    await evolutionApi.enviarTexto(cliente.telefone, MENSAGEM_CONFIRMACAO_IMAGEM_RECEBIDA);
  }

  try {
    await mensagensService.registrarMensagem(conversaId, 'cliente', 'Enviou uma imagem.');
  } catch (erro) {
    logger.erro(`Imagem de ${cliente.telefone} tratada, mas falhou ao registrar no histórico`, erro);
  }
}

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

// Histórico da conversa pra tela de Atendimento do dashboard. Best-effort de
// propósito: é log de auditoria, não pode derrubar o webhook nem impedir uma
// resposta que já saiu (mesmo critério já usado no PDF e no áudio).
//
// De quem é cada registro: as conversas que passam pelo Agente de Vendas são
// gravadas pelo PRÓPRIO n8n (nós "Supabase · Grava Resposta" e equivalente do
// lado do cliente), então aqui só entram os caminhos que o n8n não vê — a
// navegação por menu e as mensagens que chegam com o bot pausado. Registrar os
// dois lados produziria histórico duplicado.
async function registrarNoHistorico(conversaId, remetente, conteudo) {
  if (!conteudo) return;

  try {
    await mensagensService.registrarMensagem(conversaId, remetente, conteudo);
  } catch (erro) {
    logger.erro(`Falha ao registrar no histórico a mensagem (${remetente}) da conversa ${conversaId}`, erro);
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

// Prefixa a mensagem do cliente com o pedido/orçamento que ele já tem aberto,
// quando existe. Devolve o texto original quando não há nada em aberto.
//
// Vai no TEXTO, e não no campo `contexto` do payload, porque o workflow do
// Agente de Vendas só lê `telefone`, `texto`, `conversa_id` e `cliente_id` —
// `contexto` é enviado desde sempre e nunca foi consumido do outro lado
// (conferido no export do workflow em 08/08/2026). O que fazia a retomada
// pós-pedido funcionar era justamente o protocolo estar embutido no texto.
//
// Precisa ir em TODA mensagem enquanto a conversa estiver com o agente, não só
// na primeira: em teste real em 08/08/2026 o cliente pediu pra fechar o
// PED-2026-0083, e a partir da segunda mensagem o agente respondeu que "o
// pedido ainda não tem nenhum item incluído" e criou um rascunho novo e vazio
// (ORC-2026-0086). A memória do agente guarda a conversa, não o estado do
// pedido no banco — quem tem esse dado é o bot.
async function prefixarPedidoAtivo(texto, clienteId) {
  const pedido = await pedidosService.pedidoAtivoCliente(clienteId);
  const orcamento = pedido ? null : await pedidosService.orcamentoAtivoCliente(clienteId);
  const alvo = pedido || orcamento;

  if (!alvo) return texto;

  const rotulo = pedido ? 'pedido' : 'orçamento';
  const status = pedido
    ? (STATUS_PEDIDO_LEGIVEL[alvo.status] || alvo.status)
    : (STATUS_ORCAMENTO_LEGIVEL[alvo.status] || alvo.status);

  return `[Contexto do sistema — não repita este trecho para o cliente: ele já tem o `
    + `${rotulo} de protocolo ${alvo.protocolo} em aberto (${status}). Use esse protocolo; `
    + `não crie um orçamento novo.]\n\nMensagem do cliente: "${texto}"`;
}

// Mensagem que chegou enquanto o Agente de Vendas ainda processava a anterior
// da MESMA conversa (guarda `conversasComAgenteVendasEmAndamento`).
//
// Por que isso existe (teste de carga de 24/08/2026, loadtest/): esse guarda
// respondia 200 e a mensagem do cliente evaporava — sem resposta pra ele, sem
// notificação e sem histórico. 90% das mensagens concorrentes sumiram assim, e
// nem o operador as via na tela de Atendimento. A mensagem continua fora do
// PROCESSAMENTO (não vira uma segunda chamada ao agente), mas deixa de sumir:
// o cliente sabe que ela chegou e o operador consegue lê-la.
//
// Desde 29/08/2026 a mensagem TAMBÉM é reprocessada: fica empilhada em
// `filaDeMensagensConcorrentes` e o `finally` de
// consultarAgenteVendasComRedeDeSeguranca a entrega de volta ao Agente de
// Vendas assim que o lock desta conversa é liberado (ver
// reprocessarFilaConcorrente). Antes disso a mensagem ficava só registrada no
// histórico e nunca era respondida de verdade — o cliente tinha que perceber
// sozinho e repetir o pedido.
//
// Tudo best-effort, mesmo critério do PDF/áudio: este caminho já é um
// fallback, uma falha aqui não pode virar 500 e fazer a Evolution API reenviar
// o webhook (o que multiplicaria o próprio problema de concorrência).
//
// `textoDoCliente` vem null quando quem chama já registrou a fala do cliente no
// histórico — registrar de novo aqui duplicaria a linha na tela do operador.
// Nesse caso também não há o que empilhar: não existe texto cru pra reprocessar.
async function avisarMensagemConcorrente(cliente, conversaId, textoDoCliente) {
  // Antes do envio, e FORA do dedup abaixo: TODA fala do cliente entra no
  // histórico, mesmo a quinta seguida. É o núcleo desta correção — o operador
  // precisa ver todas. O registro também independe de a Evolution API estar de pé.
  await registrarNoHistorico(conversaId, 'cliente', textoDoCliente);

  if (textoDoCliente) {
    const filaAtual = filaDeMensagensConcorrentes.get(conversaId) || [];
    filaAtual.push(textoDoCliente);
    filaDeMensagensConcorrentes.set(conversaId, filaAtual);
  }

  // Dedup do aviso (26/08/2026): a fala do cliente é sempre registrada, mas o
  // aviso sai no máximo uma vez por janela de lock. Repetir só geraria spam pro
  // cliente e linhas duplicadas na tela do operador.
  if (conversasJaAvisadasDeConcorrencia.has(conversaId)) {
    logger.info(
      `Aviso de mensagem concorrente suprimido: conversa ${conversaId} já avisada nesta janela de processamento.`
    );
    return;
  }

  // Marca ANTES do envio, sem nenhum await entre o `has` e o `add`: duas
  // mensagens concorrentes podem estar em voo ao mesmo tempo, e marcar só depois
  // do await deixaria as duas passarem pela porta.
  conversasJaAvisadasDeConcorrencia.add(conversaId);

  try {
    await evolutionApi.enviarTexto(cliente.telefone, MENSAGEM_MENSAGEM_CONCORRENTE);
    // Depois do envio, não antes (mesmo critério do fluxo de menu): só entra no
    // histórico o que o cliente de fato viu.
    await registrarNoHistorico(conversaId, 'bot', MENSAGEM_MENSAGEM_CONCORRENTE);
  } catch (erro) {
    // O aviso não chegou ao cliente: solta o dedup pra próxima mensagem
    // concorrente da mesma janela poder tentar de novo.
    conversasJaAvisadasDeConcorrencia.delete(conversaId);
    logger.erro(
      `Falha ao avisar ${cliente.telefone} de que a mensagem anterior ainda está em processamento`,
      erro
    );
  }
}

// Chamada síncrona ao Agente de Vendas (n8n) com rede de segurança: nunca
// deixa o cliente sem resposta. Se der timeout/erro, avisa o cliente, notifica
// um humano com a mensagem pendente e pausa o bot pra essa conversa
// (reaproveita `reativacaoBot`, o mesmo mecanismo usado quando um humano
// assume manualmente pelo WhatsApp da loja) — pra Vanessa assumir sem o bot
// interferir. `estadoFinal` no retorno indica o próximo `estado_atual`:
// `null` quando falhou (mantém o estado atual, quem chama decide o fallback).
// `contextoExtra` (opcional) vai no campo `contexto` do payload pro n8n — usado
// pelo fluxo de "fechar/pagar" (ver receberIntencaoFechamentoPedido) pra dar
// ao agente o protocolo/valor/tipo do pedido/orçamento em questão; chamadas
// existentes (opções 2-5 do submenu de Vendas) continuam sem isso.
// `textoDoCliente` (opcional) é a fala CRUA do cliente, usada só pelo caminho de
// mensagem concorrente (ver avisarMensagemConcorrente): `texto` aqui costuma vir
// embrulhado em contexto de sistema, que não pode aparecer no histórico do
// operador. Omitir significa "já registrei essa fala" ou "não há fala crua".
async function consultarAgenteVendasComRedeDeSeguranca(
  cliente,
  conversaId,
  texto,
  { contextoExtra, textoDoCliente = null } = {}
) {
  if (conversasComAgenteVendasEmAndamento.has(conversaId)) {
    logger.aviso(
      `Mensagem pro Agente de Vendas ignorada: já há uma consulta em andamento pra conversa ${conversaId}.`
    );
    await avisarMensagemConcorrente(cliente, conversaId, textoDoCliente);
    return { ignorado: true, estadoFinal: null };
  }

  conversasComAgenteVendasEmAndamento.add(conversaId);
  try {
    // Instrumentação (análise de instabilidade, 29/07/2026): mede só a
    // duração desta chamada de rede, separada do resto do processamento do
    // webhook (Supabase, stateMachine etc.) — antes disso só sabíamos o
    // tempo total até o timeout, sem saber quanto era fila/Supabase e quanto
    // era o workflow do n8n em si.
    const inicioChamadaAgente = Date.now();
    // O "digitando..." disparado no recebimento da mensagem (ver acima) some
    // sozinho depois de ~5s (PRESENCE_DELAY_MS), mas essa chamada ao Agente de
    // Vendas costuma levar 10-29s em produção — sem reforçar o indicador, o
    // cliente vê "digitando..." sumir no meio da espera e acha que travou.
    // manterDigitando reenvia "composing" em loop até pararDigitando() ser
    // chamado (garantido pelo `finally` abaixo, sucesso ou erro).
    const pararDigitando = evolutionApi.manterDigitando(cliente.telefone);
    let respostaAgente;
    try {
      respostaAgente = await n8nClient.consultarAgenteVendas({
        cliente_id: cliente.id,
        conversa_id: conversaId,
        telefone: cliente.telefone,
        texto,
        ...(contextoExtra ? { contexto: contextoExtra } : {}),
      });
    } finally {
      pararDigitando();
    }
    analyticsService.registrarEvento('agente_vendas_tempo_resposta', {
      conversaId,
      duracaoMs: Date.now() - inicioChamadaAgente,
      sucesso: Boolean(respostaAgente),
      tempoAgenteN8nMs: respostaAgente?.tempoAgenteN8nMs ?? null,
      viaRecuperacaoSupabase: Boolean(respostaAgente?.recuperadoViaSupabase),
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
      await reativacaoBot.pausarBot(conversaId, 'timeout/erro ao consultar o Agente de Vendas');
      await escalonamentoService.verificarEscalonamento(cliente.telefone, evolutionApi.enviarTexto.bind(evolutionApi));
      return { ignorado: false, estadoFinal: null };
    }

    await evolutionApi.enviarTexto(cliente.telefone, respostaAgente.resposta);

    // acionarHumano hoje SEMPRE significa falha técnica (rate-limit do modelo
    // ou erro de uma tool no n8n) — o agente fecha a venda sozinho (chama
    // "Fechar Orçamento"), não existe nenhum caminho no prompt onde ele pede
    // handoff humano por decisão de negócio (confirmado lendo o system prompt
    // inteiro, 07/08/2026). A mensagem antiga aqui ("é hora de acionar humano
    // para pagamento/fechamento") soava como cliente pronto pra comprar, mas é
    // sempre um erro técnico — corrigido pra não confundir o time de vendas.
    // Pausa o bot totalmente pra essa conversa (mesmo mecanismo de
    // ESCALACAO/timeout acima), pra Vendas assumir sem o bot interferir.
    if (respostaAgente.acionarHumano) {
      await actions.executarAcoes(
        [{
          tipo: 'NOTIFICAR_HUMANO',
          alvo: 'vendas',
          dados: {
            intencao: `Falha técnica no atendimento automático — mensagem pendente do cliente: "${texto}"`
              + (respostaAgente.motivo ? ` (motivo: ${respostaAgente.motivo})` : ''),
          },
        }],
        cliente,
        conversaId
      );
      await reativacaoBot.pausarBot(conversaId, 'Falha técnica no Agente de Vendas — mensagem escalada pro time de vendas');
      await escalonamentoService.verificarEscalonamento(cliente.telefone, evolutionApi.enviarTexto.bind(evolutionApi));
      return { ignorado: false, estadoFinal: 'SUBMENU_VENDAS' };
    }

    return {
      ignorado: false,
      estadoFinal: respostaAgente.encerrar_atendimento_ia ? 'SUBMENU_VENDAS' : 'AGENTE_VENDAS_ATIVO',
    };
  } finally {
    conversasComAgenteVendasEmAndamento.delete(conversaId);
    // Fim da janela: o dedup do aviso não pode sobreviver ao lock que o
    // justifica — a próxima janela precisa voltar a avisar.
    conversasJaAvisadasDeConcorrencia.delete(conversaId);

    // Drena a fila de mensagens concorrentes (29/08/2026, ver
    // filaDeMensagensConcorrentes): retira e limpa ANTES de disparar o
    // reprocessamento, pra uma mensagem nova que chegar enquanto ele roda cair
    // numa fila nova, não na lista que já está sendo drenada aqui.
    const mensagensPendentes = filaDeMensagensConcorrentes.get(conversaId);
    if (mensagensPendentes && mensagensPendentes.length > 0) {
      filaDeMensagensConcorrentes.delete(conversaId);
      // Junta tudo numa única string, na ordem de chegada — trata como se o
      // cliente tivesse mandado tudo de uma vez, é o comportamento mais natural.
      const textoCombinado = mensagensPendentes.join('\n');

      // Fire-and-forget de propósito: sem `await` aqui, ou atrasaria a resposta
      // que já está prestes a sair pro chamador desta função. `.catch` só pra
      // nunca virar unhandled rejection — a própria rede de segurança desta
      // função já cobre timeout/erro do agente.
      reprocessarFilaConcorrente(cliente, conversaId, textoCombinado).catch((erro) => {
        logger.erro(`Falha ao reprocessar mensagem(ns) concorrente(s) da conversa ${conversaId}`, erro);
      });
    }
  }
}

// Reprocessa, depois que o lock da conversa foi liberado, as mensagens que
// chegaram durante a janela de concorrência anterior (ver
// avisarMensagemConcorrente e filaDeMensagensConcorrentes). Chamada como
// fire-and-forget de dentro do `finally` acima — por isso não recebe a
// `conversa` do request original e busca de novo o estado atual pra atualizar
// no final.
async function reprocessarFilaConcorrente(cliente, conversaId, textoCombinado) {
  // Mesmo tratamento que a mensagem original teria recebido no caminho
  // AGENTE_VENDAS_ATIVO: sem isso o agente perde o fio do pedido/orçamento
  // ativo (ver prefixarPedidoAtivo).
  const textoPrefixado = await prefixarPedidoAtivo(textoCombinado, cliente.id);

  const { ignorado, estadoFinal } = await consultarAgenteVendasComRedeDeSeguranca(
    cliente,
    conversaId,
    textoPrefixado,
    // `textoDoCliente: null`: a fala já foi registrada no histórico quando
    // entrou na fila (ver avisarMensagemConcorrente) — registrar de novo aqui
    // duplicaria a linha na tela do operador.
    { textoDoCliente: null }
  );

  if (ignorado) {
    // Só acontece se uma NOVA mensagem concorrente tiver chegado bem no meio
    // deste reprocessamento e encontrado o lock ocupado de novo — ela mesma
    // reenfileirou e vai disparar o próprio reprocessamento quando o lock
    // liberar de novo. Nada a fazer aqui.
    return;
  }

  // Sem acesso à `conversa` do request original (esta função roda fora do
  // ciclo de vida do webhook) — busca de novo pra pegar estado_atual/dados
  // frescos. `mensagemId: null` porque não há um mensagemId de webhook
  // específico associado a este reprocessamento: é uma consolidação de
  // mensagens já recebidas.
  const conversaAtual = await conversasService.buscarOuCriarConversa(cliente.id);
  await conversasService.atualizarEstadoConversa(
    conversaId,
    estadoFinal || conversaAtual.estado_atual,
    conversaAtual.dados,
    null
  );
}

// Cliente já tem pedido/orçamento e pergunta sobre fechar/pagar (ver
// intencaoFechamento.js). Em vez de responder com uma mensagem fixa, delega
// ao Agente de Vendas (mesmo mecanismo das opções 2-5 do submenu de Vendas):
// ele mesmo fecha o pedido (chama "Fechar Orçamento" no n8n) e só aciona um
// humano em caso de falha técnica (ver `acionarHumano` acima). Devolve
// null quando não há nada ativo pro cliente — quem chama decide deixar a
// mensagem cair no fluxo normal nesse caso.
async function receberIntencaoFechamentoPedido(cliente, conversaId, textoOriginal) {
  const pedido = await pedidosService.pedidoAtivoCliente(cliente.id);
  if (pedido) {
    const orcamento = await orcamentosService.buscarOrcamentoPorId(pedido.orcamento_id);
    const valor = orcamento?.valor_total ?? null;
    const intencaoTexto = `Cliente quer fechar/pagar o pedido protocolo ${pedido.protocolo}`
      + (valor ? ` (valor R$ ${Number(valor).toFixed(2)})` : '')
      + `. Mensagem original do cliente: "${textoOriginal}"`;

    return consultarAgenteVendasComRedeDeSeguranca(cliente, conversaId, intencaoTexto, {
      contextoExtra: {
        tipo: 'fechamento_pedido', protocolo: pedido.protocolo, valorTotal: valor, status: pedido.status,
      },
      textoDoCliente: textoOriginal,
    });
  }

  const orcamentoAtivo = await pedidosService.orcamentoAtivoCliente(cliente.id);
  if (orcamentoAtivo) {
    const intencaoTexto = `Cliente quer fechar/pagar o orçamento protocolo ${orcamentoAtivo.protocolo} `
      + `(ainda em elaboração). Mensagem original do cliente: "${textoOriginal}"`;

    return consultarAgenteVendasComRedeDeSeguranca(cliente, conversaId, intencaoTexto, {
      contextoExtra: {
        tipo: 'fechamento_orcamento', protocolo: orcamentoAtivo.protocolo, status: orcamentoAtivo.status,
      },
      textoDoCliente: textoOriginal,
    });
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
  if (!mensagem || (mensagem.texto === null && !mensagem.documentoPdf && !mensagem.audio && !mensagem.imagem)) {
    // Diagnóstico (27/08/2026): uma mensagem de cliente sumiu por completo — sem
    // linha em `mensagens`, sem mudança de estado — depois deste mesmo `return`
    // silencioso (incidente PED-2026-0221, ver memória de sessão). Não dá pra
    // provar de onde veio (Evolution API pode nunca ter recebido a mensagem do
    // lado do cliente, ou o payload chegou com um formato de `message.*` que
    // `payloadParser.js` ainda não reconhece), mas dava pra saber MUITO menos do
    // que precisava: o log antigo aqui era nível INFO com o payload bruto
    // inteiro, fácil de se perder no meio do volume normal de tráfego. Sobe pra
    // AVISO e loga só as chaves de `message` (ex.: "stickerMessage",
    // "reactionMessage" — que são o caso normal e esperado de ignorar — ou algo
    // inesperado, que é o sinal de que falta suporte em payloadParser.js) em vez
    // do corpo inteiro, que já inclui o texto do cliente.
    const tiposDeMensagem = Object.keys(req.body?.data?.message || {});
    logger.aviso(
      'Payload de webhook ignorado: não é uma mensagem de texto, PDF, áudio ou imagem reconhecível '
      + `(tipo(s) em message: ${tiposDeMensagem.length ? tiposDeMensagem.join(', ') : 'nenhum — sem "message" no payload'}).`,
      { mensagemId: req.body?.data?.key?.id || null, remoteJid: req.body?.data?.key?.remoteJid || null }
    );
    return res.status(200).json({ ignorado: true });
  }

  try {
    // Num `fromMe` o `pushName` é o da LOJA (é a conta dela que mandou), mas o
    // `remoteJid` — e portanto o telefone — continua sendo o do cliente. Passar
    // esse nome adiante gravava o nome da loja por cima do nome do cliente: em
    // 12/08 havia 5 clientes distintos cadastrados como "Papelaria Venâncio
    // Ga...", cada um com o telefone certo e o nome errado, o que também fazia a
    // notificação chegar pra Vanessa identificando o cliente errado.
    // `upsertCliente` ignora nome vazio sem apagar o que já está lá.
    const cliente = await clientesService.upsertCliente(
      mensagem.telefone,
      mensagem.fromMe ? null : mensagem.nome
    );
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
        const ehEcoDoProprioBot = evolutionApi.foiEnviadaPeloBot(
          mensagem.mensagemId, mensagem.telefone, mensagem.texto
        );

        // Log de diagnóstico (13/08): em teste real o bot respondeu POR CIMA de
        // uma atendente — ela perguntou "Erika, é sua?" e o bot mandou "Opção
        // inválida" duas vezes em seguida, com a conversa seguindo bot_ativo. Não
        // deu pra saber se o fromMe dela não chegou ou se foi classificado como
        // eco, porque este ramo era silencioso. Agora toda chegada de fromMe
        // aparece no log com a classificação — a próxima ocorrência se explica
        // sozinha, sem precisar reconstruir nada pelo banco.
        logger.info(
          `fromMe recebido de ${mensagem.telefone} (conversa ${conversa.id}): `
          + `${ehEcoDoProprioBot ? 'ECO DO PRÓPRIO BOT, ignorado' : 'HUMANO da loja, pausando o bot'}.`,
          { mensagemId: mensagem.mensagemId, trecho: (mensagem.texto || '').slice(0, 60) }
        );

        if (ehEcoDoProprioBot) {
          return res.status(200).json({ ok: true, ecoDoProprioBot: true });
        }

        // Sobrou um fromMe que não é nosso: um humano respondeu manualmente
        // pelo WhatsApp da loja. Pausa o bot para esta conversa.
        await reativacaoBot.pausarBot(conversa.id);
        return res.status(200).json({ ok: true, pausado: true });
      }

      // Indicador "digitando..." do WhatsApp: dispara assim que sabemos que
      // vamos de fato processar esta mensagem (não é eco nem fromMe de
      // humano), antes de qualquer resposta potencialmente demorada (PDF,
      // transcrição de áudio/imagem, Agente de Vendas). `enviarPresenca` já é
      // best-effort por construção (nunca rejeita — ver evolutionApi.js), mas
      // o `.catch` aqui é defesa em profundidade: puramente cosmético, então
      // mesmo uma falha inesperada não pode virar unhandled rejection nem
      // atrasar o fluxo real — por isso sem `await`.
      evolutionApi.enviarPresenca(mensagem.telefone, 'composing').catch((erro) => {
        logger.aviso(`Falha ao sinalizar "digitando..." para ${mensagem.telefone} (ignorado)`, erro.message);
      });

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

      const { podeResponder, viaGatilhoPedido } = await reativacaoBot.garantirBotAtivo(conversa);

      // Áudio/imagem ficam aqui, e não junto do PDF lá em cima, justamente pra
      // ter o `podeResponder` em mãos: só tentamos transcrever/descrever e
      // deixar a IA responder quando o bot pode responder de verdade — se um
      // humano já assumiu a conversa, a IA não deve entrar por cima dele (cai
      // no fallback de avisar a equipe, mesmo comportamento de sempre).
      //
      // PROMPT-03 Entrega 2: em vez de tratar áudio/imagem como um beco sem
      // saída que só notifica um humano, transcreve/descreve via OpenRouter
      // (mediaProcessor.js) e trata o resultado como se fosse o texto que o
      // cliente digitou — segue pro MESMO fluxo normal daqui pra baixo
      // (Agente de Vendas, menu, etc.), com um prefixo deixando claro a
      // origem. Só cai no fallback antigo (notificar Vendas) se a transcrição/
      // descrição falhar ou não estiver configurada (OPENROUTER_API_KEY).
      if (mensagem.audio) {
        let textoTranscrito = null;

        if (podeResponder && env.OPENROUTER_API_KEY) {
          try {
            const midia = await evolutionApi.baixarMidia(req.body.data);
            if (midia?.base64) {
              textoTranscrito = await mediaProcessor.transcreverAudio(midia.base64, mensagem.audio.mimetype);
            }
          } catch (erro) {
            logger.erro(`Falha ao transcrever áudio de ${mensagem.telefone} — caindo no fallback`, erro);
          }
        }

        if (textoTranscrito) {
          // Sem prefixo quando a transcrição é, ela mesma, um comando global
          // exato ("atendente", "menu", "0"...) — comandosGlobais.identificarComando
          // exige a mensagem INTEIRA igual à palavra (ver comandosGlobais.js),
          // e com o prefixo esse comando nunca mais dispararia (ex.: cliente
          // que manda um áudio só falando "atendente" precisa continuar
          // escalando pra humano, igual a se tivesse digitado).
          mensagem.texto = comandosGlobais.identificarComando(textoTranscrito)
            ? textoTranscrito
            : `[Áudio transcrito do cliente]: ${textoTranscrito}`;
          // Não retorna: segue pro fluxo normal abaixo, como se fosse texto.
        } else {
          try {
            await receberAudioFallback(mensagem, cliente, conversa.id, { avisarVanessa: podeResponder });
          } catch (erro) {
            logger.erro(`Falha ao tratar áudio recebido do cliente ${mensagem.telefone}`, erro);
          }

          await conversasService.atualizarEstadoConversa(
            conversa.id,
            conversa.estado_atual,
            conversa.dados,
            mensagem.mensagemId
          );
          return res.status(200).json({ ok: true, audioRecebido: true });
        }
      }

      if (mensagem.imagem) {
        let descricaoImagem = null;

        if (podeResponder && env.OPENROUTER_API_KEY) {
          try {
            const midia = await evolutionApi.baixarMidia(req.body.data);
            if (midia?.base64) {
              descricaoImagem = await mediaProcessor.descreverImagem(
                midia.base64,
                mensagem.imagem.mimetype,
                mensagem.imagem.legenda
              );
            }
          } catch (erro) {
            logger.erro(`Falha ao descrever imagem de ${mensagem.telefone} — caindo no fallback`, erro);
          }
        }

        if (descricaoImagem) {
          // Mesma ressalva do áudio: se a LEGENDA (não a descrição da IA) for,
          // ela mesma, um comando global exato, respeita o comando em vez de
          // embrulhar em contexto (ex.: imagem mandada com a legenda "menu").
          if (comandosGlobais.identificarComando(mensagem.imagem.legenda)) {
            mensagem.texto = mensagem.imagem.legenda;
          } else {
            const legendaTexto = mensagem.imagem.legenda ? ` Legenda do cliente: "${mensagem.imagem.legenda}"` : '';
            mensagem.texto = `[O cliente enviou uma imagem — descrição automática]: ${descricaoImagem}.${legendaTexto}`;
          }
          // Não retorna: segue pro fluxo normal abaixo, como se fosse texto.
        } else {
          try {
            await receberImagemFallback(mensagem, cliente, conversa.id, { avisarVanessa: podeResponder });
          } catch (erro) {
            logger.erro(`Falha ao tratar imagem recebida do cliente ${mensagem.telefone}`, erro);
          }

          await conversasService.atualizarEstadoConversa(
            conversa.id,
            conversa.estado_atual,
            conversa.dados,
            mensagem.mensagemId
          );
          return res.status(200).json({ ok: true, imagemRecebida: true });
        }
      }

      if (!podeResponder) {
        // Bot pausado e ainda dentro da janela de atendimento humano: só registra
        // a mensagem. Esse comentário estava aqui desde sempre, mas o registro
        // não existia — o `return` vinha direto. Resultado: exatamente as
        // mensagens que um humano precisa ler na tela de Atendimento eram as que
        // nunca chegavam nela (o operador via a conversa vazia enquanto o cliente
        // escrevia no WhatsApp). Agora registra de verdade.
        await registrarNoHistorico(conversa.id, 'cliente', mensagem.texto);
        // Nenhuma mensagem de texto vai sair daqui pra limpar o "digitando..."
        // disparado acima — sem isso o indicador ficaria aceso até o WhatsApp
        // expirá-lo sozinho, dando a entender que o bot ia responder quando
        // quem vai responder é um humano. Mesma defesa em profundidade do
        // `.catch` acima.
        evolutionApi.enviarPresenca(mensagem.telefone, 'paused').catch((erro) => {
          logger.aviso(`Falha ao sinalizar "paused" para ${mensagem.telefone} (ignorado)`, erro.message);
        });
        return res.status(200).json({ ok: true, pausado: true });
      }

      // Retomada inteligente: o bot acabou de reativar de uma pausa automática
      // pós-pedido (não é o timeout humano normal). Se o cliente tem
      // pedido/orçamento ativo, a mensagem vai direto pro Agente de Vendas com
      // esse contexto — pra ele já responder sobre o status em vez de despejar o
      // menu principal. Mesmo padrão de receberIntencaoFechamentoPedido, só que
      // disparado pela reativação em vez de por uma frase de "fechar/pagar".
      // Comandos globais (0/menu, atendente/reclamação, ajuda) são respeitados:
      // caem no fluxo normal abaixo, que já sabe tratá-los (e prefixa o status
      // do pedido no menu via anexarStatusPedidoAtivo).
      if (viaGatilhoPedido && !comandosGlobais.identificarComando(mensagem.texto)) {
        const pedido = await pedidosService.pedidoAtivoCliente(cliente.id);
        const orcamento = pedido ? null : await pedidosService.orcamentoAtivoCliente(cliente.id);

        if (pedido || orcamento) {
          const alvo = pedido || orcamento;
          const intencaoTexto = `Cliente voltou a falar depois que o pedido/orçamento protocolo `
            + `${alvo.protocolo} foi criado. Mensagem do cliente: "${mensagem.texto}"`;

          const { ignorado, estadoFinal } = await consultarAgenteVendasComRedeDeSeguranca(
            cliente,
            conversa.id,
            intencaoTexto,
            {
              contextoExtra: {
                tipo: pedido ? 'retomada_pos_pedido' : 'retomada_pos_orcamento',
                protocolo: alvo.protocolo,
                status: alvo.status,
              },
              textoDoCliente: mensagem.texto,
            }
          );

          if (!ignorado) {
            await conversasService.atualizarEstadoConversa(
              conversa.id,
              estadoFinal || conversa.estado_atual,
              conversa.dados,
              mensagem.mensagemId
            );
          }

          return res.status(200).json({ ok: true, retomadaPosPedido: true });
        }
        // Sem pedido/orçamento ativo: cai no fluxo normal abaixo (menu principal).
      }

      // Handoff pro Agente de Vendas (B.2): enquanto a conversa estiver em
      // AGENTE_VENDAS_ATIVO, texto livre vai direto pro agente em vez de
      // passar pela stateMachine — só os comandos globais (0/menu, #, *,
      // ajuda, atendente/reclamação) continuam interceptando em qualquer estado.
      if (conversa.estado_atual === 'AGENTE_VENDAS_ATIVO' && !comandosGlobais.identificarComando(mensagem.texto)) {
        const { ignorado, estadoFinal } = await consultarAgenteVendasComRedeDeSeguranca(
          cliente,
          conversa.id,
          // Sem isso o agente perde o fio do pedido a partir da segunda
          // mensagem (ver prefixarPedidoAtivo).
          await prefixarPedidoAtivo(mensagem.texto, cliente.id),
          { textoDoCliente: mensagem.texto }
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
        const resultadoFechamento = await receberIntencaoFechamentoPedido(cliente, conversa.id, mensagem.texto);

        if (resultadoFechamento) {
          // consultarAgenteVendasComRedeDeSeguranca já manda a resposta ao
          // cliente internamente (caminho feliz e os dois fallbacks) — não
          // precisa enviarTexto aqui.
          if (!resultadoFechamento.ignorado) {
            await conversasService.atualizarEstadoConversa(
              conversa.id,
              resultadoFechamento.estadoFinal || conversa.estado_atual,
              conversa.dados,
              mensagem.mensagemId
            );
          }
          return res.status(200).json({ ok: true, intencaoFechamentoDetectada: true });
        }
        // Nenhum pedido/orçamento ativo: segue pro fluxo normal abaixo (o
        // fallback do próprio estado cuida do texto não reconhecido, como hoje).
      }

      // Daqui pra baixo é navegação por menu: todos os caminhos que entregam a
      // mensagem ao Agente de Vendas já retornaram acima, e o n8n grava aqueles
      // por conta própria. Então este é o ponto certo pra registrar a fala do
      // cliente sem arriscar duplicar.
      await registrarNoHistorico(conversa.id, 'cliente', mensagem.texto);

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

      // "atendente"/"reclamação" (ver comandosGlobais.js) não é só um aviso —
      // precisa parar o atendimento automático de verdade, senão o bot
      // continua respondendo por cima de quem acabou de ser chamado pra
      // assumir. Reaproveita o mesmo pausarBot() já usado quando um humano
      // responde manualmente pelo WhatsApp da loja (fromMe:true).
      if (comandosGlobais.identificarComando(mensagem.texto) === 'ESCALACAO') {
        await reativacaoBot.pausarBot(conversa.id, 'cliente pediu atendimento humano (comando de escalação)');
        await escalonamentoService.verificarEscalonamento(cliente.telefone, evolutionApi.enviarTexto.bind(evolutionApi));
      }

      // CONSULTAR_AGENTE_VENDAS não passa pelo executor genérico de ações
      // (actions.js): ao contrário de NOTIFICAR_HUMANO/ENVIAR_ARQUIVO
      // (fire-and-forget, resposta já decidida pela stateMachine pura), essa
      // chamada é síncrona e é ela quem decide a resposta final ao cliente e
      // o próximo estado — por isso é tratada aqui no controller (B.4).
      const acaoConsultarAgenteVendas = resultado.acoes.find((acao) => acao.tipo === 'CONSULTAR_AGENTE_VENDAS');

      // PAUSAR_ATENDIMENTO_AUTOMATICO também não passa pelo executor genérico:
      // pausar o bot é estado da conversa, não um efeito colateral de mensagem
      // como NOTIFICAR_HUMANO/ENVIAR_ARQUIVO. Emitida pelas opções de menu que
      // entregam o cliente pra uma pessoa (ver menuEngine, tipo 'notificar' com
      // `pausarBot`). Roda ANTES da resposta sair, pra não existir uma janela em
      // que uma segunda mensagem do cliente ainda encontre o bot ativo.
      const acaoPausar = resultado.acoes.find((acao) => acao.tipo === 'PAUSAR_ATENDIMENTO_AUTOMATICO');
      if (acaoPausar) {
        await reativacaoBot.pausarBot(conversa.id, acaoPausar.dados?.motivo || 'cliente pediu atendimento humano pelo menu');
        await escalonamentoService.verificarEscalonamento(cliente.telefone, evolutionApi.enviarTexto.bind(evolutionApi));
      }

      const demaisAcoes = resultado.acoes.filter(
        (acao) => acao !== acaoConsultarAgenteVendas && acao !== acaoPausar
      );

      // FINALIZAR_CADASTRO_E_PEDIDO tem tratamento dedicado (ver diagnóstico
      // A1 + A7): precisa (1) mandar a resposta da stateMachine ("Perfeito!
      // Já estou confirmando...") ANTES de rodar a ação — que é quem de fato
      // cria/aceita o orçamento e manda o protocolo ao cliente — e (2) travar
      // por conversa, pra uma segunda mensagem do cliente chegando nesse
      // intervalo não disparar um segundo fechamento contra o mesmo pedido.
      const temFinalizar = demaisAcoes.some((acao) => acao.tipo === 'FINALIZAR_CADASTRO_E_PEDIDO');

      if (temFinalizar) {
        if (conversasEmFinalizacao.has(conversa.id)) {
          logger.aviso(
            `FINALIZAR_CADASTRO_E_PEDIDO já em andamento para conversa ${conversa.id}; segunda tentativa descartada com aviso.`
          );
          await evolutionApi.enviarTexto(
            cliente.telefone,
            'Aguarde um momento, ainda estamos finalizando seu pedido anterior...'
          );
          return res.status(200).json({ ok: true });
        }

        // Corrigir ordem (A7): enviar "Perfeito! Já estou confirmando..."
        // ANTES de rodar a ação — assim o cliente recebe o aviso de espera
        // primeiro, e só depois recebe o protocolo do pedido confirmado
        // (mandado dentro de finalizarCadastroEPedido, em actions.js).
        await evolutionApi.enviarTexto(cliente.telefone, resultado.resposta);
        // Só o aviso de espera entra aqui. A mensagem com o protocolo do pedido
        // sai de dentro de finalizarCadastroEPedido (actions.js), que tem o
        // próprio envio — registrá-la exigiria mexer no executor de ações.
        await registrarNoHistorico(conversa.id, 'bot', resultado.resposta);
        await conversasService.atualizarEstadoConversa(
          conversa.id,
          resultado.sessao.estado,
          resultado.sessao.dados,
          mensagem.mensagemId
        );

        conversasEmFinalizacao.add(conversa.id);
        try {
          await actions.executarAcoes(demaisAcoes, cliente, conversa.id);
        } finally {
          conversasEmFinalizacao.delete(conversa.id);
        }

        // Estado e resposta já enviados acima — não reexecutar o restante do fluxo.
        return res.status(200).json({ ok: true });
      }

      if (demaisAcoes.length > 0) {
        await actions.executarAcoes(demaisAcoes, cliente, conversa.id);
      }

      if (acaoConsultarAgenteVendas) {
        // Sem `textoDoCliente`: este caminho vem da navegação por menu, que já
        // gravou a fala do cliente no histórico logo acima — passá-la de novo
        // duplicaria a linha se cair no aviso de mensagem concorrente.
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
      // Depois do envio, não antes: registrar uma resposta que não chegou a sair
      // deixaria o operador lendo no dashboard algo que o cliente nunca viu.
      await registrarNoHistorico(conversa.id, 'bot', resposta);

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
