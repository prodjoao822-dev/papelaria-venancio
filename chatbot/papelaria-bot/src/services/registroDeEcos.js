// Registro das mensagens que o PRÓPRIO bot mandou, usado pra reconhecer o eco
// que a Evolution API devolve pelo webhook como `fromMe: true`.
//
// Por que isso existe: o WhatsApp não distingue "mandado pela API" de "digitado
// à mão no app da loja" — as duas saem da mesma sessão autenticada e voltam
// iguais. O webhookController trata `fromMe` desconhecido como "um humano
// assumiu" e pausa o bot; sem este registro, o bot pausava a si mesmo a cada
// resposta (ver ARCHITECTURE_REVIEW.md, fase 3.6).
//
// Por que em DISCO e não só em memória (12/08): as duas estruturas viviam em
// `Set`/`Map` do processo. O nodemon reinicia a cada arquivo salvo, e o PM2
// reinicia em qualquer crash — a cada restart o bot esquecia tudo que tinha
// acabado de mandar, e os ecos daquelas mensagens voltavam como "humano
// respondeu", pausando conversas vivas. Junto com o relógio de reativação
// (ver middlewares/reativacaoBot.js), essas conversas não voltavam mais
// sozinhas. Ou seja: salvar um arquivo no editor calava clientes reais.
//
// Persistir num arquivo local basta pro deploy de instância única deste projeto
// (mesma premissa já assumida pelos locks em memória do webhookController).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const logger = require('../utils/logger');

// O override por env existe pros testes: eles simulam restart recarregando este
// módulo, e precisam de um arquivo descartável em vez do cache real do bot.
const CAMINHO_CACHE = process.env.REGISTRO_ECOS_PATH
  || path.join(__dirname, '..', '..', '.cache', 'ecos-do-bot.json');

// TTLs diferentes de propósito, porque o risco dos dois casamentos é diferente:
//
// - Por id: o id é único e só existe se veio da resposta da própria Evolution
//   API, então casar por ele NUNCA gera falso positivo. Pode viver bastante, e
//   vale a pena: quando a sessão do WhatsApp cai e reconecta horas depois, a
//   Evolution despeja a fila acumulada de uma vez, e ecos antigos precisam
//   continuar sendo reconhecidos.
//
// - Por conteúdo: é um casamento por telefone+texto, usado só quando o id se
//   perdeu (ECONNRESET na leitura da resposta). Aqui existe um falso positivo
//   teórico — um humano da loja digitando, caractere por caractere, a mesma
//   mensagem que o bot mandou pro mesmo número. Improvável com textos de menu,
//   mas é o único caso que pode fazer o bot ignorar um humano de verdade, então
//   fica com janela curta.
const TEMPO_DE_VIDA_DO_ID_MS = 6 * 60 * 60 * 1000;
const TEMPO_DE_VIDA_DO_CONTEUDO_MS = 30 * 60 * 1000;

// Teto de segurança pro arquivo não crescer sem fim se algo parar de consumir
// (ex.: webhook de saída desabilitado na instância). Descarta sempre o mais
// antigo, que é o mais provável de já ser lixo.
const MAX_ENTRADAS = 500;

// id -> instante (ms) em que expira
const ids = new Map();
// chave (telefone:texto) -> lista de instantes de expiração, um por envio
// pendente de eco. Lista, e não contador, porque cada envio tem o próprio
// prazo: a mesma mensagem pode ser mandada duas vezes com 20 min de intervalo.
const conteudos = new Map();

function chaveDeConteudo(telefoneDestino, texto) {
  return `${String(telefoneDestino ?? '').replace(/\D/g, '')}:${String(texto ?? '').trim()}`;
}

// Expiração por comparação de instante, não por setTimeout: um timer morre com
// o processo, e o ponto deste módulo é justamente sobreviver ao restart. Assim
// o que está gravado no disco continua honrando o prazo depois de recarregado.
function descartarExpirados(agora = Date.now()) {
  for (const [id, expiraEm] of ids) {
    if (expiraEm <= agora) ids.delete(id);
  }

  for (const [chave, prazos] of conteudos) {
    const vivos = prazos.filter((expiraEm) => expiraEm > agora);
    if (vivos.length > 0) conteudos.set(chave, vivos);
    else conteudos.delete(chave);
  }
}

function aplicarTeto(mapa) {
  while (mapa.size > MAX_ENTRADAS) {
    // Map preserva ordem de inserção — a primeira chave é a mais antiga.
    mapa.delete(mapa.keys().next().value);
  }
}

let filaDeGravacao = Promise.resolve();
let contadorDeTemporarios = 0;

// No Windows, renomear por cima de um arquivo que outro handle tem aberto falha
// com EPERM/EBUSY em vez de simplesmente substituir (o POSIX substitui). Isso
// acontece de verdade aqui: no restart do nodemon, o processo velho ainda pode
// estar gravando enquanto o novo já está lendo o mesmo arquivo no boot. É uma
// disputa de milissegundos, então uma retentativa curta resolve.
const ERROS_DE_RENAME_TRANSITORIOS = new Set(['EPERM', 'EACCES', 'EBUSY']);

async function renomearComRetentativa(origem, destino, tentativasRestantes = 3) {
  try {
    await fs.promises.rename(origem, destino);
  } catch (erro) {
    if (tentativasRestantes <= 1 || !ERROS_DE_RENAME_TRANSITORIOS.has(erro.code)) throw erro;

    await new Promise((resolve) => { setTimeout(resolve, 50).unref(); });
    await renomearComRetentativa(origem, destino, tentativasRestantes - 1);
  }
}

// Gravação atômica (arquivo temporário + rename): um restart no meio da escrita
// não pode deixar um JSON pela metade, senão o próximo boot perde o registro
// inteiro — exatamente o problema que este módulo veio resolver.
async function executarGravacao() {
  const conteudoSerializado = JSON.stringify({
    ids: [...ids],
    conteudos: [...conteudos],
  });
  // Nome único por gravação: duas escritas simultâneas no MESMO temporário
  // podem intercalar bytes e produzir um JSON quebrado, que o rename então
  // promoveria a arquivo oficial — corrupção silenciosa, o oposto do objetivo.
  // Com sufixo aleatório além do pid, porque pid+contador não basta: qualquer
  // situação com dois donos do mesmo arquivo (um `npm start` e um `npm run dev`
  // abertos juntos, ou o módulo recarregado no mesmo processo) reinicia o
  // contador e volta a colidir.
  contadorDeTemporarios += 1;
  const sufixo = `${process.pid}.${contadorDeTemporarios}.${crypto.randomBytes(4).toString('hex')}`;
  const temporario = `${CAMINHO_CACHE}.${sufixo}.tmp`;

  try {
    await fs.promises.mkdir(path.dirname(CAMINHO_CACHE), { recursive: true });
    await fs.promises.writeFile(temporario, conteudoSerializado);
    await renomearComRetentativa(temporario, CAMINHO_CACHE);
  } catch (erro) {
    // Best-effort: perder a persistência degrada pro comportamento antigo (só
    // memória), o que é ruim mas não justifica derrubar um envio de mensagem.
    logger.aviso('Não foi possível gravar o registro de ecos do bot em disco', erro.message);
    await fs.promises.unlink(temporario).catch(() => { /* pode nem ter sido criado */ });
  }
}

// Serializa as gravações numa fila: `gravarAgora` é disparado sem await (o envio
// da mensagem não pode esperar disco), então sem isso duas gravações se
// sobrepõem. Encadear garante uma de cada vez, sempre com o estado mais recente.
function gravarAgora() {
  filaDeGravacao = filaDeGravacao.then(executarGravacao, executarGravacao);
  return filaDeGravacao;
}

// Sem debounce de propósito. Adiar a gravação em algumas centenas de
// milissegundos economizaria uma escrita por mensagem, mas abriria a janela que
// mais importa aqui: o nodemon derruba o processo assim que um arquivo é salvo,
// e um timer pendente (ainda mais com .unref()) morre junto — perdendo
// exatamente o registro da última mensagem enviada, que é a que vai ecoar. A
// fila acima já garante uma escrita de cada vez, e o arquivo é pequeno.
function agendarGravacao() {
  gravarAgora();
}

function carregarDoDisco() {
  let bruto;
  try {
    bruto = fs.readFileSync(CAMINHO_CACHE, 'utf8');
  } catch (erro) {
    // Primeiro boot (arquivo nunca criado) é o caso normal, não merece aviso.
    if (erro.code !== 'ENOENT') {
      logger.aviso('Não foi possível ler o registro de ecos do bot; seguindo com registro vazio', erro.message);
    }
    return;
  }

  try {
    const dados = JSON.parse(bruto);
    for (const [id, expiraEm] of dados.ids ?? []) ids.set(id, expiraEm);
    for (const [chave, prazos] of dados.conteudos ?? []) conteudos.set(chave, prazos);
    descartarExpirados();
    logger.info(
      `Registro de ecos do bot recarregado do disco: ${ids.size} id(s) e ${conteudos.size} conteúdo(s) ainda válidos.`
    );
  } catch (erro) {
    // Arquivo corrompido não pode impedir o bot de subir.
    logger.aviso('Registro de ecos do bot está ilegível; seguindo com registro vazio', erro.message);
    ids.clear();
    conteudos.clear();
  }
}

carregarDoDisco();

// Registrado ANTES do fetch (ver enviarTexto): o reconhecimento do eco não pode
// depender de a resposta da Evolution API ter voltado. Quando o envio falha na
// LEITURA da resposta, a mensagem foi entregue mesmo assim e vai ecoar — só que
// sem id conhecido, e aí é este casamento por conteúdo que segura.
function registrarConteudoEnviado(telefoneDestino, texto) {
  if (!texto) return;

  const chave = chaveDeConteudo(telefoneDestino, texto);
  const prazos = conteudos.get(chave) ?? [];
  prazos.push(Date.now() + TEMPO_DE_VIDA_DO_CONTEUDO_MS);
  conteudos.set(chave, prazos);

  aplicarTeto(conteudos);
  agendarGravacao();
}

function registrarIdEnviado(id) {
  if (!id) return;

  ids.set(id, Date.now() + TEMPO_DE_VIDA_DO_ID_MS);
  aplicarTeto(ids);
  agendarGravacao();
}

// Retorna true (e "consome" o registro) quando o `fromMe` recebido é eco de uma
// mensagem do próprio bot. Consome pra que uma segunda mensagem idêntica, agora
// digitada de verdade por um humano, volte a pausar o bot como deve.
function consumirEcoDoBot(mensagemId, telefoneDestino, texto) {
  descartarExpirados();

  if (mensagemId && ids.has(mensagemId)) {
    ids.delete(mensagemId);
    agendarGravacao();
    return true;
  }

  const chave = chaveDeConteudo(telefoneDestino, texto);
  const prazos = conteudos.get(chave);
  if (prazos?.length > 0) {
    // shift: consome o envio mais antigo primeiro, que é o que está ecoando.
    prazos.shift();
    if (prazos.length > 0) conteudos.set(chave, prazos);
    else conteudos.delete(chave);
    agendarGravacao();
    return true;
  }

  return false;
}

// Só pra testes: zera o estado em memória sem depender do arquivo.
function _limparParaTeste() {
  ids.clear();
  conteudos.clear();
}

module.exports = {
  registrarConteudoEnviado,
  registrarIdEnviado,
  consumirEcoDoBot,
  _limparParaTeste,
  CAMINHO_CACHE,
};
