import React from 'react';
import { render } from '@testing-library/react-native';
import ListaEsperaScreen from '../ListaEsperaScreen';

const mockListarProdutosComEspera = jest.fn();

jest.mock('../../../services/listaEsperaOperador.service', () => ({
  listaEsperaOperadorService: { listarProdutosComEspera: (...args) => mockListarProdutosComEspera(...args) },
}));

jest.mock('../../../supabase/operadorClient', () => ({
  operadorSupabase: null,
}));

describe('ListaEsperaScreen', () => {
  beforeEach(() => {
    mockListarProdutosComEspera.mockReset();
  });

  it('renderiza a lista de produtos com espera vinda do service', async () => {
    mockListarProdutosComEspera.mockResolvedValue([
      { id: 'prod1', nome: 'Caderno Universitário 200fls', sku: 'CAD-200', estoque: 0, qtd_interessados: 3 },
    ]);

    const { findByText } = await render(<ListaEsperaScreen />);

    await findByText('Caderno Universitário 200fls');
    await findByText(/CAD-200/);
    await findByText(/3 esperas/);
    expect(mockListarProdutosComEspera).toHaveBeenCalledTimes(1);
  });

  it('mostra estado vazio quando não há produtos em espera', async () => {
    mockListarProdutosComEspera.mockResolvedValue([]);

    const { findByText } = await render(<ListaEsperaScreen />);

    await findByText('Nenhum produto em espera');
  });
});
