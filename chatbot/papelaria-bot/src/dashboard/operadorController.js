// Rotas usadas pelo dashboard (venancio-ai-ops) para o operador agir sobre uma
// conversa de verdade. Reaproveita o evolutionApi.js do próprio bot (retry já
// ajustado e deduplicação de eco via idsEnviadosPeloBot) em vez de duplicar
// essa lógica num serviço separado — ver AUDITORIA_INTEGRACAO.md, item 1
// (fecha o ciclo operador -> WhatsApp real, que antes só gravava em
// `mensagens` sem nunca sair pro cliente).

const conversasService = require('../services/conversasService');
const mensagensService = require('../services/mensagensService');
const evolutionApi = require('../services/evolutionApi');
const operationalQueriesService = require('../services/operationalQueriesService');
const logger = require('../utils/logger');

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Limite generoso pro PDF de orçamento (texto/tabela só, sem imagem — na
// prática fica na casa de dezenas de KB), bem abaixo do limite de 25mb do
// express.json() em index.js. É só uma rede de segurança contra um payload
// absurdo antes de gastar tempo decodificando base64 e chamando a Evolution API.
const TAMANHO_MAX_BASE64 = 15 * 1024 * 1024;

async function enviarMensagem(req, res) {
  const { conversaId, conteudo } = req.body || {};

  if (typeof conversaId !== 'string' || !REGEX_UUID.test(conversaId)) {
    return res.status(400).json({ ok: false, erro: 'conversaId inválido.' });
  }
  if (typeof conteudo !== 'string' || !conteudo.trim()) {
    return res.status(400).json({ ok: false, erro: 'conteudo é obrigatório.' });
  }

  let conversa;
  try {
    conversa = await conversasService.buscarConversaComCliente(conversaId);
  } catch (erroBusca) {
    logger.erro(`Falha ao buscar conversa ${conversaId} para envio manual`, erroBusca);
    return res.status(500).json({ ok: false, erro: 'Falha ao buscar a conversa.' });
  }

  if (!conversa) {
    return res.status(404).json({ ok: false, erro: 'Conversa não encontrada.' });
  }
  // Guarda contra dois remetentes (bot + humano) respondendo ao mesmo tempo:
  // só deixa mandar mensagem manual se a IA já estiver pausada nesta conversa
  // (o operador precisa ter "assumido" a conversa antes, do lado do dashboard).
  if (conversa.bot_ativo) {
    return res.status(409).json({
      ok: false,
      erro: 'A IA ainda está ativa nesta conversa. Assuma a conversa antes de enviar uma mensagem manual.',
    });
  }

  const telefone = conversa.clientes?.telefone;
  if (!telefone) {
    return res.status(422).json({ ok: false, erro: 'Conversa sem telefone de cliente associado.' });
  }

  try {
    await evolutionApi.enviarTexto(telefone, conteudo);
  } catch (erroEnvio) {
    logger.erro(`Falha ao enviar mensagem manual do operador ${req.operador.id} na conversa ${conversaId}`, erroEnvio);
    return res.status(502).json({ ok: false, erro: 'Falha ao enviar a mensagem pelo WhatsApp. Tente novamente.' });
  }

  try {
    const mensagem = await mensagensService.registrarMensagem(conversaId, 'humano', conteudo, req.operador.id);
    return res.status(200).json({ ok: true, mensagem });
  } catch (erroRegistro) {
    // A mensagem já saiu de verdade pro cliente neste ponto — não reportar como
    // falha de envio (o operador reenviaria e duplicaria pro cliente). Só avisa
    // que o histórico pode ter ficado incompleto.
    logger.erro(`Mensagem enviada mas falhou ao registrar no histórico (conversa ${conversaId})`, erroRegistro);
    return res.status(200).json({ ok: true, mensagem: null, avisoHistorico: true });
  }
}

// Entrega a resposta de uma consulta operacional (Consultas IA) de volta pro
// WhatsApp do cliente — chamada pelo dashboard logo depois que o operador
// responde (operational-queries.service.js:responder). Diferente de
// enviarMensagem acima, não exige a IA pausada: a consulta pode ter sido
// respondida com o bot ainda ativo/conduzindo o resto da conversa (ver
// tool "Perguntar ao Operador" no Agente de Vendas).
async function notificarRespostaConsulta(req, res) {
  const { id } = req.params;

  if (typeof id !== 'string' || !REGEX_UUID.test(id)) {
    return res.status(400).json({ ok: false, erro: 'id inválido.' });
  }

  let consulta;
  try {
    consulta = await operationalQueriesService.buscarConsultaComCliente(id);
  } catch (erroBusca) {
    logger.erro(`Falha ao buscar consulta operacional ${id} para notificação`, erroBusca);
    return res.status(500).json({ ok: false, erro: 'Falha ao buscar a consulta.' });
  }

  if (!consulta) {
    return res.status(404).json({ ok: false, erro: 'Consulta não encontrada.' });
  }
  if (consulta.status !== 'respondida' || !consulta.resposta) {
    return res.status(409).json({ ok: false, erro: 'Consulta ainda não tem resposta registrada.' });
  }

  const telefone = consulta.clientes?.telefone;
  if (!telefone) {
    return res.status(422).json({ ok: false, erro: 'Consulta sem telefone de cliente associado.' });
  }

  const mensagem = consulta.produto_nome
    ? `Sobre sua dúvida em relação a "${consulta.produto_nome}": ${consulta.resposta}`
    : `Sobre sua dúvida: ${consulta.resposta}`;

  try {
    await evolutionApi.enviarTexto(telefone, mensagem);
  } catch (erroEnvio) {
    logger.erro(`Falha ao enviar resposta da consulta ${id} pelo WhatsApp`, erroEnvio);
    return res.status(502).json({ ok: false, erro: 'Falha ao enviar a mensagem pelo WhatsApp. Tente novamente.' });
  }

  // Registra no histórico da conversa (mesmo padrão de enviarMensagem acima) —
  // sem isso a resposta não aparecia no histórico do Atendimento nem na sessão
  // que o Agente de Vendas usa (a próxima mensagem do cliente cai de novo nele,
  // e sem esse registro ele não tem como saber que essa dúvida já foi
  // respondida). Best-effort: a mensagem já saiu de verdade pro cliente neste
  // ponto, uma falha só de registro não deve virar erro pro operador.
  if (consulta.conversa_id) {
    try {
      await mensagensService.registrarMensagem(consulta.conversa_id, 'humano', mensagem, req.operador.id);
    } catch (erroRegistro) {
      logger.erro(`Resposta da consulta ${id} enviada mas falhou ao registrar no histórico`, erroRegistro);
      return res.status(200).json({ ok: true, avisoHistorico: true });
    }
  }

  return res.status(200).json({ ok: true });
}

// Manda o PDF de um orçamento (gerado no dashboard) pro WhatsApp do cliente —
// chamado por orcamentos.service.js:enviarPdf. Diferente de enviarMensagem,
// não exige uma conversa com bot_ativo=false: mandar o PDF de um orçamento é
// um documento avulso, não "assumir" a conversa, então funciona mesmo pra
// cliente sem conversa em aberto (ex.: orçamento cadastrado manualmente).
async function enviarArquivoOrcamento(req, res) {
  const { telefone, base64, nomeArquivo, legenda } = req.body || {};

  if (typeof telefone !== 'string' || !telefone.trim()) {
    return res.status(400).json({ ok: false, erro: 'telefone é obrigatório.' });
  }
  if (typeof base64 !== 'string' || !base64.trim()) {
    return res.status(400).json({ ok: false, erro: 'base64 é obrigatório.' });
  }
  if (base64.length > TAMANHO_MAX_BASE64) {
    return res.status(413).json({ ok: false, erro: 'Arquivo grande demais.' });
  }
  if (typeof nomeArquivo !== 'string' || !nomeArquivo.trim()) {
    return res.status(400).json({ ok: false, erro: 'nomeArquivo é obrigatório.' });
  }

  try {
    await evolutionApi.enviarDocumentoBase64(telefone, base64, nomeArquivo, legenda || undefined);
    return res.status(200).json({ ok: true });
  } catch (erroEnvio) {
    logger.erro(`Falha ao enviar PDF de orçamento (operador ${req.operador.id}) para ${telefone}`, erroEnvio);
    return res.status(502).json({ ok: false, erro: 'Falha ao enviar o PDF pelo WhatsApp. Tente novamente.' });
  }
}

module.exports = { enviarMensagem, notificarRespostaConsulta, enviarArquivoOrcamento };
