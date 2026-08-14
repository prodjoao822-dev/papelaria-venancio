// Clientes dos webhooks dos agentes n8n: Agente de Orçamento e Agente de
// Vendas. Contrato JS Bot -> n8n do Agente de Orçamento definido no PRD
// (Claudeinstruções.md, seção 6): o JS Bot já criou cliente_id/orcamento_id/
// protocolo antes de chamar aqui — o n8n nunca cria nenhum dos dois, só
// recebe e processa.
//
// notificarAgenteOrcamento é best-effort: se a URL não estiver configurada ou
// a chamada falhar, loga e segue — nunca deve impedir a confirmação do
// pedido pro cliente, que já aconteceu antes desta chamada.
// consultarAgenteVendas é diferente: é síncrona, com timeout — ver comentário
// na própria função.

const { Agent } = require('undici');
const env = require('../config/env');
const logger = require('../utils/logger');
const mensagensService = require('../services/mensagensService');

// Mesmo tratamento já aplicado ao cliente da Evolution API (ver
// `agenteSemConexaoOciosa` em src/services/evolutionApi.js), que lá derrubou a
// maior parte dos ECONNRESET: o pool de keep-alive padrão do fetch reaproveita
// conexões que o outro lado já fechou, e o reset só aparece no uso seguinte.
// Este cliente tinha ficado de fora — em 08/08/2026, metade das chamadas ao
// Agente de Vendas ainda perdia a conexão logo depois de enviar. Pool próprio
// (host diferente do da Evolution) com conexão praticamente nova a cada
// requisição; o custo do handshake é irrelevante perto dos 6-18s do agente.
const agenteSemConexaoOciosa = new Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });

// Best-effort e fire-and-forget (ver comentário no topo do arquivo) — mas sem
// teto de tempo algum, uma trava do n8n do lado desta chamada bloqueava a
// resposta ao webhook da Evolution API indefinidamente (achado A6 do
// diagnóstico de 30/07/2026). Não precisa acompanhar o
// `AGENTE_VENDAS_TIMEOUT_MS` (hoje 55s, subido depois que a latência real do
// agente foi medida em 14-34s): essa chamada não decide a resposta ao cliente,
// que já recebeu o protocolo antes dela. Timeout aqui é só um aviso,
// nunca um erro fatal, e a exceção NUNCA é relançada: quem chama já mandou a
// confirmação ao cliente antes desta etapa (ver finalizarCadastroEPedido em
// actions.js).
const NOTIFICAR_AGENTE_ORCAMENTO_TIMEOUT_MS = 30000;

async function notificarAgenteOrcamento(payload) {
  if (!env.N8N_ORCAMENTO_WEBHOOK_URL) {
    logger.aviso('N8N_ORCAMENTO_WEBHOOK_URL não configurado; orçamento não foi notificado ao Agente de Orçamento.');
    return null;
  }

  const controleTimeout = new AbortController();
  const timeoutId = setTimeout(() => controleTimeout.abort(), NOTIFICAR_AGENTE_ORCAMENTO_TIMEOUT_MS);

  let resposta;
  try {
    resposta = await fetch(env.N8N_ORCAMENTO_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controleTimeout.signal,
      dispatcher: agenteSemConexaoOciosa,
    });
  } catch (erro) {
    if (erro.name === 'AbortError') {
      logger.aviso(`Timeout de ${NOTIFICAR_AGENTE_ORCAMENTO_TIMEOUT_MS}ms ao notificar o Agente de Orçamento via n8n`, {
        orcamentoId: payload.orcamento_id,
      });
      return null;
    }

    logger.erro('Falha de rede ao notificar o Agente de Orçamento via n8n', erro);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => '');
    logger.erro('Webhook do Agente de Orçamento retornou erro', { status: resposta.status, corpoErro });
    return null;
  }

  return resposta.json().catch(() => null);
}

// Cliente do webhook do Agente de Vendas (n8n). Ao contrário de
// notificarAgenteOrcamento (fire-and-forget), essa chamada é síncrona: o
// webhookController espera a resposta pra decidir o que mandar ao cliente e
// se o atendimento automático continua (ver B.3 do prompt de integração de
// webhooks de agentes). Timeout explícito porque o n8n não fala mais direto
// com a Evolution API nesse fluxo — sem resposta, o cliente ficaria sem
// mensagem nenhuma se não houvesse limite de espera.
//
// Retorna `null` em qualquer cenário de falha (sem URL configurada, timeout,
// erro de rede, status HTTP de erro, corpo de resposta fora do contrato) —
// nunca lança. Quem chama decide a rede de segurança a partir do `null`.
// Número de tentativas da chamada síncrona ao Agente de Vendas. A infra
// gratuita/compartilhada usada hoje (Cloudfy) derruba conexão de vez em
// quando com ECONNRESET/ETIMEDOUT mesmo sem nada de errado no bot ou no
// workflow — visto em teste real em 24/07. 1 retentativa absorve esse tipo de
// soluço passageiro antes de acionar o fallback (aviso ao cliente + pausa do
// bot), sem mudar o timeout de cada tentativa individual.
// Isso só vale pra falha de rede antes de chegar no n8n — timeout (AbortError)
// NUNCA entra nessa retentativa, ver comentário no catch abaixo.
const TENTATIVAS_AGENTE_VENDAS = 2;

const aguardar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Recuperação para o caso em que a execução n8n terminou com sucesso (o node
// "Supabase · Grava Resposta" já gravou a resposta do bot na tabela
// `mensagens`) mas o corpo HTTP se perdeu no caminho de volta — ver achado
// "bug-payload-vazio-cloudfy". NÃO é um retry da chamada ao Agente de Vendas
// (isso reexecutaria tools com efeito colateral, ver comentário no catch de
// AbortError acima) — é só uma leitura do resultado que já existe no banco.
// O prazo é dado por quem chama, porque os dois casos são diferentes:
//   - corpo vazio: a execução n8n JÁ TERMINOU, só falta a linha aparecer na
//     leitura — alguns segundos bastam;
//   - conexão caiu depois de enviar: a execução ACABOU DE COMEÇAR e ainda vai
//     levar o tempo normal do agente, hoje medido em 8 a 34 segundos.
// O 5×500ms fixo de antes servia só pro primeiro caso e por isso falhava no
// segundo — visto em 08/08/2026 ("Não foi possível recuperar após 5 tentativas"
// enquanto a execução n8n ainda estava rodando e terminou com sucesso).
const RECUPERACAO_INTERVALO_MS = 1000;
const RECUPERACAO_PRAZO_CORPO_VAZIO_MS = 8000;

async function recuperarRespostaViaSupabase(conversaId, desdeIso, prazoMs) {
  const limite = Date.now() + prazoMs;

  for (let tentativa = 1; Date.now() < limite; tentativa += 1) {
    // eslint-disable-next-line no-await-in-loop -- poll sequencial por design
    const mensagem = await mensagensService.buscarUltimaMensagemBotAposInstante(conversaId, desdeIso);
    // `conteudo` é uma coluna nullable (supabase/squemanovo.sql) e o node n8n
    // "Supabase · Grava Resposta" já gravou null aqui por bug de expressão
    // (ver sticky note "Fix · conteudo=null" no workflow) — sem esse guard, um
    // `resposta: null` "encontrado" passava como sucesso e quebrava a Evolution
    // API (400 "text is not of a type(s) string") em vez de cair no fallback
    // gracioso normal (que só acontece quando a função inteira retorna null).
    if (mensagem && typeof mensagem.conteudo === 'string' && mensagem.conteudo.trim() !== '') {
      logger.aviso(`[recuperacao-supabase] Resposta do Agente de Vendas recuperada via Supabase (tentativa ${tentativa})`, {
        conversaId,
      });
      return {
        resposta: mensagem.conteudo,
        // Não há como saber esses dois campos a partir da tabela `mensagens`
        // (só o node "Respond to Webhook" tinha essa informação, e o corpo
        // dele foi justamente o que se perdeu) — falha pro lado seguro: nunca
        // aciona humano/encerra o atendimento por conta própria aqui.
        encerrar_atendimento_ia: false,
        acionarHumano: false,
        motivo: null,
        tempoAgenteN8nMs: null,
        recuperadoViaSupabase: true,
      };
    }
    // eslint-disable-next-line no-await-in-loop -- poll sequencial por design
    await aguardar(RECUPERACAO_INTERVALO_MS);
  }

  logger.erro(`[recuperacao-supabase] Não foi possível recuperar a resposta do Agente de Vendas via Supabase em ${prazoMs}ms`, {
    conversaId,
  });
  return null;
}

// Distingue "a requisição nunca saiu" de "a requisição chegou e a resposta se
// perdeu". Mesmo critério usado no evolutionApi: `syscall: 'read'` quer dizer
// que o corpo foi escrito e o erro veio ao ler a resposta.
function requisicaoChegouAoN8n(erro) {
  return (erro?.cause ?? erro)?.syscall === 'read';
}

async function consultarAgenteVendas(payload) {
  if (!env.N8N_VENDAS_WEBHOOK_URL) {
    logger.erro('N8N_VENDAS_WEBHOOK_URL não configurado; não foi possível consultar o Agente de Vendas.');
    return null;
  }

  const inicioConsultaIso = new Date().toISOString();
  let resposta;
  for (let tentativa = 1; tentativa <= TENTATIVAS_AGENTE_VENDAS; tentativa += 1) {
    const controleTimeout = new AbortController();
    const timeoutId = setTimeout(() => controleTimeout.abort(), env.AGENTE_VENDAS_TIMEOUT_MS);

    try {
      // eslint-disable-next-line no-await-in-loop -- tentativas são sequenciais por design (só repete se a anterior falhou)
      resposta = await fetch(env.N8N_VENDAS_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Webhook do n8n passou a exigir auth (AUDITORIA_INTEGRACAO.md, item
          // 4) — antes estava totalmente aberto. Opcional aqui só pra não
          // quebrar quem ainda não configurou a credential no n8n; configure
          // os dois lados com o mesmo valor assim que possível.
          ...(env.N8N_VENDAS_WEBHOOK_TOKEN ? { 'x-n8n-webhook-token': env.N8N_VENDAS_WEBHOOK_TOKEN } : {}),
        },
        body: JSON.stringify(payload),
        signal: controleTimeout.signal,
        dispatcher: agenteSemConexaoOciosa,
      });
      break;
    } catch (erro) {
      if (erro.name === 'AbortError') {
        // Abortar o fetch aqui NÃO cancela a execução do lado do n8n — ela
        // continua rodando depois que o bot desiste. Tentar de novo depois de
        // um timeout cria uma 2ª execução concorrente pro mesmo orçamento, as
        // duas mexendo no mesmo registro ao mesmo tempo. Foi exatamente isso
        // que causou respostas duplicadas pro cliente e falha ao gravar o
        // pedido num teste real (30/07/2026) — por isso timeout nunca
        // tenta de novo, só falha direto e aciona a rede de segurança.
        logger.erro(`Timeout de ${env.AGENTE_VENDAS_TIMEOUT_MS}ms ao consultar o Agente de Vendas`, {
          conversaId: payload.conversa_id,
          tentativa,
        });
        return null;
      }

      // A conexão caiu DEPOIS de a requisição chegar: a execução já começou do
      // outro lado. Vale exatamente o mesmo raciocínio do AbortError acima —
      // tentar de novo cria uma 2ª execução concorrente pro mesmo orçamento.
      // Foi o que aconteceu em 08/08/2026: o bot desistiu às 16:11:38.595 (287ms,
      // 2 tentativas) e o n8n registrou DUAS execuções, 11437 e 11438, ambas
      // iniciadas depois disso e ambas concluídas com sucesso — o cliente ficou
      // sem resposta e a conversa foi pausada à toa, com o dobro do custo de LLM.
      //
      // Em vez de desistir, espera a resposta aparecer no banco. O prazo é o que
      // sobrou do orçamento de tempo da chamada original: o bot ia esperar isso
      // de qualquer forma se a conexão tivesse se mantido.
      if (requisicaoChegouAoN8n(erro)) {
        const prazoRestanteMs = Math.max(
          env.AGENTE_VENDAS_TIMEOUT_MS - (Date.now() - Date.parse(inicioConsultaIso)),
          RECUPERACAO_PRAZO_CORPO_VAZIO_MS
        );
        logger.aviso(
          'Conexão com o n8n caiu depois de enviar a requisição; a execução seguiu do outro lado — buscando a resposta no Supabase em vez de reenviar',
          { conversaId: payload.conversa_id, tentativa, prazoRestanteMs }
        );
        return recuperarRespostaViaSupabase(payload.conversa_id, inicioConsultaIso, prazoRestanteMs);
      }

      const ultimaTentativa = tentativa === TENTATIVAS_AGENTE_VENDAS;
      if (ultimaTentativa) {
        logger.erro('Falha de rede ao consultar o Agente de Vendas via n8n', { conversaId: payload.conversa_id, tentativa, erro });
        return null;
      }
      logger.aviso(`Falha de rede ao consultar o Agente de Vendas via n8n (tentativa ${tentativa}/${TENTATIVAS_AGENTE_VENDAS}) — tentando de novo`, {
        conversaId: payload.conversa_id,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => '');
    logger.erro('Webhook do Agente de Vendas retornou erro', { status: resposta.status, corpoErro });
    return null;
  }

  const CORPO_NAO_PARSEAVEL = Symbol('corpo-nao-parseavel');
  const corpo = await resposta.json().catch(() => CORPO_NAO_PARSEAVEL);

  if (corpo === CORPO_NAO_PARSEAVEL) {
    // Corpo vazio/não-JSON apesar de resposta.ok — o padrão do bug
    // "payload vazio Cloudfy": a execução n8n rodou com sucesso mas o corpo
    // HTTP se perdeu no caminho. Só este caso (não o de contrato inválido
    // abaixo) tenta recuperar via Supabase antes de desistir.
    logger.aviso('Webhook do Agente de Vendas retornou corpo vazio/não-parseável apesar de resposta.ok — tentando recuperar via Supabase', {
      conversaId: payload.conversa_id,
    });
    return recuperarRespostaViaSupabase(
      payload.conversa_id,
      inicioConsultaIso,
      RECUPERACAO_PRAZO_CORPO_VAZIO_MS
    );
  }

  if (!corpo || typeof corpo.resposta !== 'string') {
    logger.erro('Webhook do Agente de Vendas retornou payload fora do contrato esperado', corpo);
    return null;
  }

  // `acionar_humano`/`motivo` (opcionais): o agente decidiu que chegou a hora
  // de chamar um humano de verdade (ex.: cliente confirmou que quer pagar
  // agora) em vez de só continuar a conversa em texto — usado pelo fluxo de
  // "fechar/pagar" (ver webhookController.js). Enquanto o workflow do Agente
  // de Vendas no n8n não implementar esses campos, vêm undefined/false e o
  // comportamento é idêntico ao de antes desses dois campos existirem.
  return {
    resposta: corpo.resposta,
    encerrar_atendimento_ia: Boolean(corpo.encerrar_atendimento_ia),
    acionarHumano: Boolean(corpo.acionar_humano),
    motivo: corpo.motivo || null,
    // Instrumentação (análise de instabilidade, 29/07/2026): duração medida
    // pelo próprio workflow n8n (nodes "Marca Início/Fim Agente" em
    // AGENTE_VENDAS.json), do início do Agente de Vendas até o fim — só
    // presente quando o workflow já tem essa instrumentação. Deixa o
    // webhookController comparar "quanto demorou o n8n" com "quanto demorou
    // a chamada inteira", sem precisar adivinhar de novo.
    tempoAgenteN8nMs: typeof corpo._debug_tempo_agente_ms === 'number' ? corpo._debug_tempo_agente_ms : null,
  };
}

module.exports = { notificarAgenteOrcamento, consultarAgenteVendas };
