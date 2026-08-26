// Mesmo espírito de separacaoSeparador.service.test.js: dublê do client
// Supabase isolado (nunca um banco de verdade) — verifica que o service
// monta a chamada certa (tabela, filtro, nome/payload de RPC) e propaga
// erro/data corretamente.
import { entregaEntregadorService } from '../entregaEntregador.service';
import { separadorSupabase } from '../../supabase/separadorClient';

jest.mock('../../supabase/separadorClient', () => ({
  separadorSupabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

// Imita só o suficiente do contrato encadeável do PostgrestFilterBuilder
// real (select/order/eq/in retornam `this`, e o builder é awaitable direto).
function criarBuilder(resultado) {
  const builder = {};
  ['select', 'order', 'eq', 'in'].forEach((metodo) => {
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
  it('busca em solicitacoes_entrega ordenado por criado_em desc', async () => {
    const builder = criarBuilder({ data: [{ id: 'e1' }], error: null });
    separadorSupabase.from.mockReturnValue(builder);

    const resultado = await entregaEntregadorService.listarMinhas();

    expect(separadorSupabase.from).toHaveBeenCalledWith('solicitacoes_entrega');
    expect(builder.order).toHaveBeenCalledWith('criado_em', { ascending: false });
    expect(builder.in).not.toHaveBeenCalled();
    expect(resultado).toEqual([{ id: 'e1' }]);
  });

  it('aplica o filtro statusIn quando informado', async () => {
    const builder = criarBuilder({ data: [], error: null });
    separadorSupabase.from.mockReturnValue(builder);

    await entregaEntregadorService.listarMinhas({ statusIn: ['pendente', 'em_rota'] });

    expect(builder.in).toHaveBeenCalledWith('status', ['pendente', 'em_rota']);
  });

  it('propaga o erro da query', async () => {
    const builder = criarBuilder({ data: null, error: new Error('falhou') });
    separadorSupabase.from.mockReturnValue(builder);

    await expect(entregaEntregadorService.listarMinhas()).rejects.toThrow('falhou');
  });

  it('devolve array vazio quando data vem null', async () => {
    const builder = criarBuilder({ data: null, error: null });
    separadorSupabase.from.mockReturnValue(builder);

    expect(await entregaEntregadorService.listarMinhas()).toEqual([]);
  });
});

describe('buscarPorId', () => {
  it('filtra por id e devolve o registro único', async () => {
    const builder = criarBuilder({ data: { id: 'e1' }, error: null });
    separadorSupabase.from.mockReturnValue(builder);

    const resultado = await entregaEntregadorService.buscarPorId('e1');

    expect(builder.eq).toHaveBeenCalledWith('id', 'e1');
    expect(builder.single).toHaveBeenCalled();
    expect(resultado).toEqual({ id: 'e1' });
  });

  it('propaga o erro quando não encontra', async () => {
    const builder = criarBuilder({ data: null, error: new Error('not found') });
    separadorSupabase.from.mockReturnValue(builder);

    await expect(entregaEntregadorService.buscarPorId('inexistente')).rejects.toThrow('not found');
  });
});

describe('RPCs de mutação', () => {
  it('assumir chama assumir_entrega com o id da solicitação', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: { ok: true }, error: null });

    await entregaEntregadorService.assumir('e1');

    expect(separadorSupabase.rpc).toHaveBeenCalledWith('assumir_entrega', { p_solicitacao_id: 'e1' });
  });

  it('iniciarRota chama iniciar_rota com o id da solicitação', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: {}, error: null });

    await entregaEntregadorService.iniciarRota('e1');

    expect(separadorSupabase.rpc).toHaveBeenCalledWith('iniciar_rota', { p_solicitacao_id: 'e1' });
  });

  it('concluir chama concluir_entrega com o id da solicitação', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: {}, error: null });

    await entregaEntregadorService.concluir('e1');

    expect(separadorSupabase.rpc).toHaveBeenCalledWith('concluir_entrega', { p_solicitacao_id: 'e1' });
  });

  it('registrarInsucesso repassa o motivo obrigatório', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: {}, error: null });

    await entregaEntregadorService.registrarInsucesso('e1', 'Cliente não atendeu');

    expect(separadorSupabase.rpc).toHaveBeenCalledWith('registrar_insucesso_entrega', {
      p_solicitacao_id: 'e1',
      p_motivo: 'Cliente não atendeu',
    });
  });

  it('propaga erro da RPC de conclusão', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: null, error: new Error('transição inválida') });

    await expect(entregaEntregadorService.concluir('e1')).rejects.toThrow('transição inválida');
  });
});

describe('abrirOcorrencia', () => {
  it('chama abrir_ocorrencia com solicitacao_entrega_id preenchido e solicitacao_separacao_id nulo', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: { id: 'o1' }, error: null });

    const resultado = await entregaEntregadorService.abrirOcorrencia({
      pedidoId: 'p1',
      tipo: 'endereco_nao_encontrado',
      descricao: 'Rua não existe no bairro informado',
      solicitacaoEntregaId: 'e1',
    });

    expect(separadorSupabase.rpc).toHaveBeenCalledWith('abrir_ocorrencia', {
      p_pedido_id: 'p1',
      p_tipo: 'endereco_nao_encontrado',
      p_descricao: 'Rua não existe no bairro informado',
      p_solicitacao_separacao_id: null,
      p_solicitacao_entrega_id: 'e1',
    });
    expect(resultado).toEqual({ id: 'o1' });
  });

  it('propaga erro da RPC', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: null, error: new Error('descrição obrigatória') });

    await expect(
      entregaEntregadorService.abrirOcorrencia({ pedidoId: 'p1', tipo: 'item_faltante', descricao: '' })
    ).rejects.toThrow('descrição obrigatória');
  });
});
