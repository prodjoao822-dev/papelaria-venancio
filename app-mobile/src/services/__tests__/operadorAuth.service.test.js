// Mesmo padrão de separadorAuth.service.test.js — `BOT_API_URL` é lido de
// `process.env.EXPO_PUBLIC_BOT_API_URL` no carregamento do módulo, por isso
// usamos require() dentro de cada teste (em vez de `import` no topo) com
// `jest.resetModules()`.
describe('operadorAuth.service', () => {
  let operadorAuthService;
  let operadorSupabaseMock;

  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_BOT_API_URL = 'https://bot.test';

    jest.doMock('../../supabase/operadorClient', () => ({
      operadorSupabase: {
        auth: {
          setSession: jest.fn().mockResolvedValue({ error: null }),
          signOut: jest.fn().mockResolvedValue({}),
        },
      },
    }));

    global.fetch = jest.fn();

    operadorAuthService = require('../operadorAuth.service').operadorAuthService;
    operadorSupabaseMock = require('../../supabase/operadorClient').operadorSupabase;
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_BOT_API_URL;
    jest.dontMock('../../supabase/operadorClient');
  });

  it('faz POST em /operador/login-codigo com { codigo, pin } e aplica a sessão devolvida via setSession', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        sessao: { access_token: 'token-acesso', refresh_token: 'token-refresh' },
        operador: { id: 'op1', nome: 'Ana Operadora', papel: 'operador' },
      }),
    });

    const operador = await operadorAuthService.login('1234', '123456');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://bot.test/operador/login-codigo',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: '1234', pin: '123456' }),
      })
    );
    expect(operadorSupabaseMock.auth.setSession).toHaveBeenCalledWith({
      access_token: 'token-acesso',
      refresh_token: 'token-refresh',
    });
    expect(operador).toEqual({ id: 'op1', nome: 'Ana Operadora', papel: 'operador' });
  });

  it('lança o erro devolvido pelo bot quando o login falha (nunca chama setSession)', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, erro: 'Código ou PIN inválido.' }),
    });

    await expect(operadorAuthService.login('1234', '000000')).rejects.toThrow('Código ou PIN inválido.');
    expect(operadorSupabaseMock.auth.setSession).not.toHaveBeenCalled();
  });

  it('lança erro claro quando EXPO_PUBLIC_BOT_API_URL não está configurado (nunca chama fetch)', async () => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_BOT_API_URL;
    jest.doMock('../../supabase/operadorClient', () => ({
      operadorSupabase: { auth: { setSession: jest.fn(), signOut: jest.fn() } },
    }));

    const { operadorAuthService: servicoSemUrl } = require('../operadorAuth.service');

    await expect(servicoSemUrl.login('1234', '123456')).rejects.toThrow(
      'EXPO_PUBLIC_BOT_API_URL não configurado'
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('logout chama signOut no client isolado do Operador', async () => {
    await operadorAuthService.logout();

    expect(operadorSupabaseMock.auth.signOut).toHaveBeenCalled();
  });
});
