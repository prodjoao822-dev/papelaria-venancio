export const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'Venâncio Operations'
export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '2.0.0'

export const N8N_WEBHOOK_BASE = import.meta.env.VITE_N8N_WEBHOOK_BASE ?? null
export const EVOLUTION_API_URL = import.meta.env.VITE_EVOLUTION_API_URL ?? null

export const PEDIDOS_POR_PAGINA = 50

export const FORMAS_ENTREGA = [
  { value: 'retirada',       label: 'Retirada na loja' },
  { value: 'entrega_propria', label: 'Entrega própria' },
  { value: 'uber_flash',     label: 'Uber Flash / Motoboy' },
]

// clientes.origem só aceita estes dois valores (chatbot/papelaria-bot/supabase/squemanovo.sql)
export const ORIGENS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'manual',   label: 'Manual' },
]

// Enum real status_orcamento (chatbot/papelaria-bot/supabase/squemanovo.sql).
// "Convertido" deixou de ser um status — vira o pedido vinculado (orcamento.pedidos[0]).
export const STATUS_ORCAMENTO = {
  RASCUNHO: 'rascunho',
  ENVIADO:  'enviado',
  ACEITO:   'aceito',
  RECUSADO: 'recusado',
  EXPIRADO: 'expirado',
}

export const STATUS_ORCAMENTO_CONFIG = {
  rascunho: { label: 'Rascunho', cor: '#64748B', bg: 'rgba(100,116,139,0.10)', borda: 'rgba(100,116,139,0.25)', icone: '📝' },
  enviado:  { label: 'Enviado',  cor: '#3B82F6', bg: 'rgba(59,130,246,0.10)',  borda: 'rgba(59,130,246,0.25)',  icone: '📤' },
  aceito:   { label: 'Aceito',  cor: '#10B981', bg: 'rgba(16,185,129,0.10)',  borda: 'rgba(16,185,129,0.25)',  icone: '✅' },
  recusado: { label: 'Recusado', cor: '#EF4444', bg: 'rgba(239,68,68,0.10)',   borda: 'rgba(239,68,68,0.25)',   icone: '❌' },
  expirado: { label: 'Expirado', cor: '#6B7280', bg: 'rgba(107,114,128,0.10)', borda: 'rgba(107,114,128,0.20)', icone: '⌛' },
}

export const TIPOS_LOG = {
  PEDIDO_CRIADO:         'PEDIDO_CRIADO',
  PEDIDO_STATUS:         'PEDIDO_STATUS',
  PEDIDO_CANCELADO:      'PEDIDO_CANCELADO',
  ORCAMENTO_CRIADO:      'ORCAMENTO_CRIADO',
  ORCAMENTO_ENVIADO:     'ORCAMENTO_ENVIADO',
  ORCAMENTO_CONVERTIDO:  'ORCAMENTO_CONVERTIDO',
  ORCAMENTO_RECUSADO:    'ORCAMENTO_RECUSADO',
  CLIENTE_CRIADO:        'CLIENTE_CRIADO',
  CLIENTE_ATUALIZADO:    'CLIENTE_ATUALIZADO',
  IA_RESPOSTA:           'IA_RESPOSTA',
  IA_PEDIDO:             'IA_PEDIDO',
  IA_ORCAMENTO:          'IA_ORCAMENTO',
  N8N_TRIGGER:           'N8N_TRIGGER',
  N8N_ERRO:              'N8N_ERRO',
}

export const N8N_WEBHOOKS = {
  NOVO_PEDIDO:           '/novo-pedido',
  STATUS_ATUALIZADO:     '/status-atualizado',
  ORCAMENTO_CRIADO:      '/orcamento-criado',
  ORCAMENTO_APROVADO:    '/orcamento-aprovado',
  ORCAMENTO_RECUSADO:    '/orcamento-recusado',
  ORCAMENTO_CONVERTIDO:  '/orcamento-convertido',
  LEAD_RECUPERACAO:      '/recuperacao-lead',
  FOLLOWUP_ORCAMENTO:    '/followup-orcamento',
  NOTIFICACAO_CLIENTE:   '/notificacao-cliente',
  IA_PAUSA:              '/ia-pausada',
  OPERADOR_ASSUMIU:      '/operador-assumiu',
  CONSULTA_PRODUTO:      '/consulta-produto',
}

// ── CENTRAL DE ATENDIMENTO ────────────────────────────────────────────────────

export const STATUS_ATENDIMENTO = {
  NOVO_LEAD:              'novo_lead',
  AGUARDANDO_OPERADOR:    'aguardando_operador',
  AGUARDANDO_CLIENTE:     'aguardando_cliente',
  AGUARDANDO_CONFIRMACAO: 'aguardando_confirmacao',
  SEPARANDO:              'separando',
  AGUARDANDO_PAGAMENTO:   'aguardando_pagamento',
  FINALIZADO:             'finalizado',
  CANCELADO:              'cancelado',
}

export const STATUS_ATENDIMENTO_CONFIG = {
  novo_lead:              { label: 'Novo Lead',             cor: '#60A5FA', bg: 'rgba(59,130,246,0.12)',   icone: '🆕' },
  aguardando_operador:    { label: 'Aguard. Operador',      cor: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  icone: '👤' },
  aguardando_cliente:     { label: 'Aguard. Cliente',       cor: '#8B9BB8', bg: 'rgba(139,155,184,0.12)', icone: '⏳' },
  aguardando_confirmacao: { label: 'Aguard. Confirmação',   cor: '#FCD34D', bg: 'rgba(252,211,77,0.12)',  icone: '✓'  },
  separando:              { label: 'Separando',             cor: '#FB923C', bg: 'rgba(234,88,12,0.12)',   icone: '📦' },
  aguardando_pagamento:   { label: 'Aguard. Pagamento',     cor: '#A78BFA', bg: 'rgba(124,58,237,0.12)',  icone: '💳' },
  finalizado:             { label: 'Finalizado',            cor: '#10B981', bg: 'rgba(16,185,129,0.10)',  icone: '✅' },
  cancelado:              { label: 'Cancelado',             cor: '#EF4444', bg: 'rgba(239,68,68,0.10)',   icone: '❌' },
  // legado
  ativa:                  { label: 'Ativa',                 cor: '#10B981', bg: 'rgba(16,185,129,0.10)',  icone: '●'  },
  pausada:                { label: 'Pausada',               cor: '#F59E0B', bg: 'rgba(245,158,11,0.10)',  icone: '⏸'  },
  encerrada:              { label: 'Encerrada',             cor: '#6B7280', bg: 'rgba(107,114,128,0.10)', icone: '✕'  },
}

export const PRIORIDADE_CONFIG = {
  critica: { label: 'Crítica', cor: '#EF4444', bg: 'rgba(239,68,68,0.15)',   borda: 'rgba(239,68,68,0.35)',   icone: '🔴', score: 100 },
  alta:    { label: 'Alta',    cor: '#F59E0B', bg: 'rgba(245,158,11,0.15)',  borda: 'rgba(245,158,11,0.35)',  icone: '🟡', score: 75  },
  normal:  { label: 'Normal',  cor: '#3B82F6', bg: 'rgba(59,130,246,0.15)',  borda: 'rgba(59,130,246,0.30)',  icone: '🔵', score: 50  },
  baixa:   { label: 'Baixa',   cor: '#6B7280', bg: 'rgba(107,114,128,0.12)', borda: 'rgba(107,114,128,0.25)', icone: '⚪', score: 25  },
}

export const INTENCOES_CONFIG = {
  orcamento:     { label: 'Orçamento',     icone: '📋', prioridade: 'alta'    },
  pedido:        { label: 'Pedido',        icone: '📦', prioridade: 'alta'    },
  lista_escolar: { label: 'Lista Escolar', icone: '📚', prioridade: 'alta'    },
  empresa:       { label: 'Empresa',       icone: '🏢', prioridade: 'critica' },
  atacado:       { label: 'Atacado',       icone: '📊', prioridade: 'critica' },
  duvida:        { label: 'Dúvida',        icone: '❓', prioridade: 'baixa'   },
  entrega:       { label: 'Entrega',       icone: '🛵', prioridade: 'normal'  },
  outro:         { label: 'Outro',         icone: '💬', prioridade: 'normal'  },
}

// ── SPRINT 1: CONSULTAS OPERACIONAIS ─────────────────────────────────────────

export const QUERY_TYPES = {
  ESTOQUE:        'estoque',
  PRECO:          'preco',
  DISPONIBILIDADE:'disponibilidade',
  PRAZO:          'prazo',
  OUTRO:          'outro',
}

export const QUERY_TYPE_CONFIG = {
  estoque:         { label: 'Estoque',         icone: '📦', cor: '#3B82F6' },
  preco:           { label: 'Preço',           icone: '💰', cor: '#10B981' },
  disponibilidade: { label: 'Disponibilidade', icone: '✅', cor: '#F59E0B' },
  prazo:           { label: 'Prazo',           icone: '📅', cor: '#8B5CF6' },
  outro:           { label: 'Outro',           icone: '❓', cor: '#64748B' },
}

export const QUERY_STATUS = {
  PENDING:  'pending',
  ASSIGNED: 'assigned',
  ANSWERED: 'answered',
  EXPIRED:  'expired',
}

export const QUERY_STATUS_CONFIG = {
  pending:  { label: 'Pendente',   cor: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  icone: '⏳' },
  assigned: { label: 'Atribuída',  cor: '#3B82F6', bg: 'rgba(59,130,246,0.12)',  icone: '👤' },
  answered: { label: 'Respondida', cor: '#10B981', bg: 'rgba(16,185,129,0.10)',  icone: '✅' },
  expired:  { label: 'Expirada',   cor: '#EF4444', bg: 'rgba(239,68,68,0.10)',   icone: '⌛' },
}

// Timeout padrão por prioridade (em minutos)
export const QUERY_TIMEOUT_MINUTOS = {
  critica: 10,
  alta:    20,
  normal:  30,
  baixa:   60,
}

// ── SPRINT 1: EVENT LOG ───────────────────────────────────────────────────────

// Tipos de evento gravados automaticamente por trigger em `eventos`
// (ver chatbot/papelaria-bot/supabase/extensao_dashboard.sql, seção L).
export const EVENT_TYPES = {
  PEDIDO_STATUS_ALTERADO:            'pedido_status_alterado',
  ORCAMENTO_STATUS_ALTERADO:         'orcamento_status_alterado',
  CONSULTA_OPERACIONAL_CRIADA:       'consulta_operacional_criada',
  CONSULTA_OPERACIONAL_STATUS:       'consulta_operacional_status_alterado',
}

export const EVENT_TYPE_CONFIG = {
  pedido_status_alterado:              { label: 'Status do pedido',        icone: '🔄', cor: '#8B5CF6' },
  orcamento_status_alterado:           { label: 'Status do orçamento',     icone: '📋', cor: '#3B82F6' },
  consulta_operacional_criada:         { label: 'Consulta operacional',   icone: '🔔', cor: '#F59E0B' },
  consulta_operacional_status_alterado:{ label: 'Consulta respondida',    icone: '✅', cor: '#10B981' },
}

export const ACTOR_TYPE_CONFIG = {
  operador: { label: 'Operador', icone: '👤' },
  bot:      { label: 'Bot',      icone: '🤖' },
  cliente:  { label: 'Cliente',  icone: '🙋' },
  sistema:  { label: 'Sistema',  icone: '⚙️'  },
  n8n:      { label: 'n8n',      icone: '⚡'  },
}

// ── SPRINT 2: PRODUCT CONSULTANT ENGINE ──────────────────────────────────────

export const CONFIDENCE_NIVEL = {
  ALTA:  'alta',
  MEDIA: 'media',
  BAIXA: 'baixa',
}

export const CONFIDENCE_CONFIG = {
  alta:  { label: 'Alta Confiança',   cor: '#10B981', bg: 'rgba(16,185,129,0.12)',  borda: 'rgba(16,185,129,0.3)',  icone: '🟢', score: 75 },
  media: { label: 'Média Confiança',  cor: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  borda: 'rgba(245,158,11,0.3)',  icone: '🟡', score: 45 },
  baixa: { label: 'Baixa Confiança',  cor: '#EF4444', bg: 'rgba(239,68,68,0.12)',   borda: 'rgba(239,68,68,0.3)',   icone: '🔴', score: 0  },
}

export const DISPONIBILIDADE_CONFIG = {
  disponivel:    { label: 'Disponível',     cor: '#10B981', bg: 'rgba(16,185,129,0.10)',  icone: '✅' },
  indisponivel:  { label: 'Indisponível',   cor: '#EF4444', bg: 'rgba(239,68,68,0.10)',   icone: '❌' },
  sob_consulta:  { label: 'Sob Consulta',   cor: '#F59E0B', bg: 'rgba(245,158,11,0.10)',  icone: '❓' },
  desconhecido:  { label: 'Desconhecido',   cor: '#64748B', bg: 'rgba(100,116,139,0.10)', icone: '—'  },
}

export const RELATIONSHIP_TYPES = {
  SIMILAR:      'similar',
  SUBSTITUTO:   'substituto',
  ALTERNATIVA:  'alternativa',
  COMPLEMENTO:  'complemento',
}

export const RELATIONSHIP_TYPE_CONFIG = {
  similar:     { label: 'Similar',      icone: '≈', cor: '#3B82F6' },
  substituto:  { label: 'Substituto',   icone: '↔', cor: '#8B5CF6' },
  alternativa: { label: 'Alternativa',  icone: '↗', cor: '#F59E0B' },
  complemento: { label: 'Complemento',  icone: '+', cor: '#10B981' },
}

// ── SPRINT 2: DEMAND INTELLIGENCE ────────────────────────────────────────────

export const DEMAND_RESULTADO = {
  RESPONDIDO_IA:       'respondido_ia',
  CONSULTOU_OPERADOR:  'consultou_operador',
  NAO_ENCONTRADO:      'nao_encontrado',
  SEM_ESTOQUE:         'sem_estoque',
}

export const DEMAND_RESULTADO_CONFIG = {
  respondido_ia:      { label: 'Respondido por IA',      icone: '🤖', cor: '#10B981' },
  consultou_operador: { label: 'Consultou Operador',      icone: '👤', cor: '#3B82F6' },
  nao_encontrado:     { label: 'Produto não encontrado',  icone: '❓', cor: '#F59E0B' },
  sem_estoque:        { label: 'Sem estoque',             icone: '📦', cor: '#EF4444' },
}

export const DEMAND_ALERT_STATUS = {
  NOVO:      'novo',
  VISTO:     'visto',
  RESOLVIDO: 'resolvido',
}

export const DEMAND_ALERT_STATUS_CONFIG = {
  novo:      { label: 'Novo',      cor: '#EF4444', bg: 'rgba(239,68,68,0.12)',   icone: '🔴' },
  visto:     { label: 'Visto',     cor: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  icone: '👁' },
  resolvido: { label: 'Resolvido', cor: '#10B981', bg: 'rgba(16,185,129,0.10)',  icone: '✅' },
}

// Webhook adicional para aprendizado de produto
export const N8N_WEBHOOKS_SPRINT2 = {
  PRODUTO_APRENDIDO:    '/produto-aprendido',
  ALERTA_DEMANDA:       '/alerta-demanda',
  TIMEOUT_CONSULTAS:    '/expirar-consultas',
  VERIFICAR_ALERTAS:    '/verificar-alertas-demanda',
}

// ── SPRINT 3: AUTOMATION WORKFLOWS ────────────────────────────────────────────
// URLs de webhook dos workflows n8n (caminhos relativos ao N8N_WEBHOOK_BASE)

export const N8N_WEBHOOKS_SPRINT3 = {
  ENTRADA_WHATSAPP:     '/venancio-entrada-whatsapp',
  PRODUCT_CONSULTANT:   '/venancio-product-consultant',
  QUERY_ENGINE:         '/venancio-query-engine',
  ORDER_TRACKING:       '/venancio-order-tracking',
}

// Statuses de pedido que disparam notificação WhatsApp automática
export const PEDIDO_STATUS_NOTIFICAVEIS = [
  'NOVO_PEDIDO',
  'AGUARDANDO_CONFIRMACAO',
  'EM_SEPARACAO',
  'SEPARADO',
  'PRONTO_RETIRADA',
  'SAIU_ENTREGA',
  'FINALIZADO',
  'CANCELADO',
]

// Novos tipos de event_log para Sprint 3
export const EVENT_TYPES_SPRINT3 = {
  NOTIFICACAO_ENVIADA: 'notificacao.enviada',
  IA_RESPOSTA_PRODUTO: 'ia.resposta_produto',
  IA_ESCALOU_OPERADOR: 'ia.escalou_operador',
}

export const EVENT_TYPE_CONFIG_SPRINT3 = {
  'notificacao.enviada':  { label: 'Notificação enviada', icone: '📱', cor: '#10B981' },
  'ia.resposta_produto':  { label: 'IA respondeu produto', icone: '🤖', cor: '#8B5CF6' },
  'ia.escalou_operador':  { label: 'IA consultou operador', icone: '🔔', cor: '#F59E0B' },
}
