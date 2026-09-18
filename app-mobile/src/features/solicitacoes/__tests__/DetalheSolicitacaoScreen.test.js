import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import DetalheSolicitacaoScreen from '../DetalheSolicitacaoScreen';
import { separacaoSeparadorService } from '../../../services/separacaoSeparador.service';

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

const navigation = { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() };

describe('DetalheSolicitacaoScreen', () => {
  beforeEach(() => {
    mockBuscarPorId.mockReset();
    separacaoSeparadorService.marcarItem.mockReset();
    separacaoSeparadorService.concluir.mockReset();
    navigation.replace.mockReset();
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
      <DetalheSolicitacaoScreen route={route} navigation={navigation} />,
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
      <DetalheSolicitacaoScreen route={route} navigation={navigation} />,
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
      <DetalheSolicitacaoScreen route={route} navigation={navigation} />,
    );

    const botao = await findByText('Tentar novamente');
    fireEvent.press(botao);

    await findByText(/PV-0001/);
    await waitFor(() => expect(mockBuscarPorId).toHaveBeenCalledTimes(2));
  });

  describe('painel somente-leitura do pedido', () => {
    it('mostra pago/entrega/horário/separador e some com a linha de observações quando vazia', async () => {
      mockBuscarPorId.mockResolvedValue({
        id: 's1',
        status: 'em_andamento',
        prioridade: 'normal',
        pedidos: {
          protocolo: 'PV-0002',
          clientes: { nome: 'João' },
          status_pagamento: 'pago',
          forma_entrega: 'retirada',
          horario_retirada_desejado: '15:30',
          observacoes: '',
        },
        separador: { nome: 'Carlos' },
        itens: [],
      });

      const route = { params: { solicitacaoId: 's1' } };
      const { findByText, queryByText } = await render(
        <DetalheSolicitacaoScreen route={route} navigation={navigation} />,
      );

      await findByText(/PV-0002/);
      await findByText(/Pago/);
      await findByText(/Retirada/);
      await findByText(/15:30/);
      await findByText(/Carlos/);
      expect(queryByText(/Observações do cliente/)).toBeNull();
    });

    it('mostra "Aguardando pagamento", "Entrega", horário e observações quando presentes', async () => {
      mockBuscarPorId.mockResolvedValue({
        id: 's1',
        status: 'em_andamento',
        prioridade: 'normal',
        pedidos: {
          protocolo: 'PV-0003',
          clientes: { nome: 'João' },
          status_pagamento: 'pendente',
          forma_entrega: 'uber_flash',
          horario_retirada_desejado: null,
          observacoes: 'Entregar no portão dos fundos',
        },
        separador: null,
        itens: [],
      });

      const route = { params: { solicitacaoId: 's1' } };
      const { findByText, findAllByText } = await render(
        <DetalheSolicitacaoScreen route={route} navigation={navigation} />,
      );

      await findByText(/Aguardando pagamento/);
      await findByText(/🚚 Entrega/);
      // "não informado" aparece duas vezes aqui de propósito (horário
      // ausente E separador ausente, `separador: null` acima) — cobre os
      // dois fallbacks graciosos na mesma renderização.
      const naoInformados = await findAllByText(/não informado/);
      expect(naoInformados).toHaveLength(2);
      await findByText(/Entregar no portão dos fundos/);
    });
  });

  describe('checklist de 3 estados', () => {
    function solicitacaoComItem(statusItem, extras = {}) {
      return {
        id: 's1',
        status: 'em_andamento',
        prioridade: 'normal',
        pedidos: { protocolo: 'PV-0004', clientes: { nome: 'Ana' } },
        itens: [{
          id: 'i1',
          status_item: statusItem,
          separado: statusItem === 'separado',
          itens_pedido: { id: 'ip1', nome_item: 'Caderno', quantidade: 3, ...extras },
        }],
      };
    }

    it('tocar num item pendente marca "separado" direto', async () => {
      mockBuscarPorId.mockResolvedValue(solicitacaoComItem('pendente'));
      separacaoSeparadorService.marcarItem.mockResolvedValue({});

      const route = { params: { solicitacaoId: 's1' } };
      const { findByTestId } = await render(
        <DetalheSolicitacaoScreen route={route} navigation={navigation} />,
      );

      const linha = await findByTestId('item-linha-i1');
      fireEvent.press(linha);

      await waitFor(() => {
        expect(separacaoSeparadorService.marcarItem).toHaveBeenCalledWith('i1', 'separado');
      });
    });

    it('tocar num item já separado desfaz para "pendente"', async () => {
      mockBuscarPorId.mockResolvedValue(solicitacaoComItem('separado'));
      separacaoSeparadorService.marcarItem.mockResolvedValue({});

      const route = { params: { solicitacaoId: 's1' } };
      const { findByTestId } = await render(
        <DetalheSolicitacaoScreen route={route} navigation={navigation} />,
      );

      const linha = await findByTestId('item-linha-i1');
      fireEvent.press(linha);

      await waitFor(() => {
        expect(separacaoSeparadorService.marcarItem).toHaveBeenCalledWith('i1', 'pendente');
      });
    });

    it('botão secundário abre modal e confirmar chama marcarItem com "faltou_substituido" e a observação digitada', async () => {
      mockBuscarPorId.mockResolvedValue(solicitacaoComItem('pendente'));
      separacaoSeparadorService.marcarItem.mockResolvedValue({});

      const route = { params: { solicitacaoId: 's1' } };
      const { findByTestId } = await render(
        <DetalheSolicitacaoScreen route={route} navigation={navigation} />,
      );

      const botaoFaltou = await findByTestId('item-acao-faltou-i1');
      fireEvent.press(botaoFaltou);

      const input = await findByTestId('modal-faltou-input');
      fireEvent.changeText(input, 'sem estoque, veio substituído por outra marca');

      const confirmar = await findByTestId('modal-faltou-confirmar');
      fireEvent.press(confirmar);

      await waitFor(() => {
        expect(separacaoSeparadorService.marcarItem).toHaveBeenCalledWith(
          'i1', 'faltou_substituido', 'sem estoque, veio substituído por outra marca',
        );
      });
    });

    it('botão secundário num item já "faltou_substituido" limpa direto para "pendente" (sem reabrir a modal)', async () => {
      mockBuscarPorId.mockResolvedValue(solicitacaoComItem('faltou_substituido', { observacao: 'sem estoque' }));
      separacaoSeparadorService.marcarItem.mockResolvedValue({});

      const route = { params: { solicitacaoId: 's1' } };
      const { findByTestId, findByText, queryByTestId } = await render(
        <DetalheSolicitacaoScreen route={route} navigation={navigation} />,
      );

      await findByText('sem estoque');
      const botaoFaltou = await findByTestId('item-acao-faltou-i1');
      fireEvent.press(botaoFaltou);

      await waitFor(() => {
        expect(separacaoSeparadorService.marcarItem).toHaveBeenCalledWith('i1', 'pendente');
      });
      expect(queryByTestId('modal-faltou-input')).toBeNull();
    });
  });

  describe('gate de conclusão', () => {
    it('mantém o botão de concluir desabilitado enquanto houver item pendente', async () => {
      mockBuscarPorId.mockResolvedValue({
        id: 's1',
        status: 'em_andamento',
        prioridade: 'normal',
        pedidos: { protocolo: 'PV-0005', clientes: { nome: 'Ana' } },
        itens: [
          { id: 'i1', status_item: 'separado', itens_pedido: { nome_item: 'A', quantidade: 1 } },
          { id: 'i2', status_item: 'pendente', itens_pedido: { nome_item: 'B', quantidade: 1 } },
        ],
      });

      const route = { params: { solicitacaoId: 's1' } };
      const { findByText } = await render(
        <DetalheSolicitacaoScreen route={route} navigation={navigation} />,
      );

      const botao = await findByText('Separação Pronta');
      fireEvent.press(botao);

      expect(separacaoSeparadorService.concluir).not.toHaveBeenCalled();
    });

    it('habilita a conclusão quando todo item está separado ou faltou_substituido', async () => {
      mockBuscarPorId.mockResolvedValue({
        id: 's1',
        status: 'em_andamento',
        prioridade: 'normal',
        pedidos: { protocolo: 'PV-0006', clientes: { nome: 'Ana' } },
        itens: [
          { id: 'i1', status_item: 'separado', itens_pedido: { nome_item: 'A', quantidade: 1 } },
          { id: 'i2', status_item: 'faltou_substituido', itens_pedido: { nome_item: 'B', quantidade: 1 } },
        ],
      });
      separacaoSeparadorService.concluir.mockResolvedValue({});

      const route = { params: { solicitacaoId: 's1' } };
      const { findByText } = await render(
        <DetalheSolicitacaoScreen route={route} navigation={navigation} />,
      );

      const botao = await findByText('Finalizar com pendências');
      fireEvent.press(botao);

      await waitFor(() => {
        expect(separacaoSeparadorService.concluir).toHaveBeenCalledWith('s1');
      });
    });
  });
});
