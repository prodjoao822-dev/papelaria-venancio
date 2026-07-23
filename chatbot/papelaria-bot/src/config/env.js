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
  // Timeout da chamada síncrona ao Agente de Vendas. Valor inicial é um
  // chute (ver riscos documentados no prompt de integração) — ajustar depois
  // de medir o tempo real de resposta do agente em produção.
  AGENTE_VENDAS_TIMEOUT_MS: Number(process.env.AGENTE_VENDAS_TIMEOUT_MS || 12000),
};
