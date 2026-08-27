// De-para entre dois vocabulários do mesmo conceito, confirmado ao vivo em
// 26/08/2026 contra `chatbot/papelaria-bot/supabase/extensao_notificacao_
// entregador.sql` e `baseline_producao_26-08-2026.sql`:
//   - `funcionarios.papeis` (text[]) usa 'separacao' / 'entrega';
//   - `notificacoes_internas.destinatario_tipo` usa 'separador' / 'entregador'.
// Um funcionário pode ter os dois papéis ao mesmo tempo (`{'separacao','entrega'}`).
const MAPA_PAPEL_PARA_DESTINATARIO_TIPO = {
  separacao: 'separador',
  entrega: 'entregador',
};

// Converte os papéis do funcionário logado na lista de `destinatario_tipo`
// que ele deve enxergar em `notificacoes_internas`. Papéis sem tipo de
// notificação mapeado (ex.: array vazio, ou só um papel administrativo
// futuro sem entrada no mapa acima) são ignorados silenciosamente — o
// resultado pode ser `[]`, e quem chama deve tratar isso sem erro (nenhuma
// notificação a mostrar, não uma falha).
export function mapearPapeisParaDestinatarioTipos(papeis) {
  if (!Array.isArray(papeis)) return [];
  const tipos = papeis
    .map((papel) => MAPA_PAPEL_PARA_DESTINATARIO_TIPO[papel])
    .filter(Boolean);
  return [...new Set(tipos)];
}
