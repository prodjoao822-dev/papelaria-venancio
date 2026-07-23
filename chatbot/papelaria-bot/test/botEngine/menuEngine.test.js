// Testes do motor genérico de menus simples (opção -> estado ou notificação).
// menuPrincipal.js e submenuVendas.js são só configuração em cima deste
// motor; esses testes cobrem a regra geral isoladamente da configuração de
// cada menu específico (que já é coberta via stateMachine.test.js).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { criarEstadoDeMenu } = require('../../src/botEngine/menuEngine');

function criarMenuDeTeste(overrides = {}) {
  return criarEstadoDeMenu({
    STATE: 'ESTADO_TESTE',
    rodape: 'Escolha uma opção:',
    opcoes: {
      1: { rotulo: 'Ir para outro estado', tipo: 'estado', estado: 'OUTRO_ESTADO' },
      2: { rotulo: 'Notificar', tipo: 'notificar', alvo: 'financeiro' },
    },
    ...overrides,
  });
}

describe('menuEngine: renderização da mensagem', () => {
  test('sem cabeçalho, mostra só o rodapé e as opções numeradas', () => {
    const menu = criarMenuDeTeste();
    assert.equal(menu.mensagem(), '\nEscolha uma opção:\n\n1️⃣  Ir para outro estado\n2️⃣  Notificar\n');
  });

  test('com cabeçalho, ele aparece antes do rodapé', () => {
    const menu = criarEstadoDeMenu({
      STATE: 'ESTADO_TESTE',
      cabecalho: (contexto) => `Oi, ${contexto.nomeCliente || 'visitante'}!`,
      rodape: 'Escolha uma opção:',
      opcoes: { 1: { rotulo: 'Opção única', tipo: 'estado', estado: 'X' } },
    });

    assert.equal(menu.mensagem({ nomeCliente: 'Ana' }), '\nOi, Ana!\n\nEscolha uma opção:\n\n1️⃣  Opção única\n');
  });
});

describe('menuEngine: opção do tipo "estado"', () => {
  test('transiciona para o estado configurado, mantendo os dados', () => {
    const menu = criarMenuDeTeste();
    const resultado = menu.processar('1', { estado: 'ESTADO_TESTE', dados: { algo: 'x' } });

    assert.equal(resultado.estado, 'OUTRO_ESTADO');
    assert.deepEqual(resultado.dados, { algo: 'x' });
    assert.equal(resultado.resposta, undefined);
  });

  test('"limparCampos" remove só as chaves listadas, preservando as demais', () => {
    const menu = criarEstadoDeMenu({
      STATE: 'ESTADO_TESTE',
      rodape: 'Escolha:',
      opcoes: {
        1: { rotulo: 'Reiniciar sub-fluxo', tipo: 'estado', estado: 'OUTRO', limparCampos: ['a', 'b'] },
      },
    });

    const resultado = menu.processar('1', {
      estado: 'ESTADO_TESTE',
      dados: { a: 1, b: 2, c: 3 },
    });

    assert.deepEqual(resultado.dados, { c: 3 });
  });
});

describe('menuEngine: opção do tipo "notificar"', () => {
  test('gera a ação NOTIFICAR_HUMANO com o alvo e a intenção configurados', () => {
    const menu = criarEstadoDeMenu({
      STATE: 'ESTADO_TESTE',
      rodape: 'Escolha:',
      opcoes: {
        1: { rotulo: 'Falar com vendas', tipo: 'notificar', alvo: 'vendas', intencao: 'orçamento' },
      },
    });

    const resultado = menu.processar('1', { estado: 'ESTADO_TESTE', dados: {} }, { nomeCliente: 'Bia' });

    assert.equal(resultado.estado, 'ESTADO_TESTE'); // sem proximoEstado, permanece no mesmo
    assert.match(resultado.resposta, /Bia/);
    assert.deepEqual(resultado.acoes, [
      { tipo: 'NOTIFICAR_HUMANO', alvo: 'vendas', dados: { intencao: 'orçamento' } },
    ]);
  });

  test('"proximoEstado" manda pra outro estado depois de notificar', () => {
    const menu = criarEstadoDeMenu({
      STATE: 'ESTADO_TESTE',
      rodape: 'Escolha:',
      opcoes: {
        1: { rotulo: 'Notificar e sair', tipo: 'notificar', alvo: 'compras', proximoEstado: 'MENU_PRINCIPAL' },
      },
    });

    const resultado = menu.processar('1', { estado: 'ESTADO_TESTE', dados: {} });
    assert.equal(resultado.estado, 'MENU_PRINCIPAL');
  });
});

describe('menuEngine: opção do tipo "consultarAgente"', () => {
  test('transiciona pro estado configurado e gera a ação CONSULTAR_AGENTE_VENDAS, sem resposta própria', () => {
    const menu = criarEstadoDeMenu({
      STATE: 'ESTADO_TESTE',
      rodape: 'Escolha:',
      opcoes: {
        1: {
          rotulo: 'Material escolar',
          tipo: 'consultarAgente',
          estado: 'AGENTE_VENDAS_ATIVO',
          intencao: 'material escolar',
        },
      },
    });

    const resultado = menu.processar('1', { estado: 'ESTADO_TESTE', dados: { algo: 'x' } });

    assert.equal(resultado.estado, 'AGENTE_VENDAS_ATIVO');
    assert.deepEqual(resultado.dados, { algo: 'x' });
    assert.equal(resultado.resposta, undefined);
    assert.deepEqual(resultado.acoes, [
      { tipo: 'CONSULTAR_AGENTE_VENDAS', dados: { intencao: 'material escolar' } },
    ]);
  });
});

describe('menuEngine: saudação', () => {
  test('reexibe o menu atual sem "opção inválida", mesmo depois de o menu já ter sido apresentado', () => {
    const menu = criarMenuDeTeste();
    const jaApresentado = { estado: 'ESTADO_TESTE', dados: { menuApresentado: true } };

    ['oi', 'Olá', 'BOM DIA', '  boa tarde  ', 'boa noite'].forEach((saudacao) => {
      const resultado = menu.processar(saudacao, jaApresentado);
      assert.equal(resultado.estado, 'ESTADO_TESTE');
      assert.doesNotMatch(resultado.resposta, /Opção inválida/);
      assert.match(resultado.resposta, /Ir para outro estado/);
    });
  });

  test('uma palavra qualquer que não é saudação nem opção válida continua acusando erro', () => {
    const menu = criarMenuDeTeste();
    const resultado = menu.processar('xablau', { estado: 'ESTADO_TESTE', dados: { menuApresentado: true } });
    assert.match(resultado.resposta, /Opção inválida/);
  });
});

describe('menuEngine: opção inválida', () => {
  test('sem "primeiraMensagemSemErro", sempre acusa erro', () => {
    const menu = criarMenuDeTeste();
    const resultado = menu.processar('9', { estado: 'ESTADO_TESTE', dados: {} });
    assert.match(resultado.resposta, /Opção inválida/);
  });

  test('com "primeiraMensagemSemErro", a primeira tentativa não acusa erro, a segunda sim', () => {
    const menu = criarMenuDeTeste({ primeiraMensagemSemErro: true });

    const primeira = menu.processar('9', { estado: 'ESTADO_TESTE', dados: {} });
    assert.doesNotMatch(primeira.resposta, /Opção inválida/);

    const segunda = menu.processar('9', primeira);
    assert.match(segunda.resposta, /Opção inválida/);
  });
});
