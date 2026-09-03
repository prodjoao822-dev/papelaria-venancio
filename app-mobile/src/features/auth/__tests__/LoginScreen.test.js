// Cobre a decisão do dono documentada no cabeçalho de LoginScreen.js: um
// único formulário código+PIN tenta primeiro como funcionário (Separador/
// Entregador) e só depois como operador, sem tela de escolha — e nunca
// expõe qual dos dois fluxos "quase" funcionou (mensagem final sempre
// genérica quando os dois falham).
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from '../LoginScreen';

// O primeiro `render()` do arquivo paga o custo de inicializar os módulos
// nativos mockados pelo jest-expo — no CI/execução da suíte completa isso já
// foi visto passar de 5s (default do Jest), mesmo a asserção em si sendo
// rápida (ver tempos individuais bem menores nas chamadas seguintes).
jest.setTimeout(15000);

const mockLoginFuncionario = jest.fn();
const mockLoginOperador = jest.fn();

jest.mock('../../../contexts/SeparadorAuthContext', () => ({
  useSeparadorAuth: () => ({ login: mockLoginFuncionario }),
}));
jest.mock('../../../contexts/OperadorAuthContext', () => ({
  useOperadorAuth: () => ({ login: mockLoginOperador }),
}));

async function preencherEEnviar(getByTestId, { codigo = '1234', pin = '123456' } = {}) {
  await fireEvent.changeText(getByTestId('login-input-codigo'), codigo);
  await fireEvent.changeText(getByTestId('login-input-pin'), pin);
  await fireEvent.press(getByTestId('login-botao-entrar'));
}

describe('LoginScreen — login unificado (funcionário depois operador)', () => {
  beforeEach(() => {
    mockLoginFuncionario.mockReset();
    mockLoginOperador.mockReset();
  });

  it('login de funcionário bem-sucedido: nunca tenta operador', async () => {
    mockLoginFuncionario.mockResolvedValue(undefined);

    const { getByTestId, queryByText } = await render(<LoginScreen />);
    await preencherEEnviar(getByTestId);

    await waitFor(() => expect(mockLoginFuncionario).toHaveBeenCalledWith('1234', '123456'));
    expect(mockLoginOperador).not.toHaveBeenCalled();
    expect(queryByText(/inválido/i)).toBeNull();
  });

  it('funcionário falha, operador bem-sucedido: tenta os dois, na ordem certa, sem mostrar erro', async () => {
    mockLoginFuncionario.mockRejectedValue(new Error('Código ou PIN inválido.'));
    mockLoginOperador.mockResolvedValue(undefined);

    const { getByTestId, queryByText } = await render(<LoginScreen />);
    await preencherEEnviar(getByTestId, { codigo: '5678', pin: '654321' });

    await waitFor(() => expect(mockLoginOperador).toHaveBeenCalledWith('5678', '654321'));
    expect(mockLoginFuncionario).toHaveBeenCalledWith('5678', '654321');
    expect(queryByText(/inválido/i)).toBeNull();
  });

  it('os dois falham: mostra mensagem genérica única, sem repetir o erro específico de nenhum dos dois backends', async () => {
    mockLoginFuncionario.mockRejectedValue(new Error('codigo deve ter exatamente 4 dígitos.'));
    mockLoginOperador.mockRejectedValue(new Error('Código ou PIN inválido.'));

    const { getByTestId, findByText, queryByText } = await render(<LoginScreen />);
    await preencherEEnviar(getByTestId);

    await findByText('Código ou PIN inválido. Verifique e tente novamente.');
    // Nem a mensagem crua do funcionário nem uma mensagem diferente da do
    // operador aparecem — só a genérica, uma vez.
    expect(queryByText(/exatamente 4 dígitos/i)).toBeNull();
  });
});
