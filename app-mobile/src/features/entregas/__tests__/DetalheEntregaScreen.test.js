import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import DetalheEntregaScreen from '../DetalheEntregaScreen';

const mockBuscarPorId = jest.fn();

jest.mock('../../../services/entregaEntregador.service', () => ({
  entregaEntregadorService: {
    buscarPorId: (...args) => mockBuscarPorId(...args),
    assumir: jest.fn(),
    iniciarRota: jest.fn(),
    concluir: jest.fn(),
    registrarInsucesso: jest.fn(),
    abrirOcorrencia: jest.fn(),
  },
}));

jest.mock('../../../supabase/separadorClient', () => ({
  separadorSupabase: null, // sem client configurado: pula o efeito de Realtime
}));

describe('DetalheEntregaScreen', () => {
  beforeEach(() => {
    mockBuscarPorId.mockReset();
  });

  it('renderiza os dados da entrega vindos do service', async () => {
    mockBuscarPorId.mockResolvedValue({
      id: 'e1',
      status: 'pendente',
      assumida_em: null,
      pedidos: { protocolo: 'PV-0001', clientes: { nome: 'Maria da Silva' } },
    });

    const route = { params: { solicitacaoId: 'e1' } };
    const { findByText } = await render(
      <DetalheEntregaScreen route={route} navigation={{ goBack: jest.fn() }} />,
    );

    await findByText(/PV-0001/);
    expect(mockBuscarPorId).toHaveBeenCalledWith('e1');
  });

  // TRB-2026-0021: cenário citado explicitamente pelo dono é a rede
  // instável da loja — sem este fix, a tela caía em "não encontrado"
  // silenciosamente em vez de avisar o entregador em campo.
  it('mostra estado de erro com opção de tentar novamente quando a busca falha', async () => {
    mockBuscarPorId.mockRejectedValue(new Error('Falha de rede'));

    const route = { params: { solicitacaoId: 'e1' } };
    const { findByText, queryByText } = await render(
      <DetalheEntregaScreen route={route} navigation={{ goBack: jest.fn() }} />,
    );

    await findByText('Não foi possível carregar');
    await findByText('Tentar novamente');
    expect(queryByText(/PV-/)).toBeNull();
  });

  it('tentar novamente refaz a busca após um erro', async () => {
    mockBuscarPorId
      .mockRejectedValueOnce(new Error('Falha de rede'))
      .mockResolvedValueOnce({
        id: 'e1',
        status: 'pendente',
        assumida_em: null,
        pedidos: { protocolo: 'PV-0001', clientes: { nome: 'Maria da Silva' } },
      });

    const route = { params: { solicitacaoId: 'e1' } };
    const { findByText } = await render(
      <DetalheEntregaScreen route={route} navigation={{ goBack: jest.fn() }} />,
    );

    const botao = await findByText('Tentar novamente');
    fireEvent.press(botao);

    await findByText(/PV-0001/);
    await waitFor(() => expect(mockBuscarPorId).toHaveBeenCalledTimes(2));
  });
});
