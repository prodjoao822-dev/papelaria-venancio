// Carrega e centraliza as variáveis de ambiente usadas pela aplicação.
// Falha rápido na subida se alguma variável obrigatória estiver faltando,
// para nunca deixar o bot rodar "pela metade" (ex.: sem número pra notificar alguém).

require('dotenv').config();

const VARIAVEIS_OBRIGATORIAS = [
  'EVOLUTION_API_URL',
  'EVOLUTION_API_KEY',
  'EVOLUTION_INSTANCE',
  'WEBHOOK_SECRET_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'PHONE_CHEFE',
  'PHONE_COMPRAS',
  'PHONE_SERVICOS',
  'PHONE_VANESSA',
];

function validar() {
  const faltando = VARIAVEIS_OBRIGATORIAS.filter((nome) => !process.env[nome]);

  if (faltando.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias não configuradas: ${faltando.join(', ')}. `
      + 'Confira o arquivo .env (use .env.example como referência).'
    );
  }
}

validar();

// Ver comentário de DASHBOARD_ORIGIN abaixo — lista separada por vírgula,
// parseada aqui uma vez só pro corsDashboard (src/index.js) comparar contra
// o Origin de cada requisição sem re-parsear a cada chamada.
const DASHBOARD_ORIGIN_RAW = process.env.DASHBOARD_ORIGIN || 'http://localhost:3000,http://localhost:3001';
const DASHBOARD_ORIGINS = DASHBOARD_ORIGIN_RAW.split(',').map((origem) => origem.trim()).filter(Boolean);

module.exports = {
  EVOLUTION_API_URL: process.env.EVOLUTION_API_URL,
  EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY,
  EVOLUTION_INSTANCE: process.env.EVOLUTION_INSTANCE,
  WEBHOOK_SECRET_TOKEN: process.env.WEBHOOK_SECRET_TOKEN,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
  PHONE_CHEFE: process.env.PHONE_CHEFE,
  PHONE_COMPRAS: process.env.PHONE_COMPRAS,
  PHONE_SERVICOS: process.env.PHONE_SERVICOS,
  PHONE_VANESSA: process.env.PHONE_VANESSA,
  REACTIVATION_TIMEOUT_MINUTES: Number(process.env.REACTIVATION_TIMEOUT_MINUTES || 120),
  PORT: Number(process.env.PORT || 3000),
  // Opcional (não entra em VARIAVEIS_OBRIGATORIAS): a integração com o Agente
  // de Orçamento no n8n ainda está sendo plugada. Sem essa variável,
  // n8nClient.js só loga um aviso e segue, sem quebrar o fluxo do bot.
  N8N_ORCAMENTO_WEBHOOK_URL: process.env.N8N_ORCAMENTO_WEBHOOK_URL,
  // Também opcional, mas por um motivo diferente do de cima: essa chamada é
  // síncrona e faz parte do fluxo principal (AGENTE_VENDAS_ATIVO). Sem essa
  // variável configurada, toda consulta cai direto na rede de segurança
  // (mensagem de espera + notifica humano + pausa o bot) — não quebra o bot,
  // mas não deve ficar assim em produção.
  N8N_VENDAS_WEBHOOK_URL: process.env.N8N_VENDAS_WEBHOOK_URL,
  // Timeout da chamada síncrona ao Agente de Vendas. Default de 55s reflete a
  // latência real medida em produção em 11/08/2026 (14-34s) — um default menor
  // estoura em toda conversa e deixa a execução do n8n órfã, escrevendo no
  // banco depois que o bot já desistiu (causa raiz do incidente de pedidos
  // duplicados). Não reduzir sem medir de novo.
  AGENTE_VENDAS_TIMEOUT_MS: Number(process.env.AGENTE_VENDAS_TIMEOUT_MS || 55000),
  // Origem (schema+host+porta) do dashboard (venancio-ai-ops), usada no CORS
  // das rotas /operador/* (envio manual de mensagem, notificação de Consultas
  // IA). Aceita uma lista separada por vírgula — o Vite do dashboard troca de
  // porta sozinho (3000 -> 3001, 3002...) sempre que a porta padrão já está
  // ocupada, e travar num único valor fixo aqui derruba o CORS assim que isso
  // acontece (causa raiz confirmada em diagnóstico real, 07/08/2026: dashboard
  // subiu em :3001, servidor só liberava :3000, navegador bloqueou por CORS
  // mesmo com o preflight OPTIONS respondendo certo). Ver DASHBOARD_ORIGINS
  // abaixo (array já parseado) e corsDashboard em src/index.js.
  DASHBOARD_ORIGIN: DASHBOARD_ORIGIN_RAW,
  DASHBOARD_ORIGINS: DASHBOARD_ORIGINS,
  // Token enviado no header x-n8n-webhook-token ao chamar o webhook do Agente
  // de Vendas (opcional só pra não quebrar quem ainda não configurou a
  // credential Header Auth correspondente no n8n — ver AGENTE_VENDAS.json,
  // node "Webhook · Agente Vendas"). Configure os dois lados com o mesmo valor.
  N8N_VENDAS_WEBHOOK_TOKEN: process.env.N8N_VENDAS_WEBHOOK_TOKEN,
  // Chave da OpenRouter usada por src/utils/mediaProcessor.js pra transcrever
  // áudio e descrever imagem recebidos do cliente (PROMPT-03, Entrega 2).
  // Opcional: sem ela, o bot cai automaticamente no fallback de sempre
  // (avisar a equipe de vendas) em vez de travar — ver aviso em
  // mediaProcessor.js.
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
};

// Aviso de boot para variáveis do Agente de Vendas (n8n) — achado A5 do
// diagnóstico de 30/07/2026. Não entram em VARIAVEIS_OBRIGATORIAS (que lança
// erro fatal) de propósito: ambientes de teste/dev sem n8n configurado
// continuam subindo normalmente, só com a IA de vendas desativada. Mas a
// ausência em produção desativa o Agente de Vendas silenciosamente (toda
// consulta cai na rede de segurança), então avisamos alto no console no boot.
if (!process.env.N8N_VENDAS_WEBHOOK_URL) {
  // eslint-disable-next-line no-console
  console.warn('[AVISO] N8N_VENDAS_WEBHOOK_URL não configurada — Agente de Vendas desativado.');
}
if (!process.env.N8N_VENDAS_WEBHOOK_TOKEN) {
  // eslint-disable-next-line no-console
  console.warn('[AVISO] N8N_VENDAS_WEBHOOK_TOKEN não configurado — webhook do Agente de Vendas sem autenticação real.');
}
