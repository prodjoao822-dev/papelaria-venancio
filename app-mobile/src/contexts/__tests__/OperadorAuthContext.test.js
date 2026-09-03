// Cobre a diferença estrutural documentada no cabeçalho de
// OperadorAuthContext.js: a identidade do Operador é resolvida por
// `operadores.id = auth.uid()` (`.eq('id', authUserId)`), nunca por
// `auth_user_id` (que é exclusivo de `funcionarios`/SeparadorAuthContext).
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { OperadorAuthProvider, useOperadorAuth } from '../OperadorAuthContext';
import { operadorSupabase } from '../../supabase/operadorClient';

jest.mock('../../supabase/operadorClient', () => {
  const eqMock = jest.fn();
  const maybeSingleMock = jest.fn();
  const selectMock = jest.fn(() => ({ eq: eqMock }));
  eqMock.mockReturnValue({ maybeSingle: maybeSingleMock });

  return {
    operadorSupabase: {
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      },
      from: jest.fn(() => ({ select: selectMock })),
      __eqMock: eqMock,
      __maybeSingleMock: maybeSingleMock,
    },
  };
});

jest.mock('../../services/operadorAuth.service', () => ({
  operadorAuthService: { login: jest.fn(), logout: jest.fn() },
}));

function ConsumidorTeste() {
  const { carregando, operador, session } = useOperadorAuth();
  if (carregando) return <Text>carregando</Text>;
  return (
    <Text>
      {operador ? `operador:${operador.nome}` : 'sem-operador'}
      {session ? ':com-sessao' : ':sem-sessao'}
    </Text>
  );
}

describe('OperadorAuthContext', () => {
  beforeEach(() => {
    operadorSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    operadorSupabase.from.mockClear();
    operadorSupabase.__eqMock.mockClear();
    operadorSupabase.__maybeSingleMock.mockReset();
  });

  it('sem sessão restaurada: não busca operador nenhum e termina carregando=false', async () => {
    const { findByText } = await render(
      <OperadorAuthProvider>
        <ConsumidorTeste />
      </OperadorAuthProvider>
    );

    await findByText('sem-operador:sem-sessao');
    expect(operadorSupabase.from).not.toHaveBeenCalled();
  });

  it('com sessão restaurada: busca a identidade em `operadores` filtrando por id = auth.uid() (não auth_user_id)', async () => {
    const sessaoFake = { user: { id: 'uuid-do-operador' } };
    operadorSupabase.auth.getSession.mockResolvedValue({ data: { session: sessaoFake } });
    operadorSupabase.__maybeSingleMock.mockResolvedValue({
      data: { id: 'uuid-do-operador', nome: 'Ana Operadora', codigo: '1234', papel: 'operador', ativo: true },
    });

    const { findByText } = await render(
      <OperadorAuthProvider>
        <ConsumidorTeste />
      </OperadorAuthProvider>
    );

    await findByText('operador:Ana Operadora:com-sessao');

    expect(operadorSupabase.from).toHaveBeenCalledWith('operadores');
    expect(operadorSupabase.__eqMock).toHaveBeenCalledWith('id', 'uuid-do-operador');
    expect(operadorSupabase.__eqMock).not.toHaveBeenCalledWith('auth_user_id', expect.anything());
  });
});
