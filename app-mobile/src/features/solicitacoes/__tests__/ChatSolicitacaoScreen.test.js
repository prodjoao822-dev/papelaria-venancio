import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ChatSolicitacaoScreen from '../ChatSolicitacaoScreen';

const mockBuscarPorId = jest.fn();
const mockListarMensagens = jest.fn();

jest.mock('../../../services/separacaoSeparador.service', () => ({
  separacaoSeparadorService: {
    buscarPorId: (...args) => mockBuscarPorId(...args),
    listarMensagens: (...args) => mockListarMensagens(...args),
    enviarMensagem: jest.fn(),
  },
}));

jest.mock('../../../supabase/separadorClient', () => ({
  separadorSupabase: null, // sem client configurado: pula o efeito de Realtime
}));

describe('ChatSolicitacaoScreen', () => {
  beforeEach(() => {
    mockBuscarPorId.mockReset();
    mockListarMensagens.mockReset();
  });

  it('renderiza a conversa vinda do service', async () => {
    mockBuscarPorId.mockResolvedValue({
      id: 's1',
      operador_delegante: { nome: 'Ana Operadora' },
      pedidos: { protocolo: 'PV-0001', clientes: { nome: 'Maria da Silva' } },
    });
    mockListarMensagens.mockResolvedValue([
      { id: 'm1', texto: 'Oi', autor_tipo: 'operador', criado_em: '2026-09-01T10:00:00Z' },
    ]);

    const route = { params: { solicitacaoId: 's1' } };
    const { findByText } = await render(
      <ChatSolicitacaoScreen route={route} navigation={{ goBack: jest.fn() }} />,
    );

    await findByText(/PV-0001/);
    await findByText('Oi');
  });

  // TRB-2026-0021: aqui o carregamento depende de duas chamadas em paralelo
  // (Promise.all) — se qualquer uma falhar (rede instável da loja), a tela
  // antes caía silenciosamente em "não encontrado" em vez de avisar.
  it('mostra estado de erro com opção de tentar novamente quando a busca falha', async () => {
    mockBuscarPorId.mockResolvedValue({ id: 's1', pedidos: {} });
    mockListarMensagens.mockRejectedValue(new Error('Falha de rede'));

    const route = { params: { solicitacaoId: 's1' } };
    const { findByText, queryByText } = await render(
      <ChatSolicitacaoScreen route={route} navigation={{ goBack: jest.fn() }} />,
    );

    await findByText('Não foi possível carregar');
    await findByText('Tentar novamente');
    expect(queryByText(/PV-/)).toBeNull();
  });

  it('tentar novamente refaz a busca após um erro', async () => {
    mockBuscarPorId
      .mockResolvedValueOnce({ id: 's1', pedidos: {} })
      .mockResolvedValueOnce({
        id: 's1',
        operador_delegante: { nome: 'Ana Operadora' },
        pedidos: { protocolo: 'PV-0001', clientes: { nome: 'Maria da Silva' } },
      });
    mockListarMensagens
      .mockRejectedValueOnce(new Error('Falha de rede'))
      .mockResolvedValueOnce([]);

    const route = { params: { solicitacaoId: 's1' } };
    const { findByText } = await render(
      <ChatSolicitacaoScreen route={route} navigation={{ goBack: jest.fn() }} />,
    );

    const botao = await findByText('Tentar novamente');
    fireEvent.press(botao);

    await findByText(/PV-0001/);
    await waitFor(() => expect(mockListarMensagens).toHaveBeenCalledTimes(2));
  });
});
