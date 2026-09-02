// Cliente para a Evolution API: envio de mensagens à instância do WhatsApp.
// Duas operações: texto simples (sendText) e arquivo (sendMedia, usado para
// mandar o PDF da lista de material).

const fs = require('node:fs');
const path = require('node:path');
const { Agent } = require('undici');
const env = require('../config/env');
const logger = require('../utils/logger');

// Causa raiz dos ECONNRESET vistos em produção (20/07, 22/07 e no teste de
// 23/07 que efetivamente duplicou uma mensagem pro cliente): o pool de
// keep-alive padrão do fetch reaproveita uma conexão que o servidor da
// Evolution API já fechou por inatividade — o reset acontece só na hora de
// reusar, mas às vezes DEPOIS do corpo já ter sido mandado e a mensagem já
// entregue, então a retentativa manda a mensagem de novo pro cliente.
// keepAliveTimeout bem curto = cada request praticamente abre conexão nova,
// eliminando essa classe de erro em vez de só reduzir a tentativa de reenvio.
const agenteSemConexaoOciosa = new Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });

// O reconhecimento do eco (`fromMe` que na verdade é mensagem nossa) mora em
// services/registroDeEcos.js — inclusive o porquê de cada casamento e dos
// prazos. Aqui ficam só os dois pontos de registro, no caminho do envio.
const registroDeEcos = require('./registroDeEcos');

function registrarConteudoEnviadoPeloBot(telefoneDestino, texto) {
  registroDeEcos.registrarConteudoEnviado(telefoneDestino, texto);
}

function registrarIdEnviadoPeloBot(resultadoEnvio) {
  registroDeEcos.registrarIdEnviado(resultadoEnvio?.key?.id);
}

// Chamado pelo webhookController ao receber um `fromMe: true`.
function foiEnviadaPeloBot(mensagemId, telefoneDestino, texto) {
  return registroDeEcos.consumirEcoDoBot(mensagemId, telefoneDestino, texto);
}

// `webhookController` já marca a mensagem como processada (`ultima_mensagem_id`)
// antes deste envio — um blip de rede (ECONNRESET etc., visto em produção em
// 20/07) que derrube o fetch faz o cliente nunca receber a resposta, e o
// retry do mesmo webhook cai no dedup como "já processado", sem tentar de
// novo. Blips assim costumam se resolver sozinhos em menos de 1-2s, então
// tentamos de novo algumas vezes antes de desistir — reduz bastante o risco
// sem precisar de fila/infra nova.
const MAX_TENTATIVAS_ENVIO = 3;

// Códigos de erro seguros pra reenviar até MAX_TENTATIVAS_ENVIO inteiras: a
// conexão nunca chegou a se estabelecer, então a Evolution API não recebeu nada
// e reenviar não duplica.
const ERROS_SEGUROS_PARA_RETENTAR_INTEGRALMENTE = new Set([
  'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT',
]);

// ECONNRESET era tratado como seguro, na hipótese de que sempre vinha do pool
// de keep-alive reusando socket morto (antes do corpo sair). O `Agent` acima
// eliminou essa classe — e o que sobrou, medido em 08/08/2026, é ECONNRESET com
// `syscall: 'read'`: a requisição SAIU, a mensagem foi entregue, e o que se
// perdeu foi a resposta. Reenviar aí duplica pro cliente, e foi o que produziu
// o "Qual o ano?" três vezes seguidas no WhatsApp.
//
// Então o desempate é pelo syscall, não pelo código:
//   connect  -> nunca saiu          -> retentar à vontade
//   read     -> saiu e foi entregue -> NÃO retentar
//   write/outros -> ambíguo         -> uma segunda tentativa, no máximo
function mensagemProvavelmenteEntregue(erro) {
  return (erro?.cause ?? erro)?.syscall === 'read';
}

function tentativasMaximasPara(erro) {
  const causa = erro?.cause ?? erro;
  const codigo = causa?.code;

  if (mensagemProvavelmenteEntregue(erro)) return 1;
  if (ERROS_SEGUROS_PARA_RETENTAR_INTEGRALMENTE.has(codigo)) return MAX_TENTATIVAS_ENVIO;
  if (codigo === 'ECONNRESET' && causa?.syscall === 'connect') return MAX_TENTATIVAS_ENVIO;
  return 2;
}

function aguardar(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

// Mesmo problema descrito em `NOTIFICAR_AGENTE_ORCAMENTO_TIMEOUT_MS`
// (src/integracoes/n8nClient.js): sem teto de tempo, um travamento do proxy/da
// Evolution API prendia o handler do webhook indefinidamente. Valor bem menor
// que o dos agentes n8n (que rodam LLM) porque isso aqui é só enviar/baixar
// uma mensagem — 15s já é folga generosa pra um envio de texto ou mídia.
const EVOLUTION_API_TIMEOUT_MS = 15000;

async function fetchComRetentativa(url, opcoes, descricaoErro) {
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_ENVIO; tentativa += 1) {
    const controleTimeout = new AbortController();
    const timeoutId = setTimeout(() => controleTimeout.abort(), EVOLUTION_API_TIMEOUT_MS);

    try {
      // eslint-disable-next-line no-await-in-loop -- retentativas são sequenciais por natureza
      return await fetch(url, { ...opcoes, signal: controleTimeout.signal, dispatcher: agenteSemConexaoOciosa });
    } catch (erroDeRede) {
      if (erroDeRede.name === 'AbortError') {
        logger.aviso(`Timeout de ${EVOLUTION_API_TIMEOUT_MS}ms ao chamar a Evolution API (${descricaoErro})`, {
          tentativa,
        });
      }

      const tentativasMaximasParaEsteErro = tentativasMaximasPara(erroDeRede);

      if (tentativa >= tentativasMaximasParaEsteErro) {
        const erro = new Error(`${descricaoErro}: ${erroDeRede.message}`);
        // Quem chama decide o que fazer: perder a resposta de um envio que
        // chegou não é a mesma coisa que não conseguir enviar (ver enviarTexto).
        erro.provavelmenteEntregue = mensagemProvavelmenteEntregue(erroDeRede);
        if (!erro.provavelmenteEntregue) logger.erro(descricaoErro, erroDeRede);
        throw erro;
      }
      logger.aviso(
        `${descricaoErro} (tentativa ${tentativa}/${tentativasMaximasParaEsteErro}) — tentando de novo`,
        erroDeRede.message
      );
      // eslint-disable-next-line no-await-in-loop -- espera intencional entre tentativas
      await aguardar(500 * tentativa);
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return undefined; // inalcançável: o loop sempre retorna ou lança na última tentativa
}

// Perder a resposta de um envio que CHEGOU não é falha de envio. Tratar como
// falha fazia o webhookController devolver 500 pra Evolution API, que reentrega
// o webhook — reentrega inútil, porque o estado já foi persistido e o dedup por
// `ultima_mensagem_id` descarta tudo (o log de 08/08/2026 está cheio de
// "Webhook duplicado ignorado" logo depois de cada 500). Pior: nos caminhos em
// que o estado ainda NÃO foi persistido (consulta ao Agente de Vendas), a
// reentrega refazia a chamada ao n8n — resposta duplicada e custo de LLM à toa.
//
// Devolve `null` quando a mensagem saiu mas a resposta se perdeu. Nenhum ponto
// do código usa o retorno de enviarTexto/enviarArquivo — ele só alimenta o
// registro de id pro filtro de eco, que nesse caso já foi coberto pelo registro
// por conteúdo feito antes do envio.
async function fetchTolerandoRespostaPerdida(executarEnvio, telefoneDestino) {
  try {
    return await executarEnvio();
  } catch (erro) {
    if (!erro.provavelmenteEntregue) throw erro;

    logger.aviso(
      `Resposta da Evolution API se perdeu no envio para ${telefoneDestino}; `
      + 'a mensagem foi entregue, seguindo sem tratar como erro',
      erro.message
    );
    return null;
  }
}

async function enviarTexto(telefoneDestino, mensagem) {
  const url = `${env.EVOLUTION_API_URL}/message/sendText/${env.EVOLUTION_INSTANCE}`;

  // Antes do fetch, de propósito: se o envio falhar na leitura da resposta a
  // mensagem ainda assim foi entregue e vai ecoar de volta — sem este registro,
  // o eco chega sem id conhecido e o bot trata a própria fala como se fosse do
  // cliente (ver comentário em conteudosEnviadosPeloBot).
  registrarConteudoEnviadoPeloBot(telefoneDestino, mensagem);

  const resposta = await fetchTolerandoRespostaPerdida(
    () => fetchComRetentativa(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: env.EVOLUTION_API_KEY,
        },
        body: JSON.stringify({ number: telefoneDestino, text: mensagem }),
      },
      `Falha de rede ao enviar mensagem para ${telefoneDestino}`
    ),
    telefoneDestino
  );

  if (!resposta) return null;

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => '');
    logger.erro(`Evolution API retornou erro ao enviar para ${telefoneDestino}`, {
      status: resposta.status,
      corpoErro,
    });
    throw new Error(`Evolution API retornou status ${resposta.status} ao enviar mensagem para ${telefoneDestino}`);
  }

  const resultado = await resposta.json().catch(() => null);
  registrarIdEnviadoPeloBot(resultado);
  return resultado;
}

// Base comum das duas formas de mandar documento: a partir de um arquivo
// local em disco (enviarArquivo, ex.: PDF de lista de material) ou a partir de
// um base64 já em mãos (enviarDocumentoBase64, ex.: PDF que o próprio cliente
// acabou de mandar e só estamos repassando pra Vendas). A Evolution API aceita
// o conteúdo do arquivo em base64 no campo `media` quando ele ainda não está
// hospedado em uma URL pública.
async function enviarMedia(telefoneDestino, { nomeArquivo, legenda, conteudoBase64 }) {
  const url = `${env.EVOLUTION_API_URL}/message/sendMedia/${env.EVOLUTION_INSTANCE}`;

  // Mesmo motivo do enviarTexto: se a resposta se perder, o id não é registrado
  // e o eco do documento chega como `fromMe` desconhecido. Aqui o estrago é
  // menor (o bot se pausa sozinho, não corrompe pedido), e só dá pra casar pela
  // legenda — documento sem legenda continua sem essa rede.
  registrarConteudoEnviadoPeloBot(telefoneDestino, legenda);

  const resposta = await fetchTolerandoRespostaPerdida(
    () => fetchComRetentativa(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: env.EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          number: telefoneDestino,
          mediatype: 'document',
          fileName: nomeArquivo,
          caption: legenda,
          media: conteudoBase64,
        }),
      },
      `Falha de rede ao enviar arquivo para ${telefoneDestino}`
    ),
    telefoneDestino
  );

  if (!resposta) return null;

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => '');
    logger.erro(`Evolution API retornou erro ao enviar arquivo para ${telefoneDestino}`, {
      status: resposta.status,
      corpoErro,
    });
    throw new Error(`Evolution API retornou status ${resposta.status} ao enviar arquivo para ${telefoneDestino}`);
  }

  const resultado = await resposta.json().catch(() => null);
  registrarIdEnviadoPeloBot(resultado);
  return resultado;
}

async function enviarArquivo(telefoneDestino, caminhoArquivo, legenda) {
  let conteudoBase64;
  try {
    conteudoBase64 = fs.readFileSync(caminhoArquivo).toString('base64');
  } catch (erroDeLeitura) {
    logger.erro(`Falha ao ler o arquivo "${caminhoArquivo}" para enviar a ${telefoneDestino}`, erroDeLeitura);
    throw new Error(`Não foi possível ler o arquivo "${caminhoArquivo}": ${erroDeLeitura.message}`);
  }

  return enviarMedia(telefoneDestino, { nomeArquivo: path.basename(caminhoArquivo), legenda, conteudoBase64 });
}

// Usado para repassar um arquivo que já veio em base64 (ex.: PDF recebido do
// cliente, baixado via baixarMidia) sem precisar gravar em disco antes.
async function enviarDocumentoBase64(telefoneDestino, conteudoBase64, nomeArquivo, legenda) {
  return enviarMedia(telefoneDestino, { nomeArquivo, legenda, conteudoBase64 });
}

// Baixa o conteúdo (em base64) de uma mensagem de mídia recebida do cliente.
// O payload do webhook só traz uma referência à mídia (chave/tipo), não o
// arquivo em si — a Evolution API exige essa chamada separada, passando de
// volta o objeto de mensagem inteiro recebido no webhook (`data`), não só o id.
async function baixarMidia(mensagemBruta) {
  const url = `${env.EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${env.EVOLUTION_INSTANCE}`;

  const resposta = await fetchComRetentativa(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.EVOLUTION_API_KEY,
      },
      body: JSON.stringify({ message: mensagemBruta, convertToMp4: false }),
    },
    'Falha de rede ao baixar mídia recebida da Evolution API'
  );

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => '');
    logger.erro('Evolution API retornou erro ao baixar mídia recebida', { status: resposta.status, corpoErro });
    throw new Error(`Evolution API retornou status ${resposta.status} ao baixar mídia recebida`);
  }

  return resposta.json();
}

// Indicador "digitando..." do WhatsApp (chat presence), mostrado enquanto o
// bot processa a mensagem do cliente antes de responder. Puramente cosmético:
// diferente de enviarTexto/enviarMedia, uma falha aqui NUNCA pode propagar —
// não há retentativa nem lançamento de erro, só um log em nível aviso.
//
// PONTO A CONFIRMAR (não simulável em teste automatizado): o endpoint e o
// payload abaixo seguem a documentação pública da Evolution API
// (`POST /chat/sendPresence/{instance}`, `presence: "composing" | "paused"`),
// mas nenhuma outra função deste arquivo já chama esse endpoint contra esta
// instância específica — não há como garantir aqui que a versão da Evolution
// API em produção aceita exatamente este payload. Testar contra a instância
// real antes de confiar 100% neste comportamento.
const PRESENCE_TIMEOUT_MS = 5000; // bem menor que EVOLUTION_API_TIMEOUT_MS: é só efeito visual, não vale reter o processamento esperando.
const PRESENCE_DELAY_MS = 5000; // por quanto tempo o "digitando..." fica visível antes do WhatsApp voltar a "disponível" sozinho, caso a resposta demore mais que isso.

async function enviarPresenca(telefoneDestino, presence) {
  const url = `${env.EVOLUTION_API_URL}/chat/sendPresence/${env.EVOLUTION_INSTANCE}`;
  const controleTimeout = new AbortController();
  const timeoutId = setTimeout(() => controleTimeout.abort(), PRESENCE_TIMEOUT_MS);

  try {
    const resposta = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.EVOLUTION_API_KEY,
      },
      body: JSON.stringify({ number: telefoneDestino, presence, delay: PRESENCE_DELAY_MS }),
      signal: controleTimeout.signal,
      dispatcher: agenteSemConexaoOciosa,
    });

    if (!resposta.ok) {
      const corpoErro = await resposta.text().catch(() => '');
      logger.aviso(`Evolution API retornou erro ao enviar presence "${presence}" para ${telefoneDestino}`, {
        status: resposta.status,
        corpoErro,
      });
    }
  } catch (erro) {
    // Cosmético: uma falha aqui não pode impedir a resposta de verdade nem
    // derrubar quem chamou. Nível aviso (não erro) de propósito — não afeta o
    // cliente, só a experiência visual do "digitando...".
    logger.aviso(`Falha ao enviar presence "${presence}" para ${telefoneDestino} (ignorado, é só cosmético)`, erro.message);
  } finally {
    clearTimeout(timeoutId);
  }
}

// PRESENCE_DELAY_MS (5s) é bem menor que o tempo real de resposta do Agente
// de Vendas (10-29s, medido em produção — ver nota "Política onError 03/08"
// no workflow n8n). Um único enviarPresenca('composing') no início da
// mensagem faz o "digitando..." sumir sozinho no meio da espera, dando a
// entender que o bot travou. manterDigitando reenvia "composing" em loop
// (intervalo menor que PRESENCE_DELAY_MS, pra sempre renovar antes do
// WhatsApp reverter) enquanto uma chamada demorada (ex: n8nClient.
// consultarAgenteVendas) está em voo — quem chama é responsável por invocar
// a função de parada devolvida assim que a chamada demorada terminar
// (sucesso ou erro), tipicamente num `finally`.
const PRESENCE_HEARTBEAT_MS = 4000;

function manterDigitando(telefoneDestino) {
  enviarPresenca(telefoneDestino, 'composing').catch(() => {});
  const idIntervalo = setInterval(() => {
    enviarPresenca(telefoneDestino, 'composing').catch(() => {});
  }, PRESENCE_HEARTBEAT_MS);

  return function pararDigitando() {
    clearInterval(idIntervalo);
  };
}

module.exports = {
  enviarTexto, enviarArquivo, enviarDocumentoBase64, baixarMidia, foiEnviadaPeloBot, enviarPresenca,
  manterDigitando,
};
