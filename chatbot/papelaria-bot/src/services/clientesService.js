// Operações de leitura e escrita na tabela "clientes" do Supabase.

const supabase = require('./supabaseClient');
const logger = require('../utils/logger');

// `clientes.empresa_id` é NOT NULL e a unicidade de telefone agora é por
// empresa (ver squemanovo.sql, seção D) — mas o projeto continua single-tenant
// hoje (só a Venâncio existe em `empresa`), então basta buscar essa única
// linha uma vez e cachear em memória do processo pelo resto da execução.
let empresaIdCache = null;

async function obterEmpresaId() {
  if (empresaIdCache) return empresaIdCache;

  const { data, error } = await supabase.from('empresa').select('id').limit(1).single();

  if (error) {
    logger.erro('Falha ao buscar o id da empresa', error);
    throw new Error(`Não foi possível buscar o id da empresa: ${error.message}`);
  }

  empresaIdCache = data.id;
  return empresaIdCache;
}

// Cria o cliente na primeira mensagem ou atualiza o nome/atualizado_em nas seguintes.
// O telefone (dentro da empresa) é a chave de identificação (conflito é resolvido por ele).
async function upsertCliente(telefone, nome) {
  const empresaId = await obterEmpresaId();

  const { data, error } = await supabase
    .from('clientes')
    .upsert(
      { telefone, nome, empresa_id: empresaId, atualizado_em: new Date().toISOString() },
      { onConflict: 'empresa_id,telefone' }
    )
    .select()
    .single();

  if (error) {
    logger.erro(`Falha ao fazer upsert do cliente ${telefone}`, error);
    throw new Error(`Não foi possível salvar o cliente ${telefone}: ${error.message}`);
  }

  return data;
}

async function buscarClientePorTelefone(telefone) {
  const empresaId = await obterEmpresaId();

  const { data, error } = await supabase
    .from('clientes')
    .select()
    .eq('empresa_id', empresaId)
    .eq('telefone', telefone)
    .maybeSingle();

  if (error) {
    logger.erro(`Falha ao buscar cliente ${telefone}`, error);
    throw new Error(`Não foi possível buscar o cliente ${telefone}: ${error.message}`);
  }

  return data;
}

// Grava os dados coletados pelo fluxo de cadastro fiscal (ver
// src/botEngine/states/cadastroFiscal.js). `campos` já vem com as chaves no
// formato das colunas de `clientes` (tipo_pessoa, cpf, cnpj, razao_social,
// nome_fantasia, indicador_ie, inscricao_estadual, cep, endereco, cidade,
// estado, telefone_contato, tem_cadastro_previo, nome) — só os campos
// coletados naquele fluxo específico são enviados, nunca o objeto inteiro.
async function atualizarCadastroFiscal(clienteId, campos) {
  const { error } = await supabase
    .from('clientes')
    .update({ ...campos, atualizado_em: new Date().toISOString() })
    .eq('id', clienteId);

  if (error) {
    logger.erro(`Falha ao atualizar cadastro fiscal do cliente ${clienteId}`, error);
    throw new Error(`Não foi possível atualizar o cadastro fiscal do cliente ${clienteId}: ${error.message}`);
  }
}

// Checagem silenciosa (Passo 0 do fluxo de cadastro fiscal): true quando o
// cliente já tem identidade fiscal suficiente pra pular o formulário.
async function clienteTemCadastroCompleto(clienteId) {
  const { data, error } = await supabase.rpc('cliente_tem_cadastro_completo', { p_cliente_id: clienteId });

  if (error) {
    logger.erro(`Falha ao checar cadastro fiscal do cliente ${clienteId}`, error);
    throw new Error(`Não foi possível checar o cadastro fiscal do cliente ${clienteId}: ${error.message}`);
  }

  return Boolean(data);
}

module.exports = {
  upsertCliente,
  buscarClientePorTelefone,
  atualizarCadastroFiscal,
  clienteTemCadastroCompleto,
};
