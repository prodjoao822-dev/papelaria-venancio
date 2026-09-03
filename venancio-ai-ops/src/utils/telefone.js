// Normalização de telefone — mesma convenção usada pelo bot (JS Bot) ao
// gravar `clientes.telefone` a partir de uma conversa real do WhatsApp:
// só dígitos, com DDI do Brasil (55) na frente
// (ver chatbot/papelaria-bot/src/webhook/payloadParser.js:extrairTelefone,
// que tira "5511999990000@s.whatsapp.net" e fica só com "5511999990000").
//
// Sem essa normalização, um cliente cadastrado manualmente no dashboard
// (NovoOrcamentoModal, NovoPedidoModal, CriarPedidoDeListaModal — todos
// aceitam telefone como texto livre, ex.: "+55 11 99999-0000") fica com
// `clientes.telefone` num formato diferente do que um cliente vindo do
// WhatsApp. Duas consequências:
//   1. `buscarPorTelefone` (match exato) não encontra o cliente que já
//      existe com o telefone em formato "cru", e cria um duplicado;
//   2. o envio de PDF pelo WhatsApp (orcamentos.service.js:enviarPdf) manda
//      esse telefone cru direto pra Evolution API (evolutionApi.js não
//      normaliza nada, só repassa o campo `number`), que rejeita o número
//      mal formatado — causa raiz do "Falha ao enviar o PDF pelo WhatsApp"
//      visto em produção em orçamento criado manualmente (02/09/2026).
//
// Função pura (sem window/document) de propósito: é usada por clientes.service.js,
// que precisa continuar agnóstico de browser para o app mobile reaproveitar.
export function normalizarTelefone(telefone) {
  if (!telefone) return telefone

  const digitos = String(telefone).replace(/\D/g, '')
  if (!digitos) return digitos

  // Já tem o DDI do Brasil e tamanho compatível com DDD + número
  // (12 = 55 + DDD + 8 dígitos fixo; 13 = 55 + DDD + 9 dígitos celular).
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) {
    return digitos
  }

  // Sem DDI: só DDD + número (10 = fixo, 11 = celular) — prefixa 55.
  if (digitos.length === 10 || digitos.length === 11) {
    return `55${digitos}`
  }

  // Formato que não reconhecemos (incompleto, internacional não-BR, etc.):
  // não inventa prefixo, devolve só os dígitos como estavam.
  return digitos
}
