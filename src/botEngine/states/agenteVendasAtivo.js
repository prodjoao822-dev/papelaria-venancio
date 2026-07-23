// Estado de handoff pro Agente de Vendas (n8n): enquanto a conversa estiver
// aqui, o webhookController intercepta texto livre ANTES de chamar a
// stateMachine e encaminha direto pro agente (ver B.2 do prompt de integração
// de webhooks de agentes) — por isso este módulo não exporta `processar()`.
// Só existe aqui pra dar suporte aos comandos globais que passam pela
// stateMachine normalmente (ex.: "ajuda" precisa de uma mensagem pra este
// estado; "menu"/"#"/"*" não chamam mensagem() nem processar() deste estado).

const STATE = 'AGENTE_VENDAS_ATIVO';

function mensagem() {
  return '\nVocê está falando com nosso time de vendas. Pode mandar sua dúvida por aqui!\n';
}

module.exports = { STATE, mensagem };
