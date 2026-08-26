// Escalonamento automático de fila (PROMPT-01, Entrega 3).
//
// Quando uma conversa entra em espera humana (bot pausado), verifica se a fila
// ultrapassou o threshold configurável na tabela `configuracoes`. Se sim, envia
// uma mensagem automática ao cliente informando a posição e tempo estimado.
//
// O threshold e a mensagem são lidos da tabela `configuracoes` (chave/valor) —
// mesma tabela já existente no projeto, sem criar um `bot_config` novo.

const supabase = require('./supabaseClient');
const logger = require('../utils/logger');

// Cache em memória das configs de escalonamento — recarrega a cada 60s no máximo
// pra não bater no banco a cada webhook.
let _configCache = null;
let _configCacheExpiraEm = 0;
const CACHE_TTL_MS = 60_000;

const CONFIG_DEFAULTS = {
  escalonamento_threshold: 10,
  escalonamento_mensagem:
    'Nossa equipe está com alta demanda. Você é o Nº {posicao} na fila, tempo estimado de {minutos} minutos. Agradecemos a paciência! 🙏',
  escalonamento_tempo_estimado_por_posicao: 5, // minutos por posição na fila
};

/**
 * Lê as configurações de escalonamento da tabela `configuracoes`.
 * Usa cache em memória com TTL de 60s.
 */
async function lerConfigs() {
  if (_configCache && Date.now() < _configCacheExpiraEm) {
    return _configCache;
  }

  try {
    const { data, error } = await supabase
      .from('configuracoes')
      .select('chave, valor')
      .in('chave', Object.keys(CONFIG_DEFAULTS));

    if (error) {
      logger.erro('Erro ao ler configs de escalonamento', error);
      return CONFIG_DEFAULTS;
    }

    const config = { ...CONFIG_DEFAULTS };
    for (const row of (data ?? [])) {
      if (row.chave in CONFIG_DEFAULTS) {
        // Converte pra número se o default é numérico
        config[row.chave] = typeof CONFIG_DEFAULTS[row.chave] === 'number'
          ? Number(row.valor)
          : row.valor;
      }
    }

    _configCache = config;
    _configCacheExpiraEm = Date.now() + CACHE_TTL_MS;
    return config;
  } catch (err) {
    logger.erro('Exceção ao ler configs de escalonamento', err);
    return CONFIG_DEFAULTS;
  }
}

/**
 * Conta quantas conversas estão aguardando operador agora.
 */
async function contarFilaAtual() {
  const { count, error } = await supabase
    .from('conversas')
    .select('*', { count: 'exact', head: true })
    .eq('bot_ativo', false)
    .is('operador_id', null);

  if (error) {
    logger.erro('Erro ao contar fila de escalonamento', error);
    return 0;
  }

  return count ?? 0;
}

/**
 * Verifica se a fila atingiu o threshold e envia mensagem de posição na fila
 * ao cliente, se aplicável.
 *
 * Deve ser chamada APÓS pausarBot() (quando a conversa entra na fila humana).
 *
 * @param {string} telefoneCliente - Telefone do cliente no formato WhatsApp
 * @param {Function} enviarTexto - Função de envio (evolutionApi.enviarTexto)
 */
async function verificarEscalonamento(telefoneCliente, enviarTexto) {
  try {
    const config = await lerConfigs();
    const filaAtual = await contarFilaAtual();

    if (filaAtual < config.escalonamento_threshold) {
      return; // Fila dentro do normal, sem mensagem extra
    }

    const posicao = filaAtual;
    const minEstimado = posicao * (config.escalonamento_tempo_estimado_por_posicao || 5);

    const mensagem = config.escalonamento_mensagem
      .replace('{posicao}', String(posicao))
      .replace('{minutos}', String(minEstimado));

    logger.info(
      `Escalonamento ativado: fila=${filaAtual}, threshold=${config.escalonamento_threshold}. `
      + `Enviando mensagem de posição para ${telefoneCliente}.`
    );

    await enviarTexto(telefoneCliente, mensagem);
  } catch (err) {
    // Escalonamento é best-effort: não deve quebrar o fluxo principal do bot.
    logger.erro('Erro no escalonamento automático (ignorado)', err);
  }
}

module.exports = {
  verificarEscalonamento,
  lerConfigs,
  contarFilaAtual,
  // Expostos para os testes resetarem o cache entre rodadas
  get _configCache() { return _configCache; },
  set _configCache(v) { _configCache = v; },
  get _configCacheExpiraEm() { return _configCacheExpiraEm; },
  set _configCacheExpiraEm(v) { _configCacheExpiraEm = v; },
};

