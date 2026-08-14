// Login do Separador (código de funcionário + PIN de 6 dígitos) e reset de
// PIN por um Operador administrativo. Ver decisão de arquitetura no
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

function emailSintetico(codigoFuncionario) {
  return `${codigoFuncionario}@${DOMINIO_SINTETICO}`;
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
  if (!funcionario || !funcionario.ativo || !funcionario.auth_user_id || !(funcionario.papeis || []).includes('separacao')) {
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
    funcionario: { id: funcionario.id, nome: funcionario.nome },
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
      // e-mail sintético e liga o funcionário a ele.
      const { data, error } = await supabase.auth.admin.createUser({
        email: emailSintetico(funcionario.codigo_funcionario),
        password: pin,
        email_confirm: true,
      });
      if (error) throw error;

      const { error: erroVinculo } = await supabase
        .from('funcionarios')
        .update({ auth_user_id: data.user.id })
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
