// Utilitário de logging usado em toda a aplicação.
// Centralizado aqui para manter um formato único (timestamp + nível) e para que,
// se um dia trocarmos por uma lib de log estruturado, só este arquivo mude.

function timestamp() {
  return new Date().toISOString();
}

function info(mensagem, dados) {
  console.log(`[${timestamp()}] [INFO] ${mensagem}`, dados !== undefined ? dados : '');
}

function aviso(mensagem, dados) {
  console.warn(`[${timestamp()}] [AVISO] ${mensagem}`, dados !== undefined ? dados : '');
}

function erro(mensagem, erroOriginal) {
  console.error(`[${timestamp()}] [ERRO] ${mensagem}`, erroOriginal !== undefined ? erroOriginal : '');
}

module.exports = { info, aviso, erro };
