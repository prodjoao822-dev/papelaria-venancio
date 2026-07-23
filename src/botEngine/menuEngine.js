// Motor genérico para estados de "menu simples": uma lista de opções
// numeradas onde cada opção só faz uma de duas coisas — leva a outro estado,
// ou notifica um humano e volta/permanece em algum estado. Cobre os casos
// onde a regra é inteiramente "opção X -> ação Y" (menu principal, submenu de
// vendas).
//
// Fluxos com lógica condicional de verdade (ex.: listaEscolar.js, que só
// pergunta o período pra algumas combinações de escola+ano e busca PDF por
// escola+ano+período) NÃO são "só menu" — são regra de negócio — e por isso
// continuam escritos à mão, fora deste motor (ver ARCHITECTURE_REVIEW.md,
// seção "Observação importante sobre o item 5").
//
// `criarEstadoDeMenu(config)` recebe uma configuração praticamente só de
// dados (nenhuma função obrigatória, exceto o cabeçalho quando personalizado)
// e devolve o `{ STATE, mensagem, processar }` que a stateMachine espera.

const fallback = require('./states/fallback');
const { mensagemAguardarAtendimento } = require('./mensagensComuns');

const NUMERO_EMOJI = {
  1: '1️⃣',
  2: '2️⃣',
  3: '3️⃣',
  4: '4️⃣',
  5: '5️⃣',
  6: '6️⃣',
  7: '7️⃣',
  8: '8️⃣',
  9: '9️⃣',
};

// Flag usada apenas quando `config.primeiraMensagemSemErro` está ativo (hoje,
// só o menu principal): evita acusar "opção inválida" na primeiríssima
// mensagem de uma conversa nova, que ainda não teve chance de ver o menu.
const FLAG_MENU_APRESENTADO = 'menuApresentado';

// Cumprimento não é uma tentativa de escolher uma opção — reexibe o menu
// atual sem o aviso de "opção inválida", em qualquer estado de menu (não só
// na 1ª mensagem da conversa, que já tinha essa leniência via
// `primeiraMensagemSemErro`). Cobre o caso de o cliente retomar uma conversa
// que ficou parada no meio de um submenu e cumprimentar de novo.
const SAUDACOES = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite'];

function ehSaudacao(texto) {
  return SAUDACOES.includes(texto.trim().toLowerCase());
}

function criarEstadoDeMenu(config) {
  const { STATE, cabecalho, rodape, opcoes, primeiraMensagemSemErro } = config;

  function mensagem(contexto = {}) {
    const cabecalhoTexto = cabecalho ? `${cabecalho(contexto)}\n\n` : '';
    const opcoesTexto = Object.entries(opcoes)
      .map(([numero, opcao]) => `${NUMERO_EMOJI[numero] || numero}  ${opcao.rotulo}`)
      .join('\n');
    return `\n${cabecalhoTexto}${rodape}\n\n${opcoesTexto}\n`;
  }

  function processar(textoRecebido, sessao, contexto = {}) {
    const texto = textoRecebido.trim();
    const opcao = opcoes[texto];

    const jaApresentado = Boolean(sessao.dados?.[FLAG_MENU_APRESENTADO]);
    const dadosBase = primeiraMensagemSemErro
      ? { ...sessao.dados, [FLAG_MENU_APRESENTADO]: true }
      : sessao.dados;

    if (!opcao) {
      if (ehSaudacao(texto)) {
        return { estado: STATE, dados: dadosBase, resposta: mensagem(contexto) };
      }

      const resposta = (primeiraMensagemSemErro && !jaApresentado)
        ? mensagem(contexto)
        : fallback.mensagemOpcaoInvalida(mensagem(contexto));
      return { estado: STATE, dados: dadosBase, resposta };
    }

    if (opcao.tipo === 'estado') {
      const dados = opcao.limparCampos
        ? Object.fromEntries(Object.entries(dadosBase).filter(([chave]) => !opcao.limparCampos.includes(chave)))
        : dadosBase;
      return { estado: opcao.estado, dados };
    }

    if (opcao.tipo === 'notificar') {
      return {
        estado: opcao.proximoEstado || STATE,
        dados: dadosBase,
        resposta: mensagemAguardarAtendimento(contexto.nomeCliente),
        acoes: [{
          tipo: 'NOTIFICAR_HUMANO',
          alvo: opcao.alvo,
          dados: opcao.intencao ? { intencao: opcao.intencao } : {},
        }],
      };
    }

    // Diferente de "notificar" (fire-and-forget, resposta genérica decidida
    // aqui), "consultarAgente" delega ao webhookController a chamada síncrona
    // ao Agente de Vendas — quem decide a resposta final ao cliente e se o
    // atendimento automático continua é o retorno dessa chamada, não esta
    // função pura (ver B.4 do prompt de integração / ARCHITECTURE_REVIEW.md).
    if (opcao.tipo === 'consultarAgente') {
      return {
        estado: opcao.estado,
        dados: dadosBase,
        acoes: [{
          tipo: 'CONSULTAR_AGENTE_VENDAS',
          dados: { intencao: opcao.intencao },
        }],
      };
    }

    throw new Error(`menuEngine: tipo de opção desconhecido "${opcao.tipo}" (estado ${STATE}, opção "${texto}")`);
  }

  return { STATE, mensagem, processar };
}

module.exports = { criarEstadoDeMenu };
