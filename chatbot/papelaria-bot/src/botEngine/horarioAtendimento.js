// Horário de atendimento da loja e os textos institucionais (horários +
// endereços) usados no cabeçalho do menu principal. O cartão institucional
// (`CARTAO_INSTITUCIONAL`) aparece sempre, dentro ou fora do expediente; fora
// do expediente, o cabeçalho acrescenta só uma linha de aviso extra
// (`AVISO_FORA_DO_HORARIO`) — o cliente navega o menu normalmente nos dois
// casos, isso aqui só monta o texto mostrado.

// Fuso fixo (loja física, sem operação em outro fuso) — calculado explicitamente
// em vez de usar o horário local do processo, porque em produção (Railway/Render)
// o servidor roda em UTC, não no horário de Brasília.
const FUSO_HORARIO = 'America/Sao_Paulo';

const HORARIO_SEMANA = { abre: 9, fecha: 18 }; // segunda a sexta
const HORARIO_SABADO = { abre: 9, fecha: 14 };

const DIA_SEMANA_POR_ABREVIACAO = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Extrai dia da semana e hora (com fração de minutos) já convertidos para o
// fuso da loja, a partir de um Date qualquer (que internamente é sempre UTC).
function partesNoFusoDaLoja(data) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO_HORARIO,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(data);

  const mapa = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));

  return {
    diaSemana: DIA_SEMANA_POR_ABREVIACAO[mapa.weekday],
    hora: Number(mapa.hour) + Number(mapa.minute) / 60,
  };
}

// `data` é opcional só pra permitir controlar o "agora" nos testes — em
// produção o chamador não passa nada e usa o instante real.
function dentroDoHorarioDeAtendimento(data = new Date()) {
  const { diaSemana, hora } = partesNoFusoDaLoja(data);

  if (diaSemana >= 1 && diaSemana <= 5) {
    return hora >= HORARIO_SEMANA.abre && hora < HORARIO_SEMANA.fecha;
  }

  if (diaSemana === 6) {
    return hora >= HORARIO_SABADO.abre && hora < HORARIO_SABADO.fecha;
  }

  return false; // domingo
}

// Nome de exibição da loja, no topo de toda mensagem do menu principal
// (estilo "papel timbrado") — negrito é o `*asteriscos*` do WhatsApp.
const NOME_LOJA = '*Venâncio Papelaria*';

// Só aparece fora do horário de atendimento (ver `dentroDoHorarioDeAtendimento`).
const AVISO_FORA_DO_HORARIO = '⏰ No momento estamos fora do nosso horário de '
  + 'atendimento, mas pode deixar sua mensagem — assim que abrirmos, alguém '
  + 'do nosso time já te chama!';

// Aparece sempre no cabeçalho do menu principal, dentro ou fora do expediente.
const CARTAO_INSTITUCIONAL = `✅ Nosso atendimento é por ordem de chegada das mensagens ou conforme a lista de espera, sempre prezando pela qualidade e atenção que você merece.

🕑 *Horários de Atendimento*
📅 Segunda a Sexta: 9h às 18h
📅 Sábado: 9h às 14h

📍 *Nossas Lojas*
📌 Av. Central, 1270
📌 Av. Primeira Avenida, 232 (em frente ao Shopping Laranjeiras)
📌 Av. Eldes Scherrer, 1482 (ao lado do Ricardão Lanches)

💙 Estamos prontos para te atender!`;

module.exports = { dentroDoHorarioDeAtendimento, NOME_LOJA, AVISO_FORA_DO_HORARIO, CARTAO_INSTITUCIONAL };
