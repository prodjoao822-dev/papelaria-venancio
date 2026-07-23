// Instancia e exporta o cliente do Supabase usado pelos demais serviços.
// Fica isolado num único arquivo para que exista uma única conexão configurada
// em todo o app (os services importam este módulo em vez de criar clientes próprios).

const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

module.exports = supabase;
