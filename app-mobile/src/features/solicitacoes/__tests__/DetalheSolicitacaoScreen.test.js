import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import DetalheSolicitacaoScreen from '../DetalheSolicitacaoScreen';

const mockBuscarPorId = jest.fn();

jest.mock('../../../services/separacaoSeparador.service', () => ({
  separacaoSeparadorService: {
    buscarPorId: (...args) => mockBuscarPorId(...args),
    assumir: jest.fn(),
    marcarItem: jest.fn(),
    concluir: jest.fn(),
  },
}));

jest.mock('../../../supabase/separadorClient', () => ({
  separadorSupabase: null, // sem client configurado: pula o efeito de Realtime
}));

describe('DetalheSolicitacaoScreen', () => {
  beforeEach(() => {
    mockBuscarPorId.mockReset();
  });

  it('renderiza os dados da solicitação vindos do service', async () => {
    mockBuscarPorId.mockResolvedValue({
      id: 's1',
      status: 'pendente',
      prioridade: 'imediata',
      pedidos: { protocolo: 'PV-0001', clientes: { nome: 'Maria da Silva' } },
      itens: [{ id: 'i1', separado: false, itens_pedido: { nome_item: 'Caderno', quantidade: 2 } }],
    });

    const route = { params: { solicitacaoId: 's1' } };
    const { findByText } = await render(
      <DetalheSolicitacaoScreen route={route} navigation={{ goBack: jest.fn(), navigate: jest.fn() }} />,
    );

    await findByText(/PV-0001/);
    expect(mockBuscarPorId).toHaveBeenCalledWith('s1');
  });

  // TRB-2026-0021: antes, uma falha aqui (rede instável da loja, RLS, etc.)
  // era engolida pelo try/finally e a tela caía silenciosamente em "não
  // encontrado" (return null), sem nenhum aviso nem forma de tentar de novo.
  it('mostra estado de erro com opção de tentar novamente quando a busca falha', async () => {
    mockBuscarPorId.mockRejectedValue(new Error('Falha de rede'));

    const route = { params: { solicitacaoId: 's1' } };
    const { findByText, queryByText } = await render(
      <DetalheSolicitacaoScreen route={route} navigation={{ goBack: jest.fn(), navigate: jest.fn() }} />,
    );

    await findByText('Não foi possível carregar');
    await findByText('Tentar novamente');
    // Não cai no estado silencioso de "não encontrado".
    expect(queryByText(/PV-0001/)).toBeNull();
  });

  it('tentar novamente refaz a busca após um erro', async () => {
    mockBuscarPorId
      .mockRejectedValueOnce(new Error('Falha de rede'))
      .mockResolvedValueOnce({
        id: 's1',
        status: 'pendente',
        prioridade: 'imediata',
        pedidos: { protocolo: 'PV-0001', clientes: { nome: 'Maria da Silva' } },
        itens: [],
      });

    const route = { params: { solicitacaoId: 's1' } };
    const { findByText } = await render(
      <DetalheSolicitacaoScreen route={route} navigation={{ goBack: jest.fn(), navigate: jest.fn() }} />,
    );

    const botao = await findByText('Tentar novamente');
    fireEvent.press(botao);

    await findByText(/PV-0001/);
    await waitFor(() => expect(mockBuscarPorId).toHaveBeenCalledTimes(2));
  });
});
