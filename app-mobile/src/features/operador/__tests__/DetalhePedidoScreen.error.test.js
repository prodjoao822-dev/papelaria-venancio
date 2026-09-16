import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import DetalhePedidoScreen from '../DetalhePedidoScreen';

const mockBuscarPorId = jest.fn();

jest.mock('../../../services/pedidosOperador.service', () => ({
  pedidosOperadorService: { buscarPorId: (...args) => mockBuscarPorId(...args) },
}));

jest.mock('../../../supabase/operadorClient', () => ({
  operadorSupabase: null,
}));

describe('DetalhePedidoScreen - estado de erro (TRB-2026-0021)', () => {
  beforeEach(() => {
    mockBuscarPorId.mockReset();
  });

  // Antes desta correção, uma falha na busca (rede instável da loja, RLS,
  // etc.) era engolida pelo try/finally e a tela caía silenciosamente em
  // "não encontrado" (return null), sem nenhum aviso nem forma de retry.
  it('mostra estado de erro com opção de tentar novamente quando a busca falha', async () => {
    mockBuscarPorId.mockRejectedValue(new Error('Falha de rede'));

    const route = { params: { pedidoId: 'p1' } };
    const { findByText, queryByText } = await render(
      <DetalhePedidoScreen route={route} navigation={{ goBack: jest.fn() }} />,
    );

    await findByText('Não foi possível carregar');
    await findByText('Tentar novamente');
    expect(queryByText(/PV-/)).toBeNull();
  });

  it('tentar novamente refaz a busca após um erro', async () => {
    mockBuscarPorId
      .mockRejectedValueOnce(new Error('Falha de rede'))
      .mockResolvedValueOnce({
        id: 'p1',
        protocolo: 'PV-0001',
        status: 'EM_SEPARACAO',
        valor_total: 10,
        clientes: { nome: 'Maria da Silva' },
        itens_pedido: [],
        pedidos_status_historico: [],
      });

    const route = { params: { pedidoId: 'p1' } };
    const { findByText } = await render(
      <DetalhePedidoScreen route={route} navigation={{ goBack: jest.fn() }} />,
    );

    const botao = await findByText('Tentar novamente');
    fireEvent.press(botao);

    await findByText(/PV-0001/);
    await waitFor(() => expect(mockBuscarPorId).toHaveBeenCalledTimes(2));
  });
});
