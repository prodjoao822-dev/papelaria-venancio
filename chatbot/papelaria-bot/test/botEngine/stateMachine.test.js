// Testes da máquina de estados: como é uma função pura (sem I/O), dá pra
// exercitar qualquer fluxo do bot só chamando processarMensagem em sequência,
// sem precisar de Supabase, Evolution API nem variáveis de ambiente.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { estadoInicial, processarMensagem } = require('../../src/botEngine/stateMachine');
const ESCOLAS_CATALOGO = require('../../src/config/escolas.json');
const materiaisEscolares = require('../../src/config/materiaisEscolares');

describe('estado inicial', () => {
  test('começa sempre no menu principal, sem dados', () => {
    const sessao = estadoInicial();
    assert.equal(sessao.estado, 'MENU_PRINCIPAL');
    assert.deepEqual(sessao.dados, {});
  });
});

describe('menu principal', () => {
  test('opção 1 leva ao submenu de vendas', () => {
    const { sessao } = processarMensagem(estadoInicial(), '1');
    assert.equal(sessao.estado, 'SUBMENU_VENDAS');
  });

  test('opções 2/3/4 notificam o humano certo e permanecem no menu principal', () => {
    const casos = [
      ['2', 'financeiro'],
      ['3', 'compras'],
      ['4', 'servicos'],
    ];

    casos.forEach(([opcao, alvoEsperado]) => {
      const resultado = processarMensagem(estadoInicial(), opcao);
      assert.equal(resultado.sessao.estado, 'MENU_PRINCIPAL');
      assert.equal(resultado.acoes.length, 1);
      assert.equal(resultado.acoes[0].tipo, 'NOTIFICAR_HUMANO');
      assert.equal(resultado.acoes[0].alvo, alvoEsperado);
      assert.match(resultado.resposta, /momento/i);
    });
  });

  test('opção inválida mostra mensagem de erro e não muda de estado (menu já apresentado)', () => {
    const jaViuMenu = processarMensagem(estadoInicial(), 'oi').sessao;
    const resultado = processarMensagem(jaViuMenu, '9');
    assert.equal(resultado.sessao.estado, 'MENU_PRINCIPAL');
    assert.match(resultado.resposta, /Opção inválida/);
    // Não deve virar um passo de histórico navegável com "#".
    assert.equal(resultado.sessao.dados.estadoAnterior, undefined);
  });

  test('primeira mensagem de uma conversa nova mostra o menu sem acusar "opção inválida"', () => {
    const resultado = processarMensagem(estadoInicial(), 'Bom dia');
    assert.equal(resultado.sessao.estado, 'MENU_PRINCIPAL');
    assert.doesNotMatch(resultado.resposta, /Opção inválida/);
    assert.match(resultado.resposta, /Seja muito bem-vindo/);
    assert.equal(resultado.sessao.dados.menuApresentado, true);
  });

  test('depois que o menu já foi mostrado, uma nova opção inválida volta a acusar o erro', () => {
    const primeira = processarMensagem(estadoInicial(), 'Bom dia');
    const segunda = processarMensagem(primeira.sessao, '9');
    assert.match(segunda.resposta, /Opção inválida/);
  });

  test('saudação usa o primeiro nome do cliente quando disponível', () => {
    const resultado = processarMensagem(estadoInicial(), 'oi', { nomeCliente: 'Maria Souza' });
    assert.match(resultado.resposta, /Olá, Maria!/);
  });

  test('sem nome do cliente, a saudação cai na versão genérica', () => {
    const resultado = processarMensagem(estadoInicial(), 'oi');
    assert.match(resultado.resposta, /^\n\*Venâncio Papelaria\*\n\nOlá! Seja muito bem-vindo/);
  });

  test('mensagem de "aguardar atendimento" também usa o nome do cliente', () => {
    const resultado = processarMensagem(estadoInicial(), '2', { nomeCliente: 'João' });
    assert.match(resultado.resposta, /João/);
  });
});

describe('menu principal: horário de atendimento', () => {
  // Quarta-feira, 15/07/2026, 10h em America/Sao_Paulo (13h UTC) — dentro do horário.
  const QUARTA_10H_BRT = new Date('2026-07-15T13:00:00Z');
  // Mesma quarta-feira, 20h em America/Sao_Paulo (23h UTC) — fora do horário.
  const QUARTA_20H_BRT = new Date('2026-07-15T23:00:00Z');
  // Domingo, 19/07/2026, 10h em America/Sao_Paulo — loja fechada o dia todo.
  const DOMINGO_10H_BRT = new Date('2026-07-19T13:00:00Z');

  test('dentro do horário, mostra o cartão institucional mas sem o aviso de fechado', () => {
    const resultado = processarMensagem(estadoInicial(), 'oi', { agora: QUARTA_10H_BRT });
    assert.match(resultado.resposta, /Horários de Atendimento/);
    assert.match(resultado.resposta, /Av\. Primeira Avenida, 232/);
    assert.doesNotMatch(resultado.resposta, /fora do nosso horário/);
  });

  test('fora do horário num dia de semana, acrescenta o aviso de fechado', () => {
    const resultado = processarMensagem(estadoInicial(), 'oi', { agora: QUARTA_20H_BRT });
    assert.match(resultado.resposta, /fora do nosso horário/);
    assert.match(resultado.resposta, /Horários de Atendimento/);
    assert.match(resultado.resposta, /Av\. Eldes Scherrer, 1482/);
  });

  // A loja da Av. Central saiu da operação; o cartão não pode voltar a citá-la.
  test('o cartão institucional não menciona mais a loja da Av. Central', () => {
    const resultado = processarMensagem(estadoInicial(), 'oi', { agora: QUARTA_10H_BRT });
    assert.doesNotMatch(resultado.resposta, /Av\. Central/);
  });

  // Cada loja tem o seu horário: 9h-18h na Primeira Avenida, 8h30-19h na Eldes
  // Scherrer. O cartão precisa mostrar os dois, não uma média.
  test('o cartão mostra o horário de cada loja separadamente', () => {
    const resultado = processarMensagem(estadoInicial(), 'oi', { agora: QUARTA_10H_BRT });
    assert.match(resultado.resposta, /Segunda a Sexta: 9h às 18h/);
    assert.match(resultado.resposta, /Segunda a Sexta: 8h30 às 19h/);
  });

  // 08h40 e 18h40 estão fora do horário da Primeira Avenida, mas a Eldes
  // Scherrer está aberta — tem gente pra atender, então nada de aviso.
  test('a janela de atendimento cobre a união das duas lojas', () => {
    const QUARTA_8H40_BRT = new Date('2026-07-15T11:40:00Z');
    const QUARTA_18H40_BRT = new Date('2026-07-15T21:40:00Z');

    assert.doesNotMatch(
      processarMensagem(estadoInicial(), 'oi', { agora: QUARTA_8H40_BRT }).resposta,
      /fora do nosso horário/
    );
    assert.doesNotMatch(
      processarMensagem(estadoInicial(), 'oi', { agora: QUARTA_18H40_BRT }).resposta,
      /fora do nosso horário/
    );
  });

  test('domingo (sem expediente), acrescenta o aviso de fechado mesmo de manhã', () => {
    const resultado = processarMensagem(estadoInicial(), 'oi', { agora: DOMINGO_10H_BRT });
    assert.match(resultado.resposta, /fora do nosso horário/);
  });

  test('fora do horário, o cliente ainda navega o menu normalmente', () => {
    const resultado = processarMensagem(estadoInicial(), '1', { agora: QUARTA_20H_BRT });
    assert.equal(resultado.sessao.estado, 'SUBMENU_VENDAS');
  });
});

describe('submenu de vendas', () => {
  function irParaSubmenuVendas() {
    return processarMensagem(estadoInicial(), '1').sessao;
  }

  test('opção 1 leva ao primeiro passo da lista escolar', () => {
    const { sessao } = processarMensagem(irParaSubmenuVendas(), '1');
    assert.equal(sessao.estado, 'LISTA_ESCOLAR_ESCOLA');
    assert.deepEqual(sessao.dados.historicoEstados, ['MENU_PRINCIPAL', 'SUBMENU_VENDAS']);
  });

  test('opções 2 a 5 acionam o Agente de Vendas (CONSULTAR_AGENTE_VENDAS) e levam pro estado de handoff', () => {
    const casos = [
      ['2', 'material escolar'],
      ['3', 'material de escritório'],
      ['4', 'informática'],
      ['5', 'brinquedos'],
    ];

    casos.forEach(([opcao, intencaoEsperada]) => {
      const resultado = processarMensagem(irParaSubmenuVendas(), opcao);
      assert.equal(resultado.sessao.estado, 'AGENTE_VENDAS_ATIVO');
      assert.equal(resultado.acoes.length, 1);
      assert.equal(resultado.acoes[0].tipo, 'CONSULTAR_AGENTE_VENDAS');
      assert.equal(resultado.acoes[0].dados.intencao, intencaoEsperada);
    });
  });

  test('opção 6 (Atendimento) continua notificando a Vanessa direto, sem passar pelo Agente de Vendas', () => {
    const resultado = processarMensagem(irParaSubmenuVendas(), '6');
    assert.equal(resultado.sessao.estado, 'SUBMENU_VENDAS');
    assert.equal(resultado.acoes[0].tipo, 'NOTIFICAR_HUMANO');
    assert.equal(resultado.acoes[0].alvo, 'vendas');
    assert.equal(resultado.acoes[0].dados.intencao, 'atendimento');
  });

  // Bug relatado em produção (21/07): uma conversa retomada no meio do
  // submenu de vendas, ao receber uma saudação ("boa tarde"), acusava "opção
  // inválida" em vez de só reexibir o menu — confuso pro cliente que só
  // estava cumprimentando de novo, não tentando escolher uma opção.
  test('saudação no meio do submenu de vendas reexibe o menu, sem acusar "opção inválida"', () => {
    const resultado = processarMensagem(irParaSubmenuVendas(), 'boa tarde');
    assert.equal(resultado.sessao.estado, 'SUBMENU_VENDAS');
    assert.doesNotMatch(resultado.resposta, /Opção inválida/);
    assert.match(resultado.resposta, /Material escolar/);
  });
});

describe('estado de handoff AGENTE_VENDAS_ATIVO', () => {
  function irParaAgenteVendasAtivo() {
    let { sessao } = processarMensagem(estadoInicial(), '1'); // SUBMENU_VENDAS
    ({ sessao } = processarMensagem(sessao, '2')); // AGENTE_VENDAS_ATIVO
    return sessao;
  }

  test('comandos globais continuam funcionando mesmo no estado de handoff', () => {
    const sessaoNoAgente = irParaAgenteVendasAtivo();

    const menu = processarMensagem(sessaoNoAgente, 'menu');
    assert.equal(menu.sessao.estado, 'MENU_PRINCIPAL');

    const ajuda = processarMensagem(sessaoNoAgente, 'ajuda');
    assert.equal(ajuda.sessao.estado, 'AGENTE_VENDAS_ATIVO');
    assert.match(ajuda.resposta, /Comandos disponíveis/);

    const escalacao = processarMensagem(sessaoNoAgente, 'atendente');
    assert.equal(escalacao.sessao.estado, 'AGENTE_VENDAS_ATIVO');
    assert.equal(escalacao.acoes[0].tipo, 'NOTIFICAR_HUMANO');
    assert.equal(escalacao.acoes[0].alvo, 'lideranca');
  });
});

describe('fluxo completo de cotação pra empresa', () => {
  function irParaCotacaoEmpresa() {
    let { sessao } = processarMensagem(estadoInicial(), '1'); // SUBMENU_VENDAS
    ({ sessao } = processarMensagem(sessao, '7'));
    return sessao; // COTACAO_EMPRESA_LISTA
  }

  test('opção 7 do submenu de vendas leva ao primeiro passo (lista de itens)', () => {
    const sessao = irParaCotacaoEmpresa();
    assert.equal(sessao.estado, 'COTACAO_EMPRESA_LISTA');
  });

  test('coleta a lista de itens e depois a observação, então segue pro cadastro fiscal com a origem do orçamento pronta', () => {
    let { sessao } = processarMensagem(irParaCotacaoEmpresa(), '10 caixas de caneta azul\n5 resmas de papel A4');
    assert.equal(sessao.estado, 'COTACAO_EMPRESA_OBSERVACAO');
    assert.equal(sessao.dados.itensCotacaoEmpresa, '10 caixas de caneta azul\n5 resmas de papel A4');

    const final = processarMensagem(sessao, 'entregar até sexta, CNPJ 12.345.678/0001-99');
    assert.equal(final.sessao.estado, 'CADASTRO_FISCAL_ATALHO');
    assert.deepEqual(final.sessao.dados.origemOrcamento, {
      tipo: 'cotacao_empresa',
      escolaId: null,
      itensTexto: '10 caixas de caneta azul\n5 resmas de papel A4',
      observacoes: 'entregar até sexta, CNPJ 12.345.678/0001-99',
    });
    assert.match(final.resposta, /cadastro/i);
  });

  test('lista de itens e observação aceitam "menu"/"0" como texto livre, sem acionar o comando global', () => {
    let { sessao } = processarMensagem(irParaCotacaoEmpresa(), 'menu');
    assert.equal(sessao.estado, 'COTACAO_EMPRESA_OBSERVACAO');
    assert.equal(sessao.dados.itensCotacaoEmpresa, 'menu');

    const final = processarMensagem(sessao, '0');
    assert.equal(final.sessao.estado, 'CADASTRO_FISCAL_ATALHO');
    assert.equal(final.sessao.dados.origemOrcamento.observacoes, '0');
  });

  test('cliente com cadastro fiscal completo pula direto pro fechamento, sem entrar no cadastro fiscal', () => {
    const { sessao } = processarMensagem(irParaCotacaoEmpresa(), 'lista de itens');
    const final = processarMensagem(sessao, 'sem obs', { cadastroCompleto: true });

    assert.equal(final.sessao.estado, 'SUBMENU_VENDAS');
    assert.equal(final.acoes.length, 1);
    assert.equal(final.acoes[0].tipo, 'FINALIZAR_CADASTRO_E_PEDIDO');
    assert.equal(final.acoes[0].dados.cadastroFiscal, null);
    assert.equal(final.acoes[0].dados.origemOrcamento.tipo, 'cotacao_empresa');
    assert.match(final.resposta, /confirmando seu pedido/i);
  });

  test('reentrar no fluxo descarta a cotação anterior desta mesma conversa', () => {
    const { sessao: naObservacao } = processarMensagem(irParaCotacaoEmpresa(), 'lista antiga');
    const { sessao: deVoltaNoSubmenuVendas } = processarMensagem(naObservacao, 'obs antiga', { cadastroCompleto: true });
    assert.equal(deVoltaNoSubmenuVendas.estado, 'SUBMENU_VENDAS');

    const { sessao } = processarMensagem(deVoltaNoSubmenuVendas, '7'); // cotação de novo, sem passar por "1"
    assert.equal(sessao.dados.itensCotacaoEmpresa, undefined);
    assert.equal(sessao.dados.observacaoCotacaoEmpresa, undefined);
    assert.equal(sessao.dados.origemOrcamento, undefined);
  });
});

describe('fluxo completo de cadastro fiscal', () => {
  function irParaCadastroFiscal() {
    let { sessao } = processarMensagem(estadoInicial(), '1'); // SUBMENU_VENDAS
    ({ sessao } = processarMensagem(sessao, '7')); // COTACAO_EMPRESA_LISTA
    ({ sessao } = processarMensagem(sessao, 'itens de teste'));
    ({ sessao } = processarMensagem(sessao, 'sem observação')); // -> CADASTRO_FISCAL_ATALHO
    return sessao;
  }

  test('atalho "sim" pula direto pro fechamento só com CPF/CNPJ', () => {
    let { sessao } = processarMensagem(irParaCadastroFiscal(), 'sim');
    assert.equal(sessao.estado, 'CADASTRO_FISCAL_DOC_ATALHO');

    const final = processarMensagem(sessao, '123.456.789-09');
    assert.equal(final.sessao.estado, 'SUBMENU_VENDAS');
    assert.equal(final.acoes[0].tipo, 'FINALIZAR_CADASTRO_E_PEDIDO');
    assert.deepEqual(final.acoes[0].dados.cadastroFiscal, {
      tem_cadastro_previo: true,
      tipo_pessoa: 'PF',
      cpf: '12345678909',
    });
  });

  test('CPF/CNPJ inválido no atalho pede de novo sem avançar de estado', () => {
    const { sessao } = processarMensagem(irParaCadastroFiscal(), 'sim');
    const resultado = processarMensagem(sessao, '123');
    assert.equal(resultado.sessao.estado, 'CADASTRO_FISCAL_DOC_ATALHO');
  });

  test('fluxo PF completo: tipo pessoa -> CPF -> retirada -> nome -> telefone -> fechamento', () => {
    let { sessao } = processarMensagem(irParaCadastroFiscal(), 'não');
    assert.equal(sessao.estado, 'CADASTRO_FISCAL_TIPO_PESSOA');

    ({ sessao } = processarMensagem(sessao, '1')); // PF
    assert.equal(sessao.estado, 'CADASTRO_FISCAL_CPF');

    ({ sessao } = processarMensagem(sessao, '111.222.333-44'));
    assert.equal(sessao.estado, 'CADASTRO_FISCAL_ENTREGA');
    assert.equal(sessao.dados.cadastroFiscal.cpf, '11122233344');

    ({ sessao } = processarMensagem(sessao, '1')); // retirar na loja
    assert.equal(sessao.estado, 'CADASTRO_FISCAL_NOME');

    ({ sessao } = processarMensagem(sessao, 'Maria Souza'));
    assert.equal(sessao.estado, 'CADASTRO_FISCAL_TELEFONE_CONTATO');
    assert.equal(sessao.dados.cadastroFiscal.nome, 'Maria Souza');

    const final = processarMensagem(sessao, '11999998888');
    assert.equal(final.sessao.estado, 'SUBMENU_VENDAS');
    assert.equal(final.acoes[0].tipo, 'FINALIZAR_CADASTRO_E_PEDIDO');
    assert.equal(final.acoes[0].dados.cadastroFiscal.nome, 'Maria Souza');
    assert.equal(final.acoes[0].dados.cadastroFiscal.telefone_contato, '11999998888');
    assert.equal(final.acoes[0].dados.cadastroFiscal.cep, undefined); // retirada não pede endereço
    assert.equal(final.acoes[0].dados.origemOrcamento.tipo, 'cotacao_empresa');
    assert.match(final.resposta, /confirmando seu pedido/i);
  });

  // Bug de produção (20/07): no app do WhatsApp, Enter costuma ENVIAR a
  // mensagem em vez de quebrar linha — um cliente que digita nome e telefone
  // em linhas separadas manda, na prática, duas mensagens distintas. Antes da
  // correção, a primeira ("Maria Souza") já fechava o pedido sozinha (nome
  // sem telefone) e a segunda ("11999998888") virava uma opção inválida no
  // SUBMENU_VENDAS seguinte. Perguntas separadas (nome, depois telefone)
  // resolvem isso: cada mensagem responde exatamente uma pergunta.
  test('nome e telefone chegando como duas mensagens separadas não perdem nem duplicam o fechamento', () => {
    let { sessao } = processarMensagem(irParaCadastroFiscal(), 'não');
    ({ sessao } = processarMensagem(sessao, '1')); // PF
    ({ sessao } = processarMensagem(sessao, '111.222.333-44'));
    ({ sessao } = processarMensagem(sessao, '1')); // retirar na loja

    const apenasNome = processarMensagem(sessao, 'Maria Souza');
    assert.equal(apenasNome.sessao.estado, 'CADASTRO_FISCAL_TELEFONE_CONTATO');
    assert.equal(apenasNome.acoes.length, 0); // ainda não fecha o pedido

    const depoisDoTelefone = processarMensagem(apenasNome.sessao, '11999998888');
    assert.equal(depoisDoTelefone.sessao.estado, 'SUBMENU_VENDAS');
    assert.equal(depoisDoTelefone.acoes[0].tipo, 'FINALIZAR_CADASTRO_E_PEDIDO');
  });

  test('telefone de contato "não" mantém o WhatsApp como contato, sem gravar telefone_contato', () => {
    let { sessao } = processarMensagem(irParaCadastroFiscal(), 'não');
    ({ sessao } = processarMensagem(sessao, '1'));
    ({ sessao } = processarMensagem(sessao, '111.222.333-44'));
    ({ sessao } = processarMensagem(sessao, '1'));
    ({ sessao } = processarMensagem(sessao, 'Maria Souza'));

    const final = processarMensagem(sessao, 'não');
    assert.equal(final.acoes[0].dados.cadastroFiscal.telefone_contato, undefined);
  });

  test('fluxo PJ contribuinte pede CNPJ, Razão Social e Nome Fantasia em perguntas separadas e exige Inscrição Estadual', () => {
    let { sessao } = processarMensagem(irParaCadastroFiscal(), 'não');
    ({ sessao } = processarMensagem(sessao, '2')); // PJ
    assert.equal(sessao.estado, 'CADASTRO_FISCAL_CNPJ');

    ({ sessao } = processarMensagem(sessao, '12.345.678/0001-99'));
    assert.equal(sessao.estado, 'CADASTRO_FISCAL_RAZAO_SOCIAL');
    assert.equal(sessao.dados.cadastroFiscal.cnpj, '12345678000199');

    ({ sessao } = processarMensagem(sessao, 'Papelaria Exemplo LTDA'));
    assert.equal(sessao.estado, 'CADASTRO_FISCAL_NOME_FANTASIA');
    assert.equal(sessao.dados.cadastroFiscal.razao_social, 'Papelaria Exemplo LTDA');

    ({ sessao } = processarMensagem(sessao, 'Papelaria Exemplo'));
    assert.equal(sessao.estado, 'CADASTRO_FISCAL_INDICADOR_IE');
    assert.equal(sessao.dados.cadastroFiscal.nome_fantasia, 'Papelaria Exemplo');

    ({ sessao } = processarMensagem(sessao, '1')); // contribuinte
    assert.equal(sessao.estado, 'CADASTRO_FISCAL_INSCRICAO_ESTADUAL');

    const final = processarMensagem(sessao, '123456789');
    assert.equal(final.sessao.estado, 'CADASTRO_FISCAL_ENTREGA');
    assert.equal(final.sessao.dados.cadastroFiscal.inscricao_estadual, '123456789');
  });

  test('CNPJ inválido pede de novo sem avançar de estado', () => {
    const { sessao } = processarMensagem(irParaCadastroFiscal(), 'não');
    const { sessao: naoPf } = processarMensagem(sessao, '2');
    const resultado = processarMensagem(naoPf, '123');
    assert.equal(resultado.sessao.estado, 'CADASTRO_FISCAL_CNPJ');
  });

  test('fluxo PJ não contribuinte pula a pergunta de Inscrição Estadual', () => {
    let { sessao } = processarMensagem(irParaCadastroFiscal(), 'não');
    ({ sessao } = processarMensagem(sessao, '2'));
    ({ sessao } = processarMensagem(sessao, '12.345.678/0001-99'));
    ({ sessao } = processarMensagem(sessao, 'Papelaria Exemplo LTDA'));
    ({ sessao } = processarMensagem(sessao, 'Papelaria Exemplo'));

    const final = processarMensagem(sessao, '3'); // não contribuinte
    assert.equal(final.sessao.estado, 'CADASTRO_FISCAL_ENTREGA');
    assert.equal(final.sessao.dados.cadastroFiscal.indicador_ie, 'nao_contribuinte');
  });

  test('entrega pede CEP, endereço e cidade/estado antes do nome', () => {
    let { sessao } = processarMensagem(irParaCadastroFiscal(), 'não');
    ({ sessao } = processarMensagem(sessao, '1')); // PF
    ({ sessao } = processarMensagem(sessao, '111.222.333-44'));
    ({ sessao } = processarMensagem(sessao, '2')); // entrega
    assert.equal(sessao.estado, 'CADASTRO_FISCAL_CEP');

    ({ sessao } = processarMensagem(sessao, '12345-678'));
    assert.equal(sessao.estado, 'CADASTRO_FISCAL_ENDERECO');
    assert.equal(sessao.dados.cadastroFiscal.cep, '12345678');

    ({ sessao } = processarMensagem(sessao, 'Rua Exemplo, 123, Bairro Teste'));
    assert.equal(sessao.estado, 'CADASTRO_FISCAL_CIDADE_ESTADO');
    assert.equal(sessao.dados.cadastroFiscal.endereco, 'Rua Exemplo, 123, Bairro Teste');

    const final = processarMensagem(sessao, 'São Paulo, SP');
    assert.equal(final.sessao.estado, 'CADASTRO_FISCAL_NOME');
    assert.equal(final.sessao.dados.cadastroFiscal.cidade, 'São Paulo');
    assert.equal(final.sessao.dados.cadastroFiscal.estado, 'SP');
  });
});

describe('fluxo completo de lista escolar', () => {
  function irParaListaEscolar() {
    let { sessao } = processarMensagem(estadoInicial(), '1');
    ({ sessao } = processarMensagem(sessao, '1'));
    return sessao; // LISTA_ESCOLAR_ESCOLA
  }

  // A posição de cada escola no menu muda toda vez que o catálogo é regerado
  // (escolas.json vem de scripts/importarListasEscolares.js). Os testes buscam
  // a opção pelo nome pra continuar valendo quando uma escola entra ou sai.
  function opcaoDaEscola(nome) {
    const indice = ESCOLAS_CATALOGO.findIndex((escola) => escola.nome === nome);
    assert.notEqual(indice, -1, `escola "${nome}" não está no catálogo de teste`);
    return String(indice + 1);
  }

  // O menu de ano é montado por escola (só as turmas que ela tem, no vocabulário
  // dela), então a posição também muda a cada regeração do catálogo — mesma
  // razão de buscar pelo rótulo em vez de fixar o número.
  function opcaoDoAno(nomeEscola, rotulo) {
    const anos = materiaisEscolares.listarAnos(nomeEscola);
    const indice = anos.indexOf(rotulo);
    assert.notEqual(indice, -1, `"${rotulo}" não está no menu de ${nomeEscola}: ${anos.join(' / ')}`);
    return String(indice + 1);
  }

  // Última opção do menu de ano de uma escola com catálogo próprio.
  function opcaoOutroAno(nomeEscola) {
    return String(materiaisEscolares.listarAnos(nomeEscola).length + 1);
  }

  const OPCAO_OUTRA_ESCOLA = String(ESCOLAS_CATALOGO.length + 1);

  test('escola sem variação de período pula direto para observação', () => {
    let { sessao } = processarMensagem(irParaListaEscolar(), opcaoDaEscola('CEC'));
    assert.equal(sessao.estado, 'LISTA_ESCOLAR_ANO');

    ({ sessao } = processarMensagem(sessao, opcaoDoAno('CEC', '1º ano - Fundamental')));
    assert.equal(sessao.estado, 'LISTA_ESCOLAR_OBSERVACAO');

    const final = processarMensagem(sessao, 'sem observação');
    assert.equal(final.sessao.estado, 'SUBMENU_VENDAS');
    assert.equal(final.acoes[0].tipo, 'NOTIFICAR_HUMANO');
    assert.equal(final.acoes[0].dados.escola, 'CEC');
    assert.equal(final.acoes[0].dados.ano, '1º ano - Fundamental');
    assert.equal(final.acoes[0].dados.materialEnviadoAutomaticamente, true);
    assert.equal(final.acoes[1].tipo, 'ENVIAR_ARQUIVO');
    assert.equal(final.acoes[1].dados.nomeArquivo, '1-ano-fundamental.pdf');
  });

  test('Linus Pauling do 1º ao 5º ano pergunta o período antes da observação', () => {
    let { sessao } = processarMensagem(irParaListaEscolar(), opcaoDaEscola('Linus Pauling'));
    ({ sessao } = processarMensagem(sessao, opcaoDoAno('Linus Pauling', '1º ano - Fundamental')));
    assert.equal(sessao.estado, 'LISTA_ESCOLAR_PERIODO');

    ({ sessao } = processarMensagem(sessao, '1')); // Integral
    assert.equal(sessao.estado, 'LISTA_ESCOLAR_OBSERVACAO');
    assert.equal(sessao.dados.periodoSelecionado, 'Integral');

    const final = processarMensagem(sessao, 'nenhuma');
    assert.equal(final.acoes[1].dados.nomeArquivo, '1-ano-fundamental-integral.pdf');
  });

  // Educação Infantil não é traduzida pra "Maternal"/"Jardim": o menu mostra a
  // turma no vocabulário da escola e o PDF sai por ela.
  test('turma de Educação Infantil sai pelo nome que a escola usa', () => {
    let { sessao } = processarMensagem(irParaListaEscolar(), opcaoDaEscola('Múltipla'));
    ({ sessao } = processarMensagem(sessao, opcaoDoAno('Múltipla', 'Infantil 3')));
    assert.equal(sessao.estado, 'LISTA_ESCOLAR_OBSERVACAO');

    const final = processarMensagem(sessao, 'nenhuma');
    assert.equal(final.acoes[0].dados.ano, 'Infantil 3');
    assert.equal(final.acoes[1].tipo, 'ENVIAR_ARQUIVO');
    assert.equal(final.acoes[1].dados.nomeArquivo, 'infantil-3.pdf');
  });

  test('anuncia o anexo pelo que ele é: orçamento com preço ou lista sem preço', () => {
    let { sessao } = processarMensagem(irParaListaEscolar(), opcaoDaEscola('CEC'));
    ({ sessao } = processarMensagem(sessao, opcaoDoAno('CEC', '1º ano - Fundamental')));
    const comOrcamento = processarMensagem(sessao, 'nenhuma');
    assert.match(comOrcamento.resposta, /orçamento do material de CEC/);
    assert.equal(comOrcamento.acoes[0].dados.enviadoSemOrcamento, false);

    // Salesiano JC não tem orçamento do 5º ano na origem — vai a lista da escola.
    ({ sessao } = processarMensagem(irParaListaEscolar(), opcaoDaEscola('Salesiano JC')));
    ({ sessao } = processarMensagem(sessao, opcaoDoAno('Salesiano JC', '5º ano - Fundamental')));
    const semOrcamento = processarMensagem(sessao, 'nenhuma');
    assert.match(semOrcamento.resposta, /lista de material de Salesiano JC/);
    assert.equal(semOrcamento.acoes[0].dados.enviadoSemOrcamento, true);
  });

  test('o menu de ano só oferece o que aquela escola tem', () => {
    const { resposta } = processarMensagem(irParaListaEscolar(), opcaoDaEscola('Oceanus'));
    assert.match(resposta, /Grupo 2/);
    assert.match(resposta, /9º ano - Fundamental/);
    // Oceanus vai até o 9º ano: oferecer Ensino Médio levaria a uma escolha que
    // nunca resulta em PDF.
    assert.doesNotMatch(resposta, /Ensino Médio/);
  });

  test('turma fora do menu da escola é digitada e só notifica, sem enviar arquivo', () => {
    let { sessao } = processarMensagem(irParaListaEscolar(), opcaoDaEscola('Mundo Livre'));
    ({ sessao } = processarMensagem(sessao, opcaoOutroAno('Mundo Livre')));
    assert.equal(sessao.estado, 'LISTA_ESCOLAR_ANO_OUTRO');

    ({ sessao } = processarMensagem(sessao, 'Grupo 9'));
    assert.equal(sessao.estado, 'LISTA_ESCOLAR_OBSERVACAO');
    assert.equal(sessao.dados.anoSelecionado, 'Grupo 9');

    const final = processarMensagem(sessao, 'sem obs');
    assert.equal(final.acoes.length, 1);
    assert.equal(final.acoes[0].dados.ano, 'Grupo 9');
    assert.equal(final.acoes[0].dados.materialEnviadoAutomaticamente, false);
  });

  test('opção inválida no passo da escola não avança de estado', () => {
    const resultado = processarMensagem(irParaListaEscolar(), '999');
    assert.equal(resultado.sessao.estado, 'LISTA_ESCOLAR_ESCOLA');
    assert.match(resultado.resposta, /Opção inválida/);
  });

  test('opção "outra escola" (a última da lista) pede nome, ano, a lista de material e pula a pergunta de período', () => {
    let { sessao } = processarMensagem(irParaListaEscolar(), OPCAO_OUTRA_ESCOLA);
    assert.equal(sessao.estado, 'LISTA_ESCOLAR_ESCOLA_OUTRA_NOME');

    ({ sessao } = processarMensagem(sessao, 'Colégio Novo'));
    assert.equal(sessao.estado, 'LISTA_ESCOLAR_ANO');
    assert.equal(sessao.dados.escolaOutraNome, 'Colégio Novo');
    assert.equal(sessao.dados.escolaSelecionada, undefined);

    ({ sessao } = processarMensagem(sessao, '3')); // "1º ano - Fundamental"
    // pula período (sem dado de variação pra escola desconhecida) e pede a lista de material,
    // que é o dado principal pro Agente de Orçamento — sem isso não tem o que cotar.
    assert.equal(sessao.estado, 'LISTA_ESCOLAR_ESCOLA_OUTRA_LISTA_MATERIAL');

    ({ sessao } = processarMensagem(sessao, '5 cadernos, 2 lápis, 1 estojo'));
    assert.equal(sessao.estado, 'LISTA_ESCOLAR_OBSERVACAO');
    assert.equal(sessao.dados.listaMaterialOutraEscola, '5 cadernos, 2 lápis, 1 estojo');

    const final = processarMensagem(sessao, 'sem observação');
    assert.equal(final.sessao.estado, 'CADASTRO_FISCAL_ATALHO');
    assert.deepEqual(final.sessao.dados.origemOrcamento, {
      tipo: 'lista_escolar',
      escolaId: null,
      itensTexto: 'Escola: Colégio Novo (1º ano - Fundamental)\n5 cadernos, 2 lápis, 1 estojo',
      observacoes: 'sem observação',
    });
  });

  test('opção "outra escola" com cadastro fiscal já completo pula direto pro fechamento', () => {
    let { sessao } = processarMensagem(irParaListaEscolar(), OPCAO_OUTRA_ESCOLA);
    ({ sessao } = processarMensagem(sessao, 'Colégio Novo'));
    ({ sessao } = processarMensagem(sessao, '3'));
    ({ sessao } = processarMensagem(sessao, '5 cadernos'));

    const final = processarMensagem(sessao, 'sem obs', { cadastroCompleto: true });
    assert.equal(final.sessao.estado, 'SUBMENU_VENDAS');
    assert.equal(final.acoes[0].tipo, 'FINALIZAR_CADASTRO_E_PEDIDO');
    assert.equal(final.acoes[0].dados.cadastroFiscal, null);
    assert.equal(final.acoes[0].dados.origemOrcamento.tipo, 'lista_escolar');
  });
});

describe('comandos globais', () => {
  function irParaListaEscolarAno() {
    let { sessao } = processarMensagem(estadoInicial(), '1'); // SUBMENU_VENDAS
    ({ sessao } = processarMensagem(sessao, '1')); // LISTA_ESCOLAR_ESCOLA
    ({ sessao } = processarMensagem(sessao, '1')); // LISTA_ESCOLAR_ANO (a 1ª escola do catálogo)
    return sessao;
  }

  test('"0" e "menu" voltam ao menu principal e limpam o contexto do fluxo', () => {
    const sessaoNoMeioDoFluxo = irParaListaEscolarAno();

    ['0', 'menu', 'MENU', '  menu  '].forEach((comando) => {
      const resultado = processarMensagem(sessaoNoMeioDoFluxo, comando);
      assert.equal(resultado.sessao.estado, 'MENU_PRINCIPAL');
      assert.deepEqual(resultado.sessao.dados, {});
    });
  });

  test('"*" reinicia o atendimento do zero', () => {
    const resultado = processarMensagem(irParaListaEscolarAno(), '*');
    assert.equal(resultado.sessao.estado, 'MENU_PRINCIPAL');
    assert.deepEqual(resultado.sessao.dados, {});
  });

  test('"#" volta um passo (para o estado anterior), sem perder o fluxo inteiro', () => {
    const sessaoNoAno = irParaListaEscolarAno();
    assert.deepEqual(
      sessaoNoAno.dados.historicoEstados,
      ['MENU_PRINCIPAL', 'SUBMENU_VENDAS', 'LISTA_ESCOLAR_ESCOLA']
    );

    const resultado = processarMensagem(sessaoNoAno, '#');
    assert.equal(resultado.sessao.estado, 'LISTA_ESCOLAR_ESCOLA');
  });

  test('"#" repetido navega vários passos da pilha completa, não só um nível', () => {
    const sessaoNoAno = irParaListaEscolarAno(); // MENU -> SUBMENU_VENDAS -> ESCOLA -> ANO

    const umPasso = processarMensagem(sessaoNoAno, '#');
    assert.equal(umPasso.sessao.estado, 'LISTA_ESCOLAR_ESCOLA');

    const doisPassos = processarMensagem(umPasso.sessao, '#');
    assert.equal(doisPassos.sessao.estado, 'SUBMENU_VENDAS');

    const tresPassos = processarMensagem(doisPassos.sessao, '#');
    assert.equal(tresPassos.sessao.estado, 'MENU_PRINCIPAL');
    assert.equal(tresPassos.sessao.dados.historicoEstados, undefined);
  });

  test('"#" sem estado anterior conhecido cai no menu principal', () => {
    const resultado = processarMensagem(estadoInicial(), '#');
    assert.equal(resultado.sessao.estado, 'MENU_PRINCIPAL');
  });

  test('"ajuda" mostra a lista de comandos sem sair do estado atual', () => {
    const sessaoNoAno = irParaListaEscolarAno();
    const resultado = processarMensagem(sessaoNoAno, 'ajuda');

    assert.equal(resultado.sessao.estado, 'LISTA_ESCOLAR_ANO');
    assert.deepEqual(resultado.sessao.dados, sessaoNoAno.dados);
    assert.match(resultado.resposta, /Comandos disponíveis/);
    assert.match(resultado.resposta, /Qual o ano\?/);
  });

  test('a pergunta de observação aceita "menu" como texto livre, sem acionar o comando global', () => {
    let { sessao } = processarMensagem(estadoInicial(), '1');
    ({ sessao } = processarMensagem(sessao, '1')); // LISTA_ESCOLAR_ESCOLA
    ({ sessao } = processarMensagem(sessao, '1')); // LISTA_ESCOLAR_ANO (a 1ª escola do catálogo)
    ({ sessao } = processarMensagem(sessao, '3')); // "1º ano - Fundamental" -> observação

    assert.equal(sessao.estado, 'LISTA_ESCOLAR_OBSERVACAO');

    const final = processarMensagem(sessao, 'menu');
    assert.equal(final.sessao.estado, 'SUBMENU_VENDAS');
    assert.equal(final.acoes[0].dados.observacao, 'menu');
  });

  test('"atendente"/"reclamação" interrompe qualquer estado sem perder o fluxo, inclusive fora de texto livre', () => {
    const sessaoNoAno = irParaListaEscolarAno(); // LISTA_ESCOLAR_ANO não é aceitaTextoLivre
    const resultado = processarMensagem(sessaoNoAno, 'atendente');

    assert.equal(resultado.sessao.estado, 'LISTA_ESCOLAR_ANO');
    assert.deepEqual(resultado.sessao.dados, sessaoNoAno.dados);
    assert.equal(resultado.acoes.length, 1);
    assert.equal(resultado.acoes[0].tipo, 'NOTIFICAR_HUMANO');
    assert.equal(resultado.acoes[0].alvo, 'lideranca');
    assert.match(resultado.resposta, /atendente/i);
  });

  test('"reclamação" também interrompe estados de texto livre (aceitaTextoLivre: true), sem virar conteúdo do passo', () => {
    let { sessao } = processarMensagem(estadoInicial(), '1'); // SUBMENU_VENDAS
    ({ sessao } = processarMensagem(sessao, '7')); // COTACAO_EMPRESA_LISTA (aceitaTextoLivre: true)

    const resultado = processarMensagem(sessao, 'reclamação');
    assert.equal(resultado.sessao.estado, 'COTACAO_EMPRESA_LISTA');
    assert.equal(resultado.sessao.dados.itensCotacaoEmpresa, undefined);
    assert.equal(resultado.acoes[0].alvo, 'lideranca');
  });
});
