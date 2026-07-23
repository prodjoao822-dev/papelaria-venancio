// Estado do menu principal: opções Vendas, Financeiro, Compras e Serviços gráfica.
// Menu simples (opção -> próximo estado ou notificação), então é só
// configuração interpretada pelo menuEngine — ver menuEngine.js para a regra
// geral e ARCHITECTURE_REVIEW.md para o porquê de listaEscolar.js não seguir
// esse mesmo padrão.

const { criarEstadoDeMenu } = require('../menuEngine');
const { primeiroNome } = require('../mensagensComuns');
const horarioAtendimento = require('../horarioAtendimento');

module.exports = criarEstadoDeMenu({
  STATE: 'MENU_PRINCIPAL',

  // Cabeçalho "cartão de visita": nome da loja + saudação + (fora do
  // expediente) aviso de horário + horários/endereços das lojas. O cartão
  // institucional aparece sempre; só a linha de aviso é condicional ao
  // horário. `contexto.agora` é opcional, usado só pelos testes pra fixar um
  // instante — em produção usa o instante real.
  cabecalho: (contexto) => {
    const nome = primeiroNome(contexto.nomeCliente);
    const saudacao = nome ? `Olá, ${nome}!` : 'Olá!';

    const linhas = [horarioAtendimento.NOME_LOJA, '', `${saudacao} Seja muito bem-vindo(a)! 😊`];

    if (!horarioAtendimento.dentroDoHorarioDeAtendimento(contexto.agora)) {
      linhas.push('', horarioAtendimento.AVISO_FORA_DO_HORARIO);
    }

    linhas.push('', horarioAtendimento.CARTAO_INSTITUCIONAL);

    return linhas.join('\n');
  },

  rodape: 'Por favor, digite o número da opção desejada:',

  // Primeira mensagem de uma conversa nova (ex.: "Bom dia") ainda não é uma
  // resposta ao menu — o cliente nem chegou a ver as opções — então mostra o
  // menu direto, sem acusar "opção inválida" por algo que ele não teve chance
  // de acertar.
  primeiraMensagemSemErro: true,

  opcoes: {
    1: { rotulo: 'Vendas', tipo: 'estado', estado: 'SUBMENU_VENDAS' },
    2: { rotulo: 'Financeiro', tipo: 'notificar', alvo: 'financeiro' },
    3: { rotulo: 'Compras', tipo: 'notificar', alvo: 'compras' },
    4: { rotulo: 'Serviços / Xerox', tipo: 'notificar', alvo: 'servicos' },
  },
});
