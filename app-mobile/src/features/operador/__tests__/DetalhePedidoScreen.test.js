import React from 'react';
import { render } from '@testing-library/react-native';
import DetalhePedidoScreen from '../DetalhePedidoScreen';

const mockBuscarPorId = jest.fn();

jest.mock('../../../services/pedidosOperador.service', () => ({
  pedidosOperadorService: { buscarPorId: (...args) => mockBuscarPorId(...args) },
}));

jest.mock('../../../supabase/operadorClient', () => ({
  operadorSupabase: null,
}));

describe('DetalhePedidoScreen', () => {
  beforeEach(() => {
    mockBuscarPorId.mockReset();
  });

  it('renderiza cliente, itens e histórico de status vindos do service, sem nenhuma ação de escrita', async () => {
    mockBuscarPorId.mockResolvedValue({
      id: 'p1',
      protocolo: 'PV-0001',
      status: 'EM_SEPARACAO',
      valor_total: 99.9,
      clientes: { nome: 'Maria da Silva', telefone: '11999990000' },
      itens_pedido: [
        { id: 'i1', nome_item: 'Caderno 10 matérias', quantidade: 2, observacao: null },
      ],
      pedidos_status_historico: [
        { id: 'h1', status_anterior: 'confirmado', status_novo: 'em_separacao', criado_em: '2026-09-01T10:00:00Z', operadores: { nome: 'Ana' } },
      ],
    });

    const route = { params: { pedidoId: 'p1' } };
    const { findByText, queryByText } = await render(<DetalhePedidoScreen route={route} navigation={{ goBack: jest.fn() }} />);

    await findByText(/PV-0001/);
    await findByText('Maria da Silva');
    await findByText('Caderno 10 matérias');
    await findByText(/confirmado.*em_separacao/);

    expect(mockBuscarPorId).toHaveBeenCalledWith('p1');
    // Não há nenhum botão de ação de escrita nesta tela (só leitura, v1).
    expect(queryByText(/concluir/i)).toBeNull();
    expect(queryByText(/atribuir/i)).toBeNull();
  });
});
