import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import TarefasScreen from '../TarefasScreen';

const mockListarPendentes = jest.fn();
const mockConcluir = jest.fn();

jest.mock('../../../services/tarefasOperador.service', () => ({
  tarefasOperadorService: {
    listarPendentes: (...args) => mockListarPendentes(...args),
    concluir: (...args) => mockConcluir(...args),
  },
}));

jest.mock('../../../supabase/operadorClient', () => ({
  operadorSupabase: null,
}));

describe('TarefasScreen', () => {
  beforeEach(() => {
    mockListarPendentes.mockReset();
    mockConcluir.mockReset();
  });

  it('renderiza a lista de tarefas pendentes vinda do service', async () => {
    mockListarPendentes.mockResolvedValue([
      {
        id: 't1',
        descricao: 'Separar pedido PV-0001',
        data_execucao: '2026-09-03T14:00:00Z',
        responsavel: { nome: 'Carlos Separador' },
        pedidos: { protocolo: 'PV-0001' },
      },
    ]);

    const { findByText } = await render(<TarefasScreen />);

    await findByText('Separar pedido PV-0001');
    await findByText(/Carlos Separador/);
    expect(mockListarPendentes).toHaveBeenCalledTimes(1);
  });

  it('concluir chama a RPC concluir_tarefa via service com o id certo', async () => {
    mockListarPendentes.mockResolvedValue([
      { id: 't1', descricao: 'Organizar prateleira', data_execucao: '2026-09-03T14:00:00Z', responsavel: null, pedidos: null },
    ]);
    mockConcluir.mockResolvedValue({ id: 't1', status: 'concluida' });

    const { findByText, getByTestId } = await render(<TarefasScreen />);
    await findByText('Organizar prateleira');

    await fireEvent.press(getByTestId('tarefa-botao-concluir-t1'));

    await waitFor(() => expect(mockConcluir).toHaveBeenCalledWith('t1'));
  });

  it('mostra estado vazio quando não há tarefas pendentes', async () => {
    mockListarPendentes.mockResolvedValue([]);

    const { findByText } = await render(<TarefasScreen />);

    await findByText('Nenhuma tarefa pendente');
  });
});
