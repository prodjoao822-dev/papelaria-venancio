// Mapeia cada alvo de notificação (usado pelas ações NOTIFICAR_HUMANO
// disparadas pelos estados do bot) para o número de telefone humano
// responsável por receber a notificação.

const env = require('./env');

module.exports = {
  financeiro: env.PHONE_CHEFE,
  compras: env.PHONE_COMPRAS,
  servicos: env.PHONE_SERVICOS,
  // Cobre a opção "Atendimento" e a lista escolar do submenu de vendas, além
  // da rede de segurança do Agente de Vendas (timeout/erro na consulta
  // síncrona). Material escolar/escritório/informática/brinquedos passam
  // primeiro pelo Agente de Vendas — só chegam aqui se ele falhar.
  vendas: env.PHONE_VANESSA,
  // Comando global "atendente"/"reclamação" (ver comandosGlobais.js). Reaproveita
  // o telefone do chefe por enquanto — trocar aqui se precisar de um número
  // separado pra escalação, sem precisar de uma env var nova.
  lideranca: env.PHONE_CHEFE,
};
