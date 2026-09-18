// Resolvedor de configurações de comportamento do bot armazenadas na tabela
// `configuracoes_bot` (painel admin, dono-only — ver
// supabase/extensao_painel_admin_config_bot_18-09.sql). A ALLOWLIST abaixo é
// a ÚNICA fonte de verdade de quais chaves existem, seu tipo e seus limites —
// tanto pra leitura (obter/obterTodos) quanto pra escrita
// (src/admin/adminConfigController.js). Nunca aceite uma chave fora dela.
//
// IMPORTANTE: segredos/credenciais (SUPABASE_SERVICE_KEY, EVOLUTION_API_KEY,
// WEBHOOK_SECRET_TOKEN, OPENROUTER_API_KEY, N8N_VENDAS_WEBHOOK_TOKEN) NUNCA
// entram nesta allowlist — continuam só em env.js, fora do alcance do painel
// admin e de qualquer rota /admin/*.
//
// Cache em memória com TTL de 60s, mesmo padrão já usado em
// escalonamentoService.js (_configCache/_configCacheExpiraEm) pra não bater
// no Supabase a cada leitura — aqui os valores são lidos em TODA mensagem de
// cliente (reativacaoBot, notifyTargets, n8nClient), então o custo por
// requisição sem cache seria real. Leitura é best-effort, no mesmo espírito
// de src/utils/logger.js: uma falha ao consultar o Supabase nunca pode
// quebrar quem chama, só cai pro default da allowlist.

const supabase = require('../services/supabaseClient');
const logger = require('../utils/logger');

const ALLOWLIST = {
  reactivation_timeout_minutos: {
    tipo: 'numero',
    descricao: 'Minutos de inatividade até o bot reativar sozinho uma conversa pausada.',
    minimo: 5,
    maximo: 1440,
    default: 120,
    categoria: 'timeouts',
  },
  telefone_financeiro: {
    tipo: 'telefone',
    descricao: 'Telefone que recebe notificação de financeiro/liderança (comando "atendente"/"reclamação").',
    minimo: null,
    maximo: null,
    default: null,
    categoria: 'telefones',
  },
  telefone_compras: {
    tipo: 'telefone',
    descricao: 'Telefone que recebe notificação de compras.',
    minimo: null,
    maximo: null,
    default: null,
    categoria: 'telefones',
  },
  telefone_servicos: {
    tipo: 'telefone',
    descricao: 'Telefone que recebe notificação de serviços.',
    minimo: null,
    maximo: null,
    default: null,
    categoria: 'telefones',
  },
  telefone_vendas: {
    tipo: 'telefone',
    descricao: 'Telefone (ou JID de grupo do WhatsApp, terminado em @g.us) que recebe notificação de vendas e a rede de segurança do Agente de Vendas.',
    minimo: null,
    maximo: null,
    default: null,
    categoria: 'telefones',
  },
  agente_vendas_timeout_ms: {
    tipo: 'numero',
    descricao: 'Prazo (ms) que o bot espera pelo Agente de Vendas antes de acionar a rede de segurança.',
    // Piso de segurança: achado A6 do diagnóstico de 30/07/2026 — um timeout
    // baixo demais causou pedido duplicado (ver comentário em
    // src/integracoes/n8nClient.js). O painel nunca consegue salvar abaixo disso.
    minimo: 20000,
    maximo: 120000,
    default: 55000,
    categoria: 'timeouts',
  },
  agente_vendas_habilitado: {
    tipo: 'booleano',
    descricao: 'Liga/desliga o Agente de Vendas (IA). Desligado, o bot usa direto a rede de segurança (mesmo comportamento de hoje quando a URL do n8n não está configurada).',
    minimo: null,
    maximo: null,
    default: true,
    categoria: 'recursos',
  },
};

const CACHE_TTL_MS = 60_000;

let _cache = null; // Map<chave, valor já coagido>
let _cacheExpiraEm = 0;
let _consultaEmVoo = null; // single-flight: cache-miss concorrente compartilha UMA consulta

function coagir(valorBruto, tipo) {
  if (tipo === 'numero') return Number(valorBruto);
  if (tipo === 'booleano') return Boolean(valorBruto);
  return String(valorBruto);
}

async function carregarDoSupabase() {
  const chaves = Object.keys(ALLOWLIST);
  const mapa = new Map();

  try {
    const { data, error } = await supabase
      .from('configuracoes_bot')
      .select('chave, valor')
      .in('chave', chaves);

    if (error) throw error;

    const linhasPorChave = new Map((data || []).map((linha) => [linha.chave, linha]));

    for (const chave of chaves) {
      const linha = linhasPorChave.get(chave);
      const meta = ALLOWLIST[chave];
      mapa.set(
        chave,
        linha && linha.valor !== null && linha.valor !== undefined
          ? coagir(linha.valor, meta.tipo)
          : meta.default
      );
    }
  } catch (erro) {
    logger.erro('Falha ao ler configuracoes_bot — usando os defaults da allowlist', erro);
    for (const chave of chaves) mapa.set(chave, ALLOWLIST[chave].default);
  }

  return mapa;
}

// Garante um cache fresco. Sem `await` entre o teste de `_consultaEmVoo` e a
// atribuição dela — o event loop não cede o controle nesse trecho, então duas
// chamadas concorrentes durante um cache-miss sempre compartilham a MESMA
// promise em voo (single-flight), nunca disparam duas consultas.
async function garantirCache() {
  if (_cache && Date.now() < _cacheExpiraEm) {
    return _cache;
  }

  if (!_consultaEmVoo) {
    _consultaEmVoo = carregarDoSupabase().finally(() => { _consultaEmVoo = null; });
  }

  _cache = await _consultaEmVoo;
  _cacheExpiraEm = Date.now() + CACHE_TTL_MS;
  return _cache;
}

async function obter(chave) {
  if (!(chave in ALLOWLIST)) {
    throw new Error(`configResolver.obter: chave "${chave}" não está na allowlist.`);
  }
  const cache = await garantirCache();
  return cache.get(chave);
}

async function obterTodos() {
  const cache = await garantirCache();
  return Object.keys(ALLOWLIST).map((chave) => {
    const meta = ALLOWLIST[chave];
    return {
      chave,
      valor: cache.get(chave),
      tipo: meta.tipo,
      descricao: meta.descricao,
      minimo: meta.minimo,
      maximo: meta.maximo,
      categoria: meta.categoria,
    };
  });
}

// O cache é um único mapa carregado em lote (todas as chaves da allowlist de
// uma vez). Invalidar qualquer chave, portanto, invalida o mapa inteiro —
// mais simples e seguro do que tentar remover só uma entrada, e o custo é o
// mesmo (uma única query em lote na próxima leitura).
function invalidar(chave) {
  if (chave !== undefined && !(chave in ALLOWLIST)) {
    throw new Error(`configResolver.invalidar: chave "${chave}" não está na allowlist.`);
  }
  _cache = null;
  _cacheExpiraEm = 0;
}

module.exports = {
  ALLOWLIST, obter, obterTodos, invalidar,
};
