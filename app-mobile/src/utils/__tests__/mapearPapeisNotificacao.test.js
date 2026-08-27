import { mapearPapeisParaDestinatarioTipos } from '../mapearPapeisNotificacao';

describe('mapearPapeisParaDestinatarioTipos', () => {
  it('mapeia separacao para separador', () => {
    expect(mapearPapeisParaDestinatarioTipos(['separacao'])).toEqual(['separador']);
  });

  it('mapeia entrega para entregador', () => {
    expect(mapearPapeisParaDestinatarioTipos(['entrega'])).toEqual(['entregador']);
  });

  it('funcionário com os dois papéis vê os dois tipos', () => {
    expect(mapearPapeisParaDestinatarioTipos(['separacao', 'entrega'])).toEqual(
      expect.arrayContaining(['separador', 'entregador'])
    );
    expect(mapearPapeisParaDestinatarioTipos(['separacao', 'entrega'])).toHaveLength(2);
  });

  it('ignora papéis sem tipo de notificação mapeado', () => {
    expect(mapearPapeisParaDestinatarioTipos(['admin'])).toEqual([]);
  });

  it('não quebra com array vazio', () => {
    expect(mapearPapeisParaDestinatarioTipos([])).toEqual([]);
  });

  it('não quebra com papeis ausente/null/undefined', () => {
    expect(mapearPapeisParaDestinatarioTipos(null)).toEqual([]);
    expect(mapearPapeisParaDestinatarioTipos(undefined)).toEqual([]);
  });

  it('não duplica tipo se o papel aparecer repetido', () => {
    expect(mapearPapeisParaDestinatarioTipos(['separacao', 'separacao'])).toEqual(['separador']);
  });
});
