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

// As duas lojas têm horários diferentes de segunda a sexta (ver LOJAS). O aviso
// de "fora do horário" é sobre o ATENDIMENTO, não sobre uma loja específica:
// enquanto qualquer uma delas estiver aberta tem gente pra responder, então a
// janela aqui é a união das duas — abre no mais cedo, fecha no mais tarde.
const HORARIO_SEMANA = { abre: 8.5, fecha: 19 }; // 08h30 (Eldes Scherrer) às 19h (Eldes Scherrer)
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
// Cada loja tem o seu horário logo abaixo do endereço: são diferentes de
// segunda a sexta, e uma linha única ("Segunda a Sexta: 9h às 18h") mandaria o
// cliente da Eldes Scherrer embora meia hora antes da loja fechar.
const CARTAO_INSTITUCIONAL = `✅ Nosso atendimento é por ordem de chegada das mensagens ou conforme a lista de espera, sempre prezando pela qualidade e atenção que você merece.

📍 *Nossas Lojas e Horários de Atendimento*

📌 *Av. Primeira Avenida, 232*
_em frente ao Shopping Laranjeiras_
🕑 Segunda a Sexta: 9h às 18h | Sábado: 9h às 14h

📌 *Av. Eldes Scherrer, 1482*
_ao lado do Ricardão Lanches_
🕑 Segunda a Sexta: 8h30 às 19h | Sábado: 9h às 14h

💙 Estamos prontos para te atender!`;

module.exports = { dentroDoHorarioDeAtendimento, NOME_LOJA, AVISO_FORA_DO_HORARIO, CARTAO_INSTITUCIONAL };
