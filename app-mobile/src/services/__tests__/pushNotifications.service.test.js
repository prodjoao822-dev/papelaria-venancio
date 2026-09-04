// Cobre o service que registra o Expo Push Token (RF-08/P20) — nunca a
// permissão nativa em si (isso só dá pra validar num aparelho real). O que
// importa aqui é: (1) nunca lançar erro pro chamador (best-effort), (2) só
// chamar a RPC quando permissão + dispositivo físico + projectId realmente
// permitirem, e (3) o payload exato mandado pra `registrar_push_token`.
import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { pushNotificationsService } from '../pushNotifications.service';
import { separadorSupabase } from '../../supabase/separadorClient';

jest.mock('../../supabase/separadorClient', () => ({
  separadorSupabase: { rpc: jest.fn() },
}));

// `isRunningInExpoGo` controla o `require('expo-notifications')` tardio
// dentro do service (ver comentário no topo de pushNotifications.service.js
// sobre o bug real do SDK 53 removendo push do Expo Go). Por padrão os
// testes simulam uma build própria (fora do Expo Go); o describe dedicado
// abaixo simula o Expo Go de verdade.
jest.mock('expo', () => ({ isRunningInExpoGo: jest.fn(() => false) }));

jest.mock('expo-notifications', () => ({
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  AndroidImportance: { MAX: 5 },
}));

jest.mock('expo-device', () => ({ isDevice: true }));

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { eas: { projectId: 'projeto-real-123' } } },
}));

function setPlataforma(os) {
  Platform.OS = os;
}

beforeEach(() => {
  jest.clearAllMocks();
  isRunningInExpoGo.mockReturnValue(false);
  Device.isDevice = true;
  Constants.expoConfig = { extra: { eas: { projectId: 'projeto-real-123' } } };
  setPlataforma('ios');
  Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc123]' });
  separadorSupabase.rpc.mockResolvedValue({ data: { ok: true }, error: null });
});

describe('pushNotificationsService.registrarToken', () => {
  it('chama registrar_push_token com o token e a plataforma (Platform.OS)', async () => {
    setPlataforma('android');

    const resultado = await pushNotificationsService.registrarToken('ExponentPushToken[abc123]');

    expect(separadorSupabase.rpc).toHaveBeenCalledWith('registrar_push_token', {
      p_expo_push_token: 'ExponentPushToken[abc123]',
      p_plataforma: 'android',
    });
    expect(resultado).toEqual({ ok: true });
  });

  it('propaga o erro da RPC pro chamador', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: null, error: new Error('RPC indisponível') });

    await expect(pushNotificationsService.registrarToken('token-x')).rejects.toThrow(
      'RPC indisponível'
    );
  });
});

describe('pushNotificationsService.registrarAposLogin', () => {
  it('fluxo feliz: permissão já concedida, obtém token e registra via RPC', async () => {
    const token = await pushNotificationsService.registrarAposLogin();

    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: 'projeto-real-123',
    });
    expect(separadorSupabase.rpc).toHaveBeenCalledWith('registrar_push_token', {
      p_expo_push_token: 'ExponentPushToken[abc123]',
      p_plataforma: 'ios',
    });
    expect(token).toBe('ExponentPushToken[abc123]');
  });

  it('pede permissão quando ainda não concedida', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });

    await pushNotificationsService.registrarAposLogin();

    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    expect(separadorSupabase.rpc).toHaveBeenCalled();
  });

  it('cria canal Android antes de checar permissão quando Platform.OS é android', async () => {
    setPlataforma('android');

    await pushNotificationsService.registrarAposLogin();

    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ importance: Notifications.AndroidImportance.MAX })
    );
  });

  it('não cria canal Android em iOS', async () => {
    await pushNotificationsService.registrarAposLogin();

    expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it('retorna null e nunca chama a RPC quando a permissão é negada', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });

    const resultado = await pushNotificationsService.registrarAposLogin();

    expect(resultado).toBeNull();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(separadorSupabase.rpc).not.toHaveBeenCalled();
  });

  it('retorna null e nunca pede token quando não é dispositivo físico', async () => {
    Device.isDevice = false;

    const resultado = await pushNotificationsService.registrarAposLogin();

    expect(resultado).toBeNull();
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(separadorSupabase.rpc).not.toHaveBeenCalled();
  });

  it('retorna null quando o EAS projectId ainda não está configurado (placeholder PENDENTE)', async () => {
    Constants.expoConfig = { extra: { eas: { projectId: 'PENDENTE' } } };

    const resultado = await pushNotificationsService.registrarAposLogin();

    expect(resultado).toBeNull();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(separadorSupabase.rpc).not.toHaveBeenCalled();
  });

  it('retorna null quando o EAS projectId está totalmente ausente', async () => {
    Constants.expoConfig = { extra: {} };

    const resultado = await pushNotificationsService.registrarAposLogin();

    expect(resultado).toBeNull();
    expect(separadorSupabase.rpc).not.toHaveBeenCalled();
  });

  it('nunca lança: engole erro de getExpoPushTokenAsync (ex.: rede) e retorna null', async () => {
    Notifications.getExpoPushTokenAsync.mockRejectedValue(new Error('offline'));

    await expect(pushNotificationsService.registrarAposLogin()).resolves.toBeNull();
    expect(separadorSupabase.rpc).not.toHaveBeenCalled();
  });

  it('nunca lança: engole erro da RPC (ex.: registrar_push_token ainda não existe no banco)', async () => {
    separadorSupabase.rpc.mockResolvedValue({ data: null, error: new Error('function not found') });

    await expect(pushNotificationsService.registrarAposLogin()).resolves.toBeNull();
  });
});

// Cobre o bug real de produção (04/09): `expo-notifications` lança uma
// exceção só de ser IMPORTADO no Android dentro do Expo Go (SDK 53+) — ver
// node_modules/expo-notifications/src/warnOfExpoGoPushUsage.ts. O service
// nunca deve chamar nada do módulo real nesse cenário; ele só é carregado
// via `require` tardio depois de checar `isRunningInExpoGo()`.
describe('pushNotificationsService.registrarAposLogin (dentro do Expo Go)', () => {
  it('pula o registro sem lançar erro e sem tocar em expo-notifications/RPC, mesmo no Android', async () => {
    isRunningInExpoGo.mockReturnValue(true);
    setPlataforma('android');

    const resultado = await pushNotificationsService.registrarAposLogin();

    expect(resultado).toBeNull();
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(separadorSupabase.rpc).not.toHaveBeenCalled();
  });

  it('pula o registro no Expo Go mesmo com dispositivo físico e permissão concedida', async () => {
    isRunningInExpoGo.mockReturnValue(true);
    Device.isDevice = true;

    await expect(pushNotificationsService.registrarAposLogin()).resolves.toBeNull();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });
});
