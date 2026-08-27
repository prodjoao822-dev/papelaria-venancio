// Testes de fronteira: dublê do client Supabase isolado (nunca um banco de
// verdade) — verificam que o service monta a chamada certa (tabela, filtro,
// nome/payload de RPC) e propaga erro/data corretamente, mesmo espírito dos
// testes de service do bot (chatbot/papelaria-bot/test/services).
import { separacaoSeparadorService } from '../separacaoSeparador.service';
import { separadorSupabase } from '../../supabase/separadorClient';

jest.mock('../../supabase/separadorClient', () => ({
  separadorSupabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

// Imita só o suficiente do contrato encadeável do PostgrestFilterBuilder
// real (select/order/eq/in/limit retornam `this`, e o builder é awaitable
// direto — como a query real do supabase-js).
function criarBuilder(resultado) {
  const builder = {};
  ['select', 'order', 'eq', 'in', 'limit'].forEach((metodo) => {
    builder[metodo] = jest.fn(() => builder);
  });
  builder.single = jest.fn(() => Promise.resolve(resultado));
  builder.then = (resolve, reject) => Promise.resolve(resultado).then(resolve, reject);
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listarMinhas', () => {
  it('busca em solicitacoes_separacao ordenado por criado_em desc', async () => {
    const builder = criarBuilder({ data: [{ id: 's1' }], error: null });
    separadorSupabase.from.mockReturnValue(builder);

    const resultado = await separacaoSeparadorService.listarMinhas();

    expect(separadorSupabase.from).toHaveBeenCalledWith('solicitacoes_separacao');
    expect(builder.order).toHaveBeenCalledWith('criado_em', { ascending: false });
    expect(builder.in).not.toHaveBeenCalled();
    expect(resultado).toEqual([{ id: 's1' }]);
  });

  it('aplica o filtro statusIn quando informado', async () => {
    const builder = criarBuilder({ data: [], error: null });
    separadorSupabase.from.mockReturnValue(builder);

    await separacaoSeparadorService.listarMinhas({ statusIn: ['pendente', 'em_andamento'] });

    expect(builder.in).toHaveBeenCalledWith('status', ['pendente', 'em_andamento']);
  });

  it('propaga o erro da query', async () => {
    const builder = criarBuilder({ data: null, error: new Error('falhou') });
    separadorSupabase.from.mockReturnValue(builder);

    await expect(separacaoSeparadorService.listarMinhas()).rejects.toThrow('falhou');
  });

  it('devolve array vazio quando data vem null', async () => {
    const builder = criarBuilder({ data: null, error: null });
    separadorSupabase.from.mockReturnValue(builder);

    expect(await separacaoSeparadorService.listarMinhas()).toEqual([]);
  });
});

describe('buscarPorId', () => {
  it('filtra por id e devolve o registro único', async () => {
    const builder = criarBuilder({ data: { id: 's1' }, error: null });
    separadorSupabase.from.mockReturnValue(builder);

    const resultado = await separacaoSeparadorService.buscarPorId('s1');

    expect(builder.eq).toHaveBeenCalledWith('id', 's1');
    expect(builder.single).toHaveBeenCalled();
    expect(resultado).toEqual({ id: 's1' });
  });

  it('propaga o erro quando não encontra', async () => {
    const builder = criarBuilder({ data: null, error: new Error('not found') });
    separadorSupabase.from.mockReturnValue(builder);

    await expect(separacaoSeparadorService.buscarPorId('inexistente')).rejects.toThrow('not found');
  });
});

describe('listarMensagens', () => {
  it('filtra por solicitacao_id ordenado do mais antigo pro mais novo', async () => {
    const builder = criarBuilder({ data: [{ id: 'm1' }], error: null });
    separadorSupabase.from.mockReturnValue(builder);

    const resultado = await separacaoSeparadorService.listarMensagens('s1');

    expect(separadorSupabase.from).toHaveBeenCalledWith('solicitacoes_separacao_mensagens');
    expect(builder.eq).toHaveBeenCalledWith('solicitacao_id', 's1');
    expect(builder.order).toHaveBeenCalledWith('criado_em', { ascending: true });
    expect(resultado).toEqual([{ id: 'm1' }]);
  });
});

describe('RPCs de mutação', () => {
  it('assumir chama assumir_separacao com o id da solicitação', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: { ok: true }, error: null });

    await separacaoSeparadorService.assumir('s1');

    expect(separadorSupabase.rpc).toHaveBeenCalledWith('assumir_separacao', { p_solicitacao_id: 's1' });
  });

  it('marcarItem repassa o id do item e o novo estado de separado', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: {}, error: null });

    await separacaoSeparadorService.marcarItem('si1', true);

    expect(separadorSupabase.rpc).toHaveBeenCalledWith('marcar_item_separado_solicitacao', {
      p_solicitacao_item_id: 'si1',
      p_separado: true,
    });
  });

  it('concluir chama concluir_separacao com o id da solicitação', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: {}, error: null });

    await separacaoSeparadorService.concluir('s1');

    expect(separadorSupabase.rpc).toHaveBeenCalledWith('concluir_separacao', { p_solicitacao_id: 's1' });
  });

  it('cancelar aceita motivo ausente como null', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: {}, error: null });

    await separacaoSeparadorService.cancelar('s1');

    expect(separadorSupabase.rpc).toHaveBeenCalledWith('cancelar_separacao', {
      p_solicitacao_id: 's1',
      p_motivo: null,
    });
  });

  it('enviarMensagem propaga erro da RPC', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: null, error: new Error('rede indisponível') });

    await expect(separacaoSeparadorService.enviarMensagem('s1', 'oi')).rejects.toThrow('rede indisponível');
  });

  it('marcarNotificacaoLida chama marcar_notificacao_lida com o id certo', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: {}, error: null });

    await separacaoSeparadorService.marcarNotificacaoLida('n1');

    expect(separadorSupabase.rpc).toHaveBeenCalledWith('marcar_notificacao_lida', { p_id: 'n1' });
  });
});

describe('listarNotificacoes', () => {
  it('sem destinatarioTipos informado, usa [separador] por padrão (compat) e limita a 50', async () => {
    const builder = criarBuilder({ data: [], error: null });
    separadorSupabase.from.mockReturnValue(builder);

    await separacaoSeparadorService.listarNotificacoes();

    expect(builder.in).toHaveBeenCalledWith('destinatario_tipo', ['separador']);
    expect(builder.limit).toHaveBeenCalledWith(50);
  });

  it('filtra só por entregador quando destinatarioTipos = [entregador]', async () => {
    const builder = criarBuilder({ data: [], error: null });
    separadorSupabase.from.mockReturnValue(builder);

    await separacaoSeparadorService.listarNotificacoes({ destinatarioTipos: ['entregador'] });

    expect(builder.in).toHaveBeenCalledWith('destinatario_tipo', ['entregador']);
  });

  it('filtra pelos dois tipos quando o funcionário acumula os dois papéis', async () => {
    const builder = criarBuilder({ data: [], error: null });
    separadorSupabase.from.mockReturnValue(builder);

    await separacaoSeparadorService.listarNotificacoes({ destinatarioTipos: ['separador', 'entregador'] });

    expect(builder.in).toHaveBeenCalledWith('destinatario_tipo', ['separador', 'entregador']);
  });

  it('não consulta o banco quando destinatarioTipos é uma lista vazia (funcionário sem papel mapeável)', async () => {
    const resultado = await separacaoSeparadorService.listarNotificacoes({ destinatarioTipos: [] });

    expect(separadorSupabase.from).not.toHaveBeenCalled();
    expect(resultado).toEqual([]);
  });

  it('aplica o filtro de não lidas quando pedido', async () => {
    const builder = criarBuilder({ data: [], error: null });
    separadorSupabase.from.mockReturnValue(builder);

    await separacaoSeparadorService.listarNotificacoes({ apenasNaoLidas: true });

    expect(builder.eq).toHaveBeenCalledWith('lida', false);
  });
});
