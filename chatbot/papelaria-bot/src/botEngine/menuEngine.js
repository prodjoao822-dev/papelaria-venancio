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

// --- Texto livre dentro de um menu numérico (bug real de teste, 01/09) ---
//
// Depois de ver a lista escolar, uma cliente escreveu "Obrigado" no
// SUBMENU_VENDAS e caiu no fallback "Opção inválida" — confuso pra quem só
// estava agradecendo. A correção óbvia seria ampliar SAUDACOES acima com
// "obrigado", "vlw", "blz" etc., mas o dono do produto rejeitou esse caminho
// explicitamente: qualquer lista fixa de palavras é frágil por natureza —
// sempre existe uma variação nova ("show", "só isso mesmo então", uma
// pergunta livre qualquer) que a lista não prevê, e o mesmo bug reaparece.
// É reativo, não estrutural.
//
// A heurística adotada não tenta reconhecer O QUE o cliente escreveu, só SE
// a mensagem parece uma tentativa (frustrada) de digitar um número de opção
// que simplesmente não existe no menu (ex.: "8", "10") — nesse caso continua
// fazendo sentido o fallback "opção inválida, digite um número". Texto sem
// nenhum dígito não é uma tentativa de escolher número nenhum (é frase:
// agradecimento, despedida, pergunta livre...) e pedir pra digitar um número
// não ajuda em nada.
function pareceTentativaNumerica(texto) {
  return /\d/.test(texto);
}

function criarEstadoDeMenu(config) {
  const {
    STATE, cabecalho, rodape, opcoes, primeiraMensagemSemErro,
    // `textoLivreVaiPara` (opt-in por estado, config só de dados): chave de uma
    // opção já existente em `opcoes` — texto sem dígito que não é opção nem
    // saudação passa a se comportar como se o cliente tivesse escolhido essa
    // opção, em vez de cair no fallback de erro. Hoje só SUBMENU_VENDAS usa
    // isso (aponta pra uma opção `consultarAgente`): depois de ver
    // produtos/lista, o Agente de Vendas (LLM) é quem decide o que fazer com
    // "obrigado" ou uma pergunta de verdade — não uma lista de palavras-chave
    // daqui. MENU_PRINCIPAL não configura isso de propósito: não haveria pra
    // onde "cair" um texto livre nesse nível, e o caso real que existe nele
    // (primeira mensagem de uma conversa nova) já é resolvido por
    // `primeiraMensagemSemErro` — ver comentário de `pareceTentativaNumerica`
    // acima para o porquê desta heurística em vez de mais palavras-chave.
    textoLivreVaiPara,
  } = config;

  function mensagem(contexto = {}) {
    const cabecalhoTexto = cabecalho ? `${cabecalho(contexto)}\n\n` : '';
    const opcoesTexto = Object.entries(opcoes)
      .map(([numero, opcao]) => `${NUMERO_EMOJI[numero] || numero}  ${opcao.rotulo}`)
      .join('\n');
    return `\n${cabecalhoTexto}${rodape}\n\n${opcoesTexto}\n`;
  }

  function executarOpcao(opcao, dadosBase, contexto) {
    if (opcao.tipo === 'estado') {
      const dados = opcao.limparCampos
        ? Object.fromEntries(Object.entries(dadosBase).filter(([chave]) => !opcao.limparCampos.includes(chave)))
        : dadosBase;
      return { estado: opcao.estado, dados };
    }

    if (opcao.tipo === 'notificar') {
      const acoes = [{
        tipo: 'NOTIFICAR_HUMANO',
        alvo: opcao.alvo,
        dados: opcao.intencao ? { intencao: opcao.intencao } : {},
      }];

      // `pausarBot` na opção significa: a partir daqui quem responde é gente, o
      // atendimento automático sai de cena. Sem isso o bot prometia "já vamos te
      // atender por aqui!" e continuava respondendo — em 13/08 uma cliente
      // escolheu "Falar com um atendente", recebeu a promessa, disse "Oi" e
      // levou o menu de volta na cara.
      //
      // Vira AÇÃO, e não uma escrita aqui, porque este motor é função pura (sem
      // I/O): quem executa é o webhookController, igual já faz com
      // CONSULTAR_AGENTE_VENDAS.
      if (opcao.pausarBot) {
        acoes.push({
          tipo: 'PAUSAR_ATENDIMENTO_AUTOMATICO',
          dados: { motivo: `cliente escolheu "${opcao.rotulo}" no menu` },
        });
      }

      return {
        estado: opcao.proximoEstado || STATE,
        dados: dadosBase,
        resposta: mensagemAguardarAtendimento(contexto.nomeCliente),
        acoes,
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

    throw new Error(`menuEngine: tipo de opção desconhecido "${opcao.tipo}" (estado ${STATE})`);
  }

  function processar(textoRecebido, sessao, contexto = {}) {
    const texto = textoRecebido.trim();
    const opcaoEscolhida = opcoes[texto];

    const jaApresentado = Boolean(sessao.dados?.[FLAG_MENU_APRESENTADO]);
    const dadosBase = primeiraMensagemSemErro
      ? { ...sessao.dados, [FLAG_MENU_APRESENTADO]: true }
      : sessao.dados;

    if (opcaoEscolhida) {
      return executarOpcao(opcaoEscolhida, dadosBase, contexto);
    }

    if (ehSaudacao(texto)) {
      return { estado: STATE, dados: dadosBase, resposta: mensagem(contexto) };
    }

    // (!primeiraMensagemSemErro || jaApresentado): num estado que mostra o
    // menu inteiro na primeira mensagem (hoje só MENU_PRINCIPAL), a PRIMEIRA
    // mensagem da conversa tem que continuar mostrando esse menu completo
    // (endereço, horário etc.), não pular direto pra outra opção — o cliente
    // ainda nem viu as opções. `textoLivreVaiPara` só entra em ação depois que
    // o menu já foi apresentado ao menos uma vez.
    if (
      textoLivreVaiPara && texto.length > 0 && !pareceTentativaNumerica(texto)
      && (!primeiraMensagemSemErro || jaApresentado)
    ) {
      const opcaoDestino = opcoes[textoLivreVaiPara];
      // Substituir a intenção canônica da opção pelo texto real do cliente só
      // faz sentido pra "consultarAgente" — é o único tipo que usa esse texto
      // pra alimentar o Agente de Vendas; "estado"/"notificar" não têm onde
      // esse texto entrar, então mantêm o comportamento normal da opção alvo.
      const opcaoComTextoReal = opcaoDestino.tipo === 'consultarAgente'
        ? { ...opcaoDestino, intencao: textoRecebido.trim() }
        : opcaoDestino;
      return executarOpcao(opcaoComTextoReal, dadosBase, contexto);
    }

    const resposta = (primeiraMensagemSemErro && !jaApresentado)
      ? mensagem(contexto)
      : fallback.mensagemOpcaoInvalida(mensagem(contexto));
    return { estado: STATE, dados: dadosBase, resposta };
  }

  return { STATE, mensagem, processar };
}

module.exports = { criarEstadoDeMenu };
