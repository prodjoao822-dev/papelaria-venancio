// Login de Operador por código+PIN — segunda forma de entrada no dashboard,
// ao lado do e-mail/senha (LoginPage.jsx). Mesmo espírito de
// separadorAuthController.js (mesmo arquivo é a referência de estilo/
// segurança usada aqui), com uma diferença estrutural importante:
// `operadores.id` JÁ É o `auth.uid()` diretamente (sem `auth_user_id`
// separado como em `funcionarios`) -- é assim que `eh_operador_ativo()` e
// toda RLS do projeto funcionam. Por isso aqui a ordem de criação é
// invertida: primeiro cria o usuário no Supabase Auth, DEPOIS insere a
// linha em `operadores` já com o id certo -- nunca o contrário.
//
// Nunca guardamos o PIN: ele vira a senha de um usuário Supabase Auth com
// e-mail sintético `operador-<codigo>@venancio.internal` -- prefixo
// diferente do de funcionários (`<codigo>@venancio.internal`) de propósito,
// pra um operador e um funcionário nunca colidirem mesmo escolhendo os
// mesmos 4 dígitos.

const supabase = require('../services/supabaseClient');
const logger = require('../utils/logger');

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGEX_PIN = /^\d{6}$/;
const REGEX_CODIGO = /^\d{4}$/;
const DOMINIO_SINTETICO = 'venancio.internal';
const MAX_TENTATIVAS_ANTES_DE_BLOQUEAR = 5;
const BLOQUEIO_MINUTOS = 15;

function emailSintetico(codigo) {
  return `operador-${codigo}@${DOMINIO_SINTETICO}`;
}

async function registrarTentativaFalha(operador) {
  const novasTentativas = (operador.pin_tentativas_falhas || 0) + 1;
  const atualizacao = { pin_tentativas_falhas: novasTentativas };

  if (novasTentativas >= MAX_TENTATIVAS_ANTES_DE_BLOQUEAR) {
    atualizacao.pin_tentativas_falhas = 0;
    atualizacao.pin_bloqueado_ate = new Date(Date.now() + BLOQUEIO_MINUTOS * 60 * 1000).toISOString();
  }

  try {
    await supabase.from('operadores').update(atualizacao).eq('id', operador.id);
  } catch (erro) {
    logger.erro(`Falha ao registrar tentativa de PIN incorreta (operador ${operador.id})`, erro);
  }
}

async function resetarTentativas(operadorId) {
  try {
    await supabase
      .from('operadores')
      .update({ pin_tentativas_falhas: 0, pin_bloqueado_ate: null })
      .eq('id', operadorId);
  } catch (erro) {
    logger.erro(`Falha ao resetar tentativas de PIN (operador ${operadorId})`, erro);
  }
}

async function loginComCodigo(req, res) {
  const codigo = typeof req.body?.codigo === 'string' ? req.body.codigo.trim() : '';
  const pin = req.body?.pin;

  if (!REGEX_CODIGO.test(codigo)) {
    return res.status(400).json({ ok: false, erro: 'codigo deve ter exatamente 4 dígitos.' });
  }
  if (typeof pin !== 'string' || !REGEX_PIN.test(pin)) {
    return res.status(400).json({ ok: false, erro: 'pin deve ter exatamente 6 dígitos.' });
  }

  const respostaInvalida = () => res.status(401).json({ ok: false, erro: 'Código ou PIN inválido.' });

  let operador;
  try {
    const { data, error } = await supabase
      .from('operadores')
      .select('id, nome, ativo, papel, pin_tentativas_falhas, pin_bloqueado_ate')
      .eq('codigo', codigo)
      .maybeSingle();
    if (error) throw error;
    operador = data;
  } catch (erroBusca) {
    logger.erro('Falha ao buscar operador pelo código de login', erroBusca);
    return res.status(500).json({ ok: false, erro: 'Falha ao verificar credenciais.' });
  }

  // Mesma resposta pra "código não existe" e "PIN errado" -- não dá pra um
  // atacante confirmar por tentativa e erro quais códigos são válidos.
  if (!operador || !operador.ativo) {
    return respostaInvalida();
  }

  if (operador.pin_bloqueado_ate && new Date(operador.pin_bloqueado_ate) > new Date()) {
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
    await registrarTentativaFalha(operador);
    return respostaInvalida();
  }

  await resetarTentativas(operador.id);

  return res.status(200).json({
    ok: true,
    sessao: { access_token: sessao.access_token, refresh_token: sessao.refresh_token },
    operador: { id: operador.id, nome: operador.nome, papel: operador.papel },
  });
}

// Cria um operador novo já com código+PIN definidos -- só admin. Ordem
// invertida em relação a funcionarios (ver cabeçalho do arquivo): cria o
// usuário no Auth PRIMEIRO, e só insere em `operadores` com o id que
// voltou -- nunca o contrário, porque aqui não existe `auth_user_id`
// desacoplado pra linkar depois.
async function criarComCodigo(req, res) {
  if (req.operador.papel !== 'admin') {
    return res.status(403).json({ ok: false, erro: 'Só administradores podem cadastrar novos operadores.' });
  }

  const nome = typeof req.body?.nome === 'string' ? req.body.nome.trim() : '';
  const codigo = typeof req.body?.codigo === 'string' ? req.body.codigo.trim() : '';
  const pin = req.body?.pin;
  const papel = req.body?.papel === 'admin' ? 'admin' : 'operador';

  if (!nome) {
    return res.status(400).json({ ok: false, erro: 'nome é obrigatório.' });
  }
  if (!REGEX_CODIGO.test(codigo)) {
    return res.status(400).json({ ok: false, erro: 'codigo deve ter exatamente 4 dígitos.' });
  }
  if (typeof pin !== 'string' || !REGEX_PIN.test(pin)) {
    return res.status(400).json({ ok: false, erro: 'pin deve ter exatamente 6 dígitos.' });
  }

  try {
    const { data: existente, error: erroExistente } = await supabase
      .from('operadores')
      .select('id')
      .eq('codigo', codigo)
      .maybeSingle();
    if (erroExistente) throw erroExistente;
    if (existente) {
      return res.status(409).json({ ok: false, erro: 'Já existe um operador com esse código.' });
    }
  } catch (erroCheck) {
    logger.erro('Falha ao checar unicidade de código de operador', erroCheck);
    return res.status(500).json({ ok: false, erro: 'Falha ao validar código.' });
  }

  let novoUsuarioId;
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: emailSintetico(codigo),
      password: pin,
      email_confirm: true,
    });
    if (error) throw error;
    novoUsuarioId = data.user.id;
  } catch (erroCriacao) {
    logger.erro(`Falha ao criar usuário Auth para novo operador (código ${codigo})`, erroCriacao);
    return res.status(502).json({ ok: false, erro: 'Falha ao criar credencial de login.' });
  }

  try {
    const { data: novoOperador, error: erroInsert } = await supabase
      .from('operadores')
      .insert({ id: novoUsuarioId, nome, codigo, papel, ativo: true })
      .select('id, nome, codigo, papel, ativo')
      .single();
    if (erroInsert) throw erroInsert;

    return res.status(201).json({ ok: true, operador: novoOperador });
  } catch (erroInsert) {
    // Insert em `operadores` falhou depois do usuário Auth já criado --
    // remove o usuário órfão em vez de deixar uma credencial sem operador
    // correspondente (ninguém conseguiria logar com ela mesmo assim, mas
    // ocuparia o e-mail sintético pra sempre).
    logger.erro(`Falha ao inserir operador ${novoUsuarioId} (código ${codigo}) -- removendo usuário Auth órfão`, erroInsert);
    try {
      await supabase.auth.admin.deleteUser(novoUsuarioId);
    } catch (erroLimpeza) {
      logger.erro(`Falha ao remover usuário Auth órfão ${novoUsuarioId} -- limpeza manual necessária`, erroLimpeza);
    }
    return res.status(500).json({ ok: false, erro: 'Falha ao cadastrar operador.' });
  }
}

// Reseta o PIN de um operador existente -- só admin, nunca self-service
// (mesma regra de resetPin de funcionário).
async function resetarPin(req, res) {
  const { operadorId } = req.params;
  const pin = req.body?.pin;

  if (!REGEX_UUID.test(operadorId || '')) {
    return res.status(400).json({ ok: false, erro: 'operadorId inválido.' });
  }
  if (typeof pin !== 'string' || !REGEX_PIN.test(pin)) {
    return res.status(400).json({ ok: false, erro: 'pin deve ter exatamente 6 dígitos.' });
  }
  if (req.operador.papel !== 'admin') {
    return res.status(403).json({ ok: false, erro: 'Só administradores podem resetar o PIN de um operador.' });
  }

  let operador;
  try {
    const { data, error } = await supabase
      .from('operadores')
      .select('id, codigo')
      .eq('id', operadorId)
      .maybeSingle();
    if (error) throw error;
    operador = data;
  } catch (erroBusca) {
    logger.erro(`Falha ao buscar operador ${operadorId} para reset de PIN`, erroBusca);
    return res.status(500).json({ ok: false, erro: 'Falha ao buscar operador.' });
  }

  if (!operador) {
    return res.status(404).json({ ok: false, erro: 'Operador não encontrado.' });
  }
  if (!operador.codigo) {
    return res.status(422).json({
      ok: false,
      erro: 'Operador sem código de login definido — este operador usa e-mail/senha, não código+PIN.',
    });
  }

  try {
    const { error } = await supabase.auth.admin.updateUserById(operador.id, { password: pin });
    if (error) throw error;
    await resetarTentativas(operador.id);
  } catch (erroReset) {
    logger.erro(`Falha ao definir PIN do operador ${operadorId} no Supabase Auth`, erroReset);
    return res.status(502).json({ ok: false, erro: 'Falha ao definir o novo PIN. Tente novamente.' });
  }

  return res.status(200).json({ ok: true });
}

module.exports = { loginComCodigo, criarComCodigo, resetarPin };
