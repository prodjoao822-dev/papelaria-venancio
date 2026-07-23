// Helper de fallback: mensagem padrão usada por qualquer estado quando o cliente
// digita algo que não corresponde a nenhuma opção esperada naquele estado.
// Não é registrado como um STATE próprio na stateMachine — é só reaproveitado
// pelos outros estados para não repetir o mesmo texto de erro em cada um.

function mensagemOpcaoInvalida(mensagemEstadoAtual) {
  return `Opção inválida. Por favor, digite um dos números listados abaixo.\n\n${mensagemEstadoAtual}`;
}

module.exports = { mensagemOpcaoInvalida };
