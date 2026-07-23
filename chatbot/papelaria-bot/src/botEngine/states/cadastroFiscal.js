// Fluxo de cadastro fiscal: disparado antes de qualquer orçamento (Cotação
// Empresa, Lista Escolar "outra escola") virar pedido, porque nota fiscal é
// exigida independente do tipo de venda. Quem entra nesse fluxo já deixou em
// `dados.origemOrcamento` o que precisa virar orçamento no fechamento (ver
// cotacaoEmpresa.js / listaEscolar.js) — este módulo não conhece o resto do
// funil de vendas, só lê esse campo.
//
// Lógica condicional demais (PF vs PJ, contribuinte vs não, retirada vs
// entrega) pra caber no menuEngine — por isso é escrito à mão, como
// listaEscolar.js/cotacaoEmpresa.js.
//
// A checagem silenciosa "cliente já tem cadastro completo?" (Passo 0 do PRD)
// não é um estado daqui: é feita antes, em webhookController.js
// (cliente_tem_cadastro_completo), e quem decide pular esse módulo inteiro é
// quem transiciona pra cá (cotacaoEmpresa.js/listaEscolar.js).

const fallback = require('./fallback');
const { parseOpcaoNumerica } = require('../validadores');

const ESTADO_ATALHO = 'CADASTRO_FISCAL_ATALHO';
const ESTADO_DOC_ATALHO = 'CADASTRO_FISCAL_DOC_ATALHO';
const ESTADO_TIPO_PESSOA = 'CADASTRO_FISCAL_TIPO_PESSOA';
const ESTADO_CPF = 'CADASTRO_FISCAL_CPF';
const ESTADO_CNPJ = 'CADASTRO_FISCAL_CNPJ';
const ESTADO_RAZAO_SOCIAL = 'CADASTRO_FISCAL_RAZAO_SOCIAL';
const ESTADO_NOME_FANTASIA = 'CADASTRO_FISCAL_NOME_FANTASIA';
const ESTADO_INDICADOR_IE = 'CADASTRO_FISCAL_INDICADOR_IE';
const ESTADO_INSCRICAO_ESTADUAL = 'CADASTRO_FISCAL_INSCRICAO_ESTADUAL';
const ESTADO_ENTREGA = 'CADASTRO_FISCAL_ENTREGA';
const ESTADO_CEP = 'CADASTRO_FISCAL_CEP';
const ESTADO_ENDERECO = 'CADASTRO_FISCAL_ENDERECO';
const ESTADO_CIDADE_ESTADO = 'CADASTRO_FISCAL_CIDADE_ESTADO';
const ESTADO_NOME = 'CADASTRO_FISCAL_NOME';
const ESTADO_TELEFONE_CONTATO = 'CADASTRO_FISCAL_TELEFONE_CONTATO';
// Depois de fechar o pedido, volta pro submenu de Vendas — mesmo motivo dos
// outros fluxos de vendas: o cliente não precisa digitar "1" de novo.
const ESTADO_SUBMENU_VENDAS = 'SUBMENU_VENDAS';

const OPCOES_INDICADOR_IE = { 1: 'contribuinte', 2: 'isento', 3: 'nao_contribuinte' };

function apenasDigitos(texto) {
  return (texto || '').replace(/\D/g, '');
}

function ehSim(texto) {
  return ['sim', 's'].includes((texto || '').trim().toLowerCase());
}

function ehNao(texto) {
  return ['não', 'nao', 'n'].includes((texto || '').trim().toLowerCase());
}

// Campos que só existem enquanto o cadastro fiscal está em andamento — não
// devem sobreviver depois que o pedido é fechado (a próxima cotação/lista
// escolar começa cadastroFiscal do zero, via origemOrcamento novo).
function semCamposTransitorios(dados) {
  const { cadastroFiscal: _cf, origemOrcamento: _oo, ...resto } = dados;
  return resto;
}

// --- Passo 1: atalho "já tem cadastro?" ---

function mensagemAtalho() {
  return 'Antes de fechar, uma pergunta rápida: você já tem cadastro em nosso sistema? (sim/não)';
}

function processarAtalho(textoRecebido, sessao) {
  if (ehSim(textoRecebido)) {
    return { estado: ESTADO_DOC_ATALHO, dados: sessao.dados };
  }
  if (ehNao(textoRecebido)) {
    return { estado: ESTADO_TIPO_PESSOA, dados: sessao.dados };
  }
  return { estado: ESTADO_ATALHO, resposta: fallback.mensagemOpcaoInvalida(mensagemAtalho()) };
}

// --- Passo 1b (atalho): só o CPF/CNPJ, pula direto pro fechamento ---

function mensagemDocAtalho() {
  return 'Pode me informar seu CPF ou CNPJ?';
}

function processarDocAtalho(textoRecebido, sessao) {
  const digitos = apenasDigitos(textoRecebido);

  if (digitos.length !== 11 && digitos.length !== 14) {
    return {
      estado: ESTADO_DOC_ATALHO,
      resposta: 'Não consegui reconhecer esse CPF/CNPJ (confira se tem 11 ou 14 números) — pode mandar de novo?',
    };
  }

  const ehCnpj = digitos.length === 14;
  const cadastroFiscal = {
    tem_cadastro_previo: true,
    tipo_pessoa: ehCnpj ? 'PJ' : 'PF',
    ...(ehCnpj ? { cnpj: digitos } : { cpf: digitos }),
  };

  return finalizarFechamento(sessao, cadastroFiscal);
}

// --- Passo 2.1: pessoa física ou jurídica ---

function mensagemTipoPessoa() {
  return 'Pessoa física ou jurídica?\n\n1. Pessoa física\n2. Pessoa jurídica';
}

function processarTipoPessoa(textoRecebido, sessao) {
  const indice = parseOpcaoNumerica(textoRecebido, 2);

  if (indice === null) {
    return { estado: ESTADO_TIPO_PESSOA, resposta: fallback.mensagemOpcaoInvalida(mensagemTipoPessoa()) };
  }

  return { estado: indice === 0 ? ESTADO_CPF : ESTADO_CNPJ, dados: sessao.dados };
}

// --- Passo 2.2a (PF): CPF ---

function mensagemCpf() {
  return 'Qual o seu CPF?';
}

function processarCpf(textoRecebido, sessao) {
  const digitos = apenasDigitos(textoRecebido);

  if (digitos.length !== 11) {
    return {
      estado: ESTADO_CPF,
      resposta: 'Esse CPF não parece ter 11 números — pode conferir e mandar de novo?',
    };
  }

  const cadastroFiscal = { ...sessao.dados.cadastroFiscal, tipo_pessoa: 'PF', cpf: digitos };
  return { estado: ESTADO_ENTREGA, dados: { ...sessao.dados, cadastroFiscal } };
}

// --- Passo 2.2b (PJ): CNPJ, Razão Social e Nome Fantasia — uma pergunta por vez ---
//
// Já foi uma mensagem só ("CNPJ, Razão Social, Nome Fantasia, separado por
// vírgula"), mas isso quebrou em produção: no app do WhatsApp, Enter costuma
// ENVIAR a mensagem em vez de quebrar linha, então um cliente que digita cada
// dado numa linha manda, na prática, 3 mensagens separadas — e só a primeira
// era capturada, empurrando o fluxo pra frente sem os outros dois dados (ver
// o mesmo problema em mensagemNome/mensagemTelefoneContato abaixo). Perguntas
// separadas removem essa ambiguidade por completo.

function mensagemCnpj() {
  return 'Qual o CNPJ da empresa?';
}

function processarCnpj(textoRecebido, sessao) {
  const cnpj = apenasDigitos(textoRecebido);

  if (cnpj.length !== 14) {
    return { estado: ESTADO_CNPJ, resposta: 'Esse CNPJ não parece ter 14 números — pode conferir e mandar de novo?' };
  }

  const cadastroFiscal = { ...sessao.dados.cadastroFiscal, tipo_pessoa: 'PJ', cnpj };
  return { estado: ESTADO_RAZAO_SOCIAL, dados: { ...sessao.dados, cadastroFiscal } };
}

function mensagemRazaoSocial() {
  return 'Qual a Razão Social?';
}

function processarRazaoSocial(textoRecebido, sessao) {
  const razaoSocial = textoRecebido.trim();

  if (!razaoSocial) {
    return { estado: ESTADO_RAZAO_SOCIAL, resposta: fallback.mensagemOpcaoInvalida(mensagemRazaoSocial()) };
  }

  const cadastroFiscal = { ...sessao.dados.cadastroFiscal, razao_social: razaoSocial };
  return { estado: ESTADO_NOME_FANTASIA, dados: { ...sessao.dados, cadastroFiscal } };
}

function mensagemNomeFantasia() {
  return 'Qual o Nome Fantasia?';
}

function processarNomeFantasia(textoRecebido, sessao) {
  const nomeFantasia = textoRecebido.trim();

  if (!nomeFantasia) {
    return { estado: ESTADO_NOME_FANTASIA, resposta: fallback.mensagemOpcaoInvalida(mensagemNomeFantasia()) };
  }

  const cadastroFiscal = { ...sessao.dados.cadastroFiscal, nome_fantasia: nomeFantasia };
  return { estado: ESTADO_INDICADOR_IE, dados: { ...sessao.dados, cadastroFiscal } };
}

// --- Passo 2.2b: indicador de Inscrição Estadual ---

function mensagemIndicadorIe() {
  return 'Qual o indicador de Inscrição Estadual?\n\n1. Contribuinte\n2. Isento\n3. Não contribuinte';
}

function processarIndicadorIe(textoRecebido, sessao) {
  const opcao = OPCOES_INDICADOR_IE[textoRecebido.trim()];

  if (!opcao) {
    return { estado: ESTADO_INDICADOR_IE, resposta: fallback.mensagemOpcaoInvalida(mensagemIndicadorIe()) };
  }

  const cadastroFiscal = { ...sessao.dados.cadastroFiscal, indicador_ie: opcao };
  const dados = { ...sessao.dados, cadastroFiscal };

  return { estado: opcao === 'contribuinte' ? ESTADO_INSCRICAO_ESTADUAL : ESTADO_ENTREGA, dados };
}

// --- Passo 2.2b (condicional): Inscrição Estadual, só se contribuinte ---

function mensagemInscricaoEstadual() {
  return 'Qual a Inscrição Estadual?';
}

function processarInscricaoEstadual(textoRecebido, sessao) {
  const inscricaoEstadual = textoRecebido.trim();

  if (!inscricaoEstadual) {
    return { estado: ESTADO_INSCRICAO_ESTADUAL, resposta: fallback.mensagemOpcaoInvalida(mensagemInscricaoEstadual()) };
  }

  const cadastroFiscal = { ...sessao.dados.cadastroFiscal, inscricao_estadual: inscricaoEstadual };
  return { estado: ESTADO_ENTREGA, dados: { ...sessao.dados, cadastroFiscal } };
}

// --- Passo 3: retirada na loja ou entrega ---

function mensagemEntrega() {
  return 'Você vai retirar na loja ou receber em casa (entrega)?\n\n1. Retirar na loja\n2. Entrega';
}

function processarEntrega(textoRecebido, sessao) {
  const indice = parseOpcaoNumerica(textoRecebido, 2);

  if (indice === null) {
    return { estado: ESTADO_ENTREGA, resposta: fallback.mensagemOpcaoInvalida(mensagemEntrega()) };
  }

  return { estado: indice === 0 ? ESTADO_NOME : ESTADO_CEP, dados: sessao.dados };
}

// --- Passo 3.1 (só entrega): CEP ---

function mensagemCep() {
  return 'Qual o CEP?';
}

function processarCep(textoRecebido, sessao) {
  const cep = apenasDigitos(textoRecebido);

  if (cep.length !== 8) {
    return { estado: ESTADO_CEP, resposta: 'Esse CEP não parece ter 8 números — pode conferir e mandar de novo?' };
  }

  const cadastroFiscal = { ...sessao.dados.cadastroFiscal, cep };
  return { estado: ESTADO_ENDERECO, dados: { ...sessao.dados, cadastroFiscal } };
}

// --- Passo 3.2 (só entrega): endereço agrupado ---

function mensagemEndereco() {
  return 'Agora me manda: rua, número, complemento (se tiver) e bairro, numa mensagem só';
}

function processarEndereco(textoRecebido, sessao) {
  const endereco = textoRecebido.trim();

  if (!endereco) {
    return { estado: ESTADO_ENDERECO, resposta: fallback.mensagemOpcaoInvalida(mensagemEndereco()) };
  }

  const cadastroFiscal = { ...sessao.dados.cadastroFiscal, endereco };
  return { estado: ESTADO_CIDADE_ESTADO, dados: { ...sessao.dados, cadastroFiscal } };
}

// --- Passo 3.3 (só entrega): cidade e estado ---

function mensagemCidadeEstado() {
  return 'Cidade e estado?';
}

function processarCidadeEstado(textoRecebido, sessao) {
  const partes = textoRecebido.split(',').map((parte) => parte.trim()).filter(Boolean);
  const [cidade, estado] = partes.length === 2 ? partes : [textoRecebido.trim(), null];

  if (!cidade) {
    return { estado: ESTADO_CIDADE_ESTADO, resposta: fallback.mensagemOpcaoInvalida(mensagemCidadeEstado()) };
  }

  const cadastroFiscal = { ...sessao.dados.cadastroFiscal, cidade, ...(estado ? { estado } : {}) };
  return { estado: ESTADO_NOME, dados: { ...sessao.dados, cadastroFiscal } };
}

// --- Passo 4: nome, depois telefone de contato (terminal), então fecha o pedido ---

function mensagemNome() {
  return 'Pra fechar, qual o seu nome completo?';
}

function processarNome(textoRecebido, sessao) {
  const nome = textoRecebido.trim();

  if (!nome) {
    return { estado: ESTADO_NOME, resposta: fallback.mensagemOpcaoInvalida(mensagemNome()) };
  }

  const cadastroFiscal = { ...sessao.dados.cadastroFiscal, nome };
  return { estado: ESTADO_TELEFONE_CONTATO, dados: { ...sessao.dados, cadastroFiscal } };
}

function mensagemTelefoneContato() {
  return 'Um telefone de contato, caso seja diferente deste WhatsApp (se for o mesmo, digite "não")';
}

function processarTelefoneContato(textoRecebido, sessao) {
  const resposta = textoRecebido.trim();

  if (!resposta) {
    return { estado: ESTADO_TELEFONE_CONTATO, resposta: fallback.mensagemOpcaoInvalida(mensagemTelefoneContato()) };
  }

  const cadastroFiscal = ehNao(resposta)
    ? sessao.dados.cadastroFiscal
    : { ...sessao.dados.cadastroFiscal, telefone_contato: resposta };

  return finalizarFechamento(sessao, cadastroFiscal);
}

// --- Fechamento comum aos dois ramos (atalho "sim" e formulário completo) ---

// Reaproveitada também por cotacaoEmpresa.js/listaEscolar.js quando
// `contexto.cadastroCompleto` já é true e o fechamento pula este módulo
// inteiro (ver montarAcaoFechamento).
const MENSAGEM_CONFIRMANDO_PEDIDO = 'Perfeito! Já estou confirmando seu pedido, só um instante...';

function montarAcaoFechamento(origemOrcamento, cadastroFiscal) {
  return { tipo: 'FINALIZAR_CADASTRO_E_PEDIDO', dados: { origemOrcamento, cadastroFiscal } };
}

function finalizarFechamento(sessao, cadastroFiscal) {
  return {
    estado: ESTADO_SUBMENU_VENDAS,
    dados: semCamposTransitorios(sessao.dados),
    resposta: MENSAGEM_CONFIRMANDO_PEDIDO,
    acoes: [montarAcaoFechamento(sessao.dados.origemOrcamento, cadastroFiscal)],
  };
}

module.exports = {
  ESTADO_ATALHO,
  ESTADO_SUBMENU_VENDAS,
  MENSAGEM_CONFIRMANDO_PEDIDO,
  montarAcaoFechamento,
  estados: [
    { STATE: ESTADO_ATALHO, mensagem: mensagemAtalho, processar: processarAtalho },
    { STATE: ESTADO_DOC_ATALHO, mensagem: mensagemDocAtalho, processar: processarDocAtalho, aceitaTextoLivre: true },
    { STATE: ESTADO_TIPO_PESSOA, mensagem: mensagemTipoPessoa, processar: processarTipoPessoa },
    { STATE: ESTADO_CPF, mensagem: mensagemCpf, processar: processarCpf, aceitaTextoLivre: true },
    { STATE: ESTADO_CNPJ, mensagem: mensagemCnpj, processar: processarCnpj, aceitaTextoLivre: true },
    { STATE: ESTADO_RAZAO_SOCIAL, mensagem: mensagemRazaoSocial, processar: processarRazaoSocial, aceitaTextoLivre: true },
    { STATE: ESTADO_NOME_FANTASIA, mensagem: mensagemNomeFantasia, processar: processarNomeFantasia, aceitaTextoLivre: true },
    { STATE: ESTADO_INDICADOR_IE, mensagem: mensagemIndicadorIe, processar: processarIndicadorIe },
    {
      STATE: ESTADO_INSCRICAO_ESTADUAL,
      mensagem: mensagemInscricaoEstadual,
      processar: processarInscricaoEstadual,
      aceitaTextoLivre: true,
    },
    { STATE: ESTADO_ENTREGA, mensagem: mensagemEntrega, processar: processarEntrega },
    { STATE: ESTADO_CEP, mensagem: mensagemCep, processar: processarCep, aceitaTextoLivre: true },
    { STATE: ESTADO_ENDERECO, mensagem: mensagemEndereco, processar: processarEndereco, aceitaTextoLivre: true },
    {
      STATE: ESTADO_CIDADE_ESTADO,
      mensagem: mensagemCidadeEstado,
      processar: processarCidadeEstado,
      aceitaTextoLivre: true,
    },
    { STATE: ESTADO_NOME, mensagem: mensagemNome, processar: processarNome, aceitaTextoLivre: true },
    {
      STATE: ESTADO_TELEFONE_CONTATO,
      mensagem: mensagemTelefoneContato,
      processar: processarTelefoneContato,
      aceitaTextoLivre: true,
    },
  ],
};
