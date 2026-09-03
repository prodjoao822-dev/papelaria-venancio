import React from 'react';
import { render } from '@testing-library/react-native';
import PainelPedidosScreen from '../PainelPedidosScreen';

const mockListar = jest.fn();

jest.mock('../../../services/pedidosOperador.service', () => ({
  pedidosOperadorService: { listar: (...args) => mockListar(...args) },
}));

jest.mock('../../../supabase/operadorClient', () => ({
  operadorSupabase: null, // sem client configurado: pula o efeito de Realtime, cobre só a lista
}));

describe('PainelPedidosScreen', () => {
  beforeEach(() => {
    mockListar.mockReset();
  });

  it('renderiza a lista de pedidos vinda do service', async () => {
    mockListar.mockResolvedValue([
      {
        id: 'p1',
        protocolo: 'PV-0001',
        valor_total: 150.5,
        status: 'NOVO_PEDIDO',
        clientes: { nome: 'Maria da Silva' },
      },
      {
        id: 'p2',
        protocolo: 'PV-0002',
        valor_total: 42,
        status: 'FINALIZADO',
        clientes: { nome: 'João Souza' },
      },
    ]);

    const { findByText } = await render(<PainelPedidosScreen navigation={{ navigate: jest.fn() }} />);

    await findByText(/PV-0001/);
    await findByText(/PV-0002/);
    await findByText(/Maria da Silva/);
    expect(mockListar).toHaveBeenCalledTimes(1);
  });

  it('mostra estado vazio quando não há pedidos', async () => {
    mockListar.mockResolvedValue([]);

    const { findByText } = await render(<PainelPedidosScreen navigation={{ navigate: jest.fn() }} />);

    await findByText('Nenhum pedido encontrado');
  });
});
