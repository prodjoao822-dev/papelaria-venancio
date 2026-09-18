// Endpoints do painel admin (dono-only, ver verifyAdmin.js) pra ler e editar
// `configuracoes_bot` — timeouts, telefones de notificação e liga/desliga de
// recursos do bot, sem precisar mexer em `.env` nem reiniciar o processo.
//
// A allowlist de chaves aceitas (tipo, mínimo/máximo, descrição) vive inteira
// em configResolver.js — este controller nunca inventa validação própria de
// "quais chaves existem", só valida o VALOR recebido pro tipo da chave.

const supabase = require('../services/supabaseClient');
const configResolver = require('../config/configResolver');
const logger = require('../utils/logger');

const REGEX_TELEFONE_DIGITOS = /^\d{10,15}$/;
// Aceita também JID de grupo/contato do WhatsApp — telefone_vendas de
// produção é hoje um JID de GRUPO (@g.us), não um número simples (ver
// comentário na migração e em configResolver.js).
const REGEX_TELEFONE_JID = /^\d{10,20}@(g\.us|s\.whatsapp\.net)$/;

// Devolve uma mensagem de erro (string) quando o valor é inválido pro tipo
// da chave, ou `null` quando está tudo certo.
function validarValor(meta, valor) {
  switch (meta.tipo) {
    case 'numero': {
      if (typeof valor !== 'number' || !Number.isFinite(valor)) {
        return 'valor deve ser um número finito.';
      }
      if (meta.minimo !== null && meta.minimo !== undefined && valor < meta.minimo) {
        return `valor mínimo permitido é ${meta.minimo}.`;
      }
      if (meta.maximo !== null && meta.maximo !== undefined && valor > meta.maximo) {
        return `valor máximo permitido é ${meta.maximo}.`;
      }
      return null;
    }
    case 'booleano':
      return typeof valor === 'boolean' ? null : 'valor deve ser true ou false.';
    case 'telefone':
      return typeof valor === 'string' && (REGEX_TELEFONE_DIGITOS.test(valor) || REGEX_TELEFONE_JID.test(valor))
        ? null
        : 'telefone deve ter de 10 a 15 dígitos, ou ser um JID de grupo/contato do WhatsApp (terminado em @g.us ou @s.whatsapp.net).';
    case 'texto':
      return typeof valor === 'string' && valor.trim() !== '' ? null : 'valor deve ser um texto não vazio.';
    default:
      return 'tipo de configuração desconhecido.';
  }
}

async function listar(req, res) {
  try {
    const itens = await configResolver.obterTodos();
    return res.status(200).json({ ok: true, itens });
  } catch (erro) {
    logger.erro('Falha ao listar configuracoes_bot', erro);
    return res.status(500).json({ ok: false, erro: 'Falha ao listar as configurações.' });
  }
}

async function atualizar(req, res) {
  const { chave } = req.params;
  const meta = configResolver.ALLOWLIST[chave];

  if (!meta) {
    return res.status(400).json({ ok: false, erro: `Configuração "${chave}" não é reconhecida.` });
  }

  const { valor } = req.body || {};
  const erroValidacao = validarValor(meta, valor);
  if (erroValidacao) {
    return res.status(400).json({ ok: false, erro: erroValidacao });
  }

  try {
    const { error } = await supabase
      .from('configuracoes_bot')
      .upsert({
        chave,
        valor,
        tipo: meta.tipo,
        descricao: meta.descricao,
        minimo: meta.minimo,
        maximo: meta.maximo,
        atualizado_por: req.operador.id,
      }, { onConflict: 'chave' });

    if (error) throw error;
  } catch (erro) {
    logger.erro(`Falha ao atualizar configuração "${chave}"`, erro);
    return res.status(500).json({ ok: false, erro: 'Falha ao salvar a configuração.' });
  }

  // Invalida ANTES do log: a mudança precisa ficar visível pro resto do bot
  // já na próxima leitura, sem esperar o TTL de 60s do cache.
  configResolver.invalidar(chave);

  // Telefones ainda são dado de contato real (não estão na allowlist de
  // mascaramento de logger.js, que é por NOME de campo, não por chave de
  // config) — trata com o mesmo cuidado, nunca loga o valor.
  logger.info('Config admin alterada', {
    chave,
    por: req.operador.id,
    ...(meta.tipo === 'telefone' ? {} : { valor }),
  });

  return res.status(200).json({ ok: true });
}

module.exports = { listar, atualizar };
