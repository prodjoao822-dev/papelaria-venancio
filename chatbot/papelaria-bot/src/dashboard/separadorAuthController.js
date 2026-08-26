// Login de funcionário operacional do app mobile (código de funcionário +
// PIN de 6 dígitos) e reset de PIN por um Operador administrativo. Nome do
// módulo/rota ficou "separador" por histórico (era só pro Separador), mas
// desde o addendum de Entrega/Ocorrência (19/08/2026) o login é genérico
// pra qualquer funcionário com papel operacional de app mobile — hoje
// 'separacao' ou 'entrega' em `funcionarios.papeis` (text[], ver
// PAPEIS_FUNCIONARIO em extensao_entrega_ocorrencia.sql). Novos papéis
// operacionais entram só adicionando ao array PAPEIS_APP_MOBILE abaixo, sem
// reescrever a lógica de autenticação. Ver decisão de arquitetura no
// cabeçalho de supabase/extensao_separacao_delegada.sql: o PIN nunca é
// armazenado por nós — vira a senha de um usuário Supabase Auth com e-mail
// sintético (`codigo@venancio.internal`), então quem guarda o hash é o
// próprio Supabase Auth. O que fica aqui é só: (a) rate limit contra força
// bruta por IP (limiteLoginSeparador, ver index.js) + bloqueio por conta
// (pin_tentativas_falhas/pin_bloqueado_ate, escritos com a service key,
// nunca expostos por RPC); (b) resposta genérica pra código inexistente e
// pra PIN errado, pra não vazar quais códigos existem; (c) reset de PIN
// exige sessão de operador ADMIN (nunca self-service).

const supabase = require('../services/supabaseClient');
const logger = require('../utils/logger');

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGEX_PIN = /^\d{6}$/;
const DOMINIO_SINTETICO = 'venancio.internal';
const MAX_TENTATIVAS_ANTES_DE_BLOQUEAR = 5;
const BLOQUEIO_MINUTOS = 15;
// Papéis operacionais aceitos por este login único do app mobile. Adicionar
// um novo papel operacional aqui é o único passo pra este endpoint passar a
// aceitá-lo — não muda a rota nem a resposta genérica de segurança.
const PAPEIS_APP_MOBILE = ['separacao', 'entrega'];

function temPapelOperacional(funcionario) {
  const papeis = funcionario.papeis || [];
  return PAPEIS_APP_MOBILE.some((papel) => papeis.includes(papel));
}

function emailSintetico(codigoFuncionario) {
  return `${codigoFuncionario}@${DOMINIO_SINTETICO}`;
}

// createUser + vincular auth_user_id em `funcionarios` não é atômico: se o
// processo cair (timeout de rede, restart) entre as duas chamadas, sobra um
// usuário órfão no Supabase Auth com o e-mail sintético já registrado, mas
// `funcionarios.auth_user_id` continua null. Todo reset seguinte cai de novo
// no branch de createUser, que passa a falhar pra sempre com "e-mail já
// registrado" — travando o funcionário. Detectamos esse erro específico
// aqui pra reaproveitar o usuário órfão em vez de falhar (ver incidente de
// produção 19/08, funcionários 0810 e 1234).
const REGEX_ERRO_EMAIL_EXISTENTE = /already.*(registered|exists)|email.*(exists|already)/i;

function ehErroEmailJaExistente(erro) {
  if (!erro) return false;
  if (erro.code === 'email_exists') return true;
  const mensagem = typeof erro.message === 'string' ? erro.message : '';
  return REGEX_ERRO_EMAIL_EXISTENTE.test(mensagem);
}

// A Admin API do Supabase Auth não tem "buscar por e-mail" — só listagem
// paginada. O teto de páginas é só uma proteção contra loop infinito se a
// paginação se comportar de forma inesperada; na prática o volume de
// usuários deste projeto (funcionários) nunca chega perto disso.
async function buscarUsuarioAuthPorEmail(email) {
  const alvo = email.toLowerCase();
  const perPage = 200;
  const MAX_PAGINAS = 50;

  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: pagina, perPage });
    if (error) throw error;
    const usuarios = data?.users || [];
    const encontrado = usuarios.find((usuario) => (usuario.email || '').toLowerCase() === alvo);
    if (encontrado) return encontrado;
    if (usuarios.length < perPage) break; // última página
  }
  return null;
}

// Cria o usuário do Supabase Auth pro primeiro login de um funcionário. Se
// o e-mail sintético já existir (usuário órfão de uma tentativa anterior
// que falhou entre createUser e o UPDATE em `funcionarios`), reaproveita
// esse usuário em vez de deixar o funcionário travado pra sempre: atualiza
// a senha dele pro PIN novo e devolve o id pra vincular.
async function provisionarUsuarioAuth(email, pin, funcionarioId) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
  });

  if (!error) {
    return data.user.id;
  }

  if (!ehErroEmailJaExistente(error)) {
    throw error;
  }

  logger.aviso(
    `E-mail ${email} já existia no Supabase Auth ao provisionar login do funcionário ${funcionarioId} — reaproveitando usuário órfão em vez de falhar`,
    error,
  );

  const usuarioOrfao = await buscarUsuarioAuthPorEmail(email);
  if (!usuarioOrfao) {
    // Não deveria acontecer (a Admin API acabou de dizer que o e-mail
    // existe), mas se a listagem não achar, não há o que reaproveitar —
    // propaga o erro original em vez de mascarar o problema.
    throw error;
  }

  const { error: erroUpdate } = await supabase.auth.admin.updateUserById(usuarioOrfao.id, { password: pin });
  if (erroUpdate) throw erroUpdate;

  return usuarioOrfao.id;
}

async function registrarTentativaFalha(funcionario) {
  const novasTentativas = (funcionario.pin_tentativas_falhas || 0) + 1;
  const atualizacao = { pin_tentativas_falhas: novasTentativas };

  if (novasTentativas >= MAX_TENTATIVAS_ANTES_DE_BLOQUEAR) {
    atualizacao.pin_tentativas_falhas = 0;
    atualizacao.pin_bloqueado_ate = new Date(Date.now() + BLOQUEIO_MINUTOS * 60 * 1000).toISOString();
  }

  try {
    await supabase.from('funcionarios').update(atualizacao).eq('id', funcionario.id);
  } catch (erro) {
    logger.erro(`Falha ao registrar tentativa de PIN incorreta (funcionário ${funcionario.id})`, erro);
  }
}

async function resetarTentativas(funcionarioId) {
  try {
    await supabase
      .from('funcionarios')
      .update({ pin_tentativas_falhas: 0, pin_bloqueado_ate: null })
      .eq('id', funcionarioId);
  } catch (erro) {
    logger.erro(`Falha ao resetar tentativas de PIN (funcionário ${funcionarioId})`, erro);
  }
}

async function login(req, res) {
  const codigo = typeof req.body?.codigo_funcionario === 'string' ? req.body.codigo_funcionario.trim() : '';
  const pin = req.body?.pin;

  if (!codigo) {
    return res.status(400).json({ ok: false, erro: 'codigo_funcionario é obrigatório.' });
  }
  if (typeof pin !== 'string' || !REGEX_PIN.test(pin)) {
    return res.status(400).json({ ok: false, erro: 'pin deve ter exatamente 6 dígitos.' });
  }

  const respostaInvalida = () => res.status(401).json({ ok: false, erro: 'Código ou PIN inválido.' });

  let funcionario;
  try {
    const { data, error } = await supabase
      .from('funcionarios')
      .select('id, nome, ativo, papeis, auth_user_id, pin_tentativas_falhas, pin_bloqueado_ate')
      .eq('codigo_funcionario', codigo)
      .maybeSingle();
    if (error) throw error;
    funcionario = data;
  } catch (erroBusca) {
    logger.erro(`Falha ao buscar funcionário pelo código de login`, erroBusca);
    return res.status(500).json({ ok: false, erro: 'Falha ao verificar credenciais.' });
  }

  // Mesma resposta pra "código não existe" e "PIN errado" — não dá pra um
  // atacante confirmar por tentativa e erro quais códigos são válidos.
  if (!funcionario || !funcionario.ativo || !funcionario.auth_user_id || !temPapelOperacional(funcionario)) {
    return respostaInvalida();
  }

  if (funcionario.pin_bloqueado_ate && new Date(funcionario.pin_bloqueado_ate) > new Date()) {
    return res.status(429).json({ ok: false, erro: 'Muitas tentativas incorretas. Tente novamente mais tarde.' });
  }

  let sessao;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailSintetico(codigo),
      password: pin,
    });
    if (error) throw error;
    sessao = data.session;
  } catch (erroLogin) {
    await registrarTentativaFalha(funcionario);
    return respostaInvalida();
  }

  await resetarTentativas(funcionario.id);

  return res.status(200).json({
    ok: true,
    sessao: { access_token: sessao.access_token, refresh_token: sessao.refresh_token },
    funcionario: { id: funcionario.id, nome: funcionario.nome, papeis: funcionario.papeis || [] },
  });
}

async function resetPin(req, res) {
  const { funcionarioId } = req.params;
  const pin = req.body?.pin;

  if (!REGEX_UUID.test(funcionarioId || '')) {
    return res.status(400).json({ ok: false, erro: 'funcionarioId inválido.' });
  }
  if (typeof pin !== 'string' || !REGEX_PIN.test(pin)) {
    return res.status(400).json({ ok: false, erro: 'pin deve ter exatamente 6 dígitos.' });
  }
  // req.operador já vem populado e validado (ativo) por verifyOperador —
  // aqui só falta exigir o papel admin (reset de PIN nunca é self-service).
  if (req.operador.papel !== 'admin') {
    return res.status(403).json({ ok: false, erro: 'Só administradores podem resetar o PIN de um separador.' });
  }

  let funcionario;
  try {
    const { data, error } = await supabase
      .from('funcionarios')
      .select('id, codigo_funcionario, auth_user_id')
      .eq('id', funcionarioId)
      .maybeSingle();
    if (error) throw error;
    funcionario = data;
  } catch (erroBusca) {
    logger.erro(`Falha ao buscar funcionário ${funcionarioId} para reset de PIN`, erroBusca);
    return res.status(500).json({ ok: false, erro: 'Falha ao buscar funcionário.' });
  }

  if (!funcionario) {
    return res.status(404).json({ ok: false, erro: 'Funcionário não encontrado.' });
  }
  if (!funcionario.codigo_funcionario) {
    return res.status(422).json({
      ok: false,
      erro: 'Funcionário sem código de login definido — defina um código de funcionário antes de gerar o PIN.',
    });
  }

  try {
    if (funcionario.auth_user_id) {
      // Já tem login: só troca a senha (o PIN).
      const { error } = await supabase.auth.admin.updateUserById(funcionario.auth_user_id, { password: pin });
      if (error) throw error;
    } else {
      // Primeiro login provisionado: cria o usuário no Supabase Auth com o
      // e-mail sintético (ou reaproveita um órfão de uma tentativa anterior
      // que falhou no meio do caminho, ver provisionarUsuarioAuth) e liga o
      // funcionário a ele.
      const authUserId = await provisionarUsuarioAuth(
        emailSintetico(funcionario.codigo_funcionario),
        pin,
        funcionarioId,
      );

      const { error: erroVinculo } = await supabase
        .from('funcionarios')
        .update({ auth_user_id: authUserId })
        .eq('id', funcionarioId);
      if (erroVinculo) throw erroVinculo;
    }

    await resetarTentativas(funcionarioId);
  } catch (erroReset) {
    logger.erro(`Falha ao definir PIN do funcionário ${funcionarioId} no Supabase Auth`, erroReset);
    return res.status(502).json({ ok: false, erro: 'Falha ao definir o novo PIN. Tente novamente.' });
  }

  return res.status(200).json({ ok: true });
}

module.exports = { login, resetPin };
