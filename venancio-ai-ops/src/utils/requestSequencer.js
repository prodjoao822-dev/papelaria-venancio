// Guarda genérica contra respostas de rede fora de ordem.
//
// Bug real que motivou isto (PedidoModal.jsx): várias seções do modal de
// pedido (Responsáveis, Sequência ShopControl, Pagamento, "Marcar Todos" do
// checklist) chamam onAtualizar() de forma independente depois de salvar,
// cada uma disparando um novo `buscarPorId(pedido)`. Se o usuário editar dois
// campos em sequência rápida, duas requisições ficam em voo ao mesmo tempo —
// e sem essa guarda, a resposta que *chega* por último vence, mesmo que
// tenha sido *disparada* antes da outra (rede não garante ordem de entrega).
// Isso fazia um salvamento recente "sumir" da tela por alguns instantes
// (parecia "não salvou", quando na verdade salvou — só a UI mostrou um
// snapshot antigo por causa da corrida).
//
// Uso: cada chamada pega um número via proxima(); só aplica o resultado se
// ehAtual(numero) ainda for verdadeiro quando a resposta chegar.
export function criarSequenciadorDeRequisicoes() {
  let atual = 0
  return {
    proxima() {
      atual += 1
      return atual
    },
    ehAtual(numero) {
      return numero === atual
    },
  }
}
