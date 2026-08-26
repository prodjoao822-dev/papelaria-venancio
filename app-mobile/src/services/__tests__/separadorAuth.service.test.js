// `BOT_API_URL` é lido de `process.env.EXPO_PUBLIC_BOT_API_URL` no
// carregamento do módulo (mesmo padrão do venancio-ai-ops, que lê
// `import.meta.env.VITE_BOT_API_URL`) — por isso este arquivo usa
// require() dentro de cada teste (em vez de `import` no topo) com
// `jest.resetModules()`: `import` seria hoisted pelo Babel para antes de
// qualquer `process.env.X = ...`, e o módulo capturaria a env var errada.
describe('separadorAuth.service', () => {
  let separadorAuthService;
  let separadorSupabaseMock;

  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_BOT_API_URL = 'https://bot.test';

    jest.doMock('../../supabase/separadorClient', () => ({
      separadorSupabase: {
        auth: {
          setSession: jest.fn().mockResolvedValue({ error: null }),
          signOut: jest.fn().mockResolvedValue({}),
        },
      },
    }));

    global.fetch = jest.fn();

    separadorAuthService = require('../separadorAuth.service').separadorAuthService;
    separadorSupabaseMock = require('../../supabase/separadorClient').separadorSupabase;
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_BOT_API_URL;
    jest.dontMock('../../supabase/separadorClient');
  });

  it('faz POST em /operador/separador/login e aplica a sessão devolvida via setSession', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        sessao: { access_token: 'token-acesso', refresh_token: 'token-refresh' },
        funcionario: { id: 'f1', nome: 'Diego Separador' },
      }),
    });

    const funcionario = await separadorAuthService.login('0231', '123456');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://bot.test/operador/separador/login',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo_funcionario: '0231', pin: '123456' }),
      })
    );
    expect(separadorSupabaseMock.auth.setSession).toHaveBeenCalledWith({
      access_token: 'token-acesso',
      refresh_token: 'token-refresh',
    });
    expect(funcionario).toEqual({ id: 'f1', nome: 'Diego Separador' });
  });

  it('lança o erro devolvido pelo bot quando o login falha (nunca chama setSession)', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, erro: 'Código ou PIN inválido.' }),
    });

    await expect(separadorAuthService.login('0231', '000000')).rejects.toThrow('Código ou PIN inválido.');
    expect(separadorSupabaseMock.auth.setSession).not.toHaveBeenCalled();
  });

  it('lança erro claro quando EXPO_PUBLIC_BOT_API_URL não está configurado (nunca chama fetch)', async () => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_BOT_API_URL;
    jest.doMock('../../supabase/separadorClient', () => ({
      separadorSupabase: { auth: { setSession: jest.fn(), signOut: jest.fn() } },
    }));

    const { separadorAuthService: servicoSemUrl } = require('../separadorAuth.service');

    await expect(servicoSemUrl.login('0231', '123456')).rejects.toThrow(
      'EXPO_PUBLIC_BOT_API_URL não configurado'
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('logout chama signOut no client isolado do Separador', async () => {
    await separadorAuthService.logout();

    expect(separadorSupabaseMock.auth.signOut).toHaveBeenCalled();
  });
});
