// Mapeia cada alvo de notificação (usado pelas ações NOTIFICAR_HUMANO
// disparadas pelos estados do bot) para o número de telefone humano
// responsável por receber a notificação.
//
// Os valores vêm de configResolver (tabela configuracoes_bot, editável pelo
// painel admin) em vez de env.js direto — desde o painel admin do bot
// (18/09/2026), o dono edita esses telefones sem tocar em código nem
// reiniciar o processo. `resolverAlvo` é assíncrono por isso: toda leitura
// pode envolver uma consulta ao Supabase (cacheada, ver configResolver.js).

const configResolver = require('./configResolver');

const CHAVE_POR_ALVO = {
  financeiro: 'telefone_financeiro',
  compras: 'telefone_compras',
  servicos: 'telefone_servicos',
  // Cobre a opção "Atendimento" e a lista escolar do submenu de vendas, além
  // da rede de segurança do Agente de Vendas (timeout/erro na consulta
  // síncrona). Material escolar/escritório/informática/brinquedos passam
  // primeiro pelo Agente de Vendas — só chegam aqui se ele falhar.
  vendas: 'telefone_vendas',
  // Comando global "atendente"/"reclamação" (ver comandosGlobais.js). Reaproveita
  // o telefone do financeiro por enquanto — trocar aqui se precisar de um número
  // separado pra escalação, sem precisar de uma chave nova.
  lideranca: 'telefone_financeiro',
};

async function resolverAlvo(alvo) {
  const chave = CHAVE_POR_ALVO[alvo];
  if (!chave) return null;
  return configResolver.obter(chave);
}

module.exports = { resolverAlvo };
