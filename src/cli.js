// Simulador de conversa no terminal: usa a mesma stateMachine que o webhook vai usar depois.
// Rodar com: npm run chat

const readline = require('node:readline');
const { estadoInicial, processarMensagem } = require('./botEngine/stateMachine');
const menuPrincipal = require('./botEngine/states/menuPrincipal');

let sessao;
try {
  sessao = estadoInicial();
} catch (erro) {
  console.log(erro.message);
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log('--- Simulador de conversa (Ctrl+C para sair) ---\n');

// Simula o pushName que a Evolution API manda no payload real, pra dar pra
// testar a saudação personalizada sem precisar de um webhook de verdade.
rl.question('Nome do contato simulado (opcional, Enter pra pular): ', (nomeDigitado) => {
  const contexto = { nomeCliente: nomeDigitado.trim() || null };

  console.log('\nBot:', menuPrincipal.mensagem(contexto), '\n');

  rl.on('line', (linha) => {
    const resultado = processarMensagem(sessao, linha, contexto);
    sessao = resultado.sessao;

    resultado.acoes.forEach((acao) => {
      console.log(`[ação] ${acao.tipo} -> ${acao.alvo}`, acao.dados || '');
    });

    if (resultado.resposta) {
      console.log('Bot:', resultado.resposta, '\n');
    }
  });
});
