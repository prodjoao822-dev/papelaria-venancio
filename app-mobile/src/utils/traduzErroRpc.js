// Camada fina de tradução de erros de RPC (Postgres/PostgREST) para
// português de balcão — nenhuma tela do app deve mostrar o texto cru de uma
// exceção do banco (`raise exception`), que vem sem formatação, às vezes
// com UUID/status técnico no meio (ex.: "Solicitação <uuid> não está
// pendente (status atual: em_andamento)").
//
// Não muda nenhuma RPC nem mensagem no banco — só traduz no cliente. A
// lista de mensagens conhecidas foi extraída ao vivo do banco de produção
// em 26/08/2026 (ver histórico da tarefa T3.4). Cobre tanto RPCs que o
// app-mobile chama hoje (assumir_separacao, assumir_entrega,
// marcar_item_separado_solicitacao, concluir_separacao, concluir_entrega,
// cancelar_separacao, enviar_mensagem_separacao, iniciar_rota,
// registrar_insucesso_entrega, marcar_notificacao_lida,
// registrar_push_token) quanto algumas mensagens de RPCs que hoje só o
// dashboard web/n8n chamam (delegar_separacao, delegar_entrega,
// aceitar_orcamento) — mantidas aqui por segurança/forward-compat: são
// baratas de listar e não têm custo nenhum ficarem "mortas" se o app nunca
// as disparar.
//
// Fora de escopo deliberado: `aceitar_orcamento` ("Entrega própria só
// disponível a partir de R$100...") é chamada só pelo n8n/dashboard — nenhum
// service do app-mobile invoca essa RPC, então essa mensagem específica não
// foi incluída (ver relatório da tarefa).

// Mensagens estáticas — match exato (após trim) com o texto de `error.message`.
const MENSAGENS_ESTATICAS = {
  'Esta solicitação não está atribuída a você':
    'Essa tarefa não é sua — confirme com quem te passou.',
  'Esta entrega não está atribuída a você':
    'Essa entrega não é sua — confirme com quem te passou.',
  'Você não tem permissão para cancelar esta solicitação':
    'Você não pode cancelar essa solicitação — fale com o operador.',
  'Só solicitações delegadas passam por "assumir" — a Separação Rápida já inicia em andamento':
    'Essa separação já começou automaticamente — não precisa assumir.',
  'Você precisa assumir a entrega (assumir_entrega) antes de iniciar a rota':
    'Assuma a entrega antes de iniciar a rota.',
  'Mensagem vazia':
    'Escreva algo antes de enviar.',
  'Mensagem excede 2000 caracteres':
    'Mensagem muito longa — reduza o texto e tente de novo.',
  'Chat não é aplicável à Separação Rápida (autoatribuída)':
    'Essa separação não tem chat — ela foi autoatribuída.',
  'Você não participa desta solicitação':
    'Você não faz parte dessa conversa.',
  'Você não pode marcar esta notificação como lida':
    'Essa notificação não é sua.',
  'Motivo do insucesso é obrigatório':
    'Explique o motivo do insucesso antes de confirmar.',
  'Apenas operadores ativos podem delegar entrega':
    'Só operadores ativos podem delegar entregas.',
  'Apenas operadores ativos podem delegar separação':
    'Só operadores ativos podem delegar separações.',
  'horario_retirada é obrigatório quando a prioridade é agendada':
    'Informe o horário de retirada para agendar.',
  'Apenas um funcionário autenticado pode registrar token de push':
    'Não foi possível confirmar seu login para ativar notificações.',
  'expo_push_token não pode ser vazio':
    'Não foi possível ativar as notificações neste aparelho.',
}

// Rótulo em português por tipo de entidade, usado nas mensagens
// "<entidade> <uuid> não encontrad[oa]".
const ROTULO_ENTIDADE = {
  'Solicitação': 'Essa solicitação',
  'Solicitação de entrega': 'Essa entrega',
  'Item de solicitação': 'Esse item',
  'Notificação': 'Essa notificação',
  'Pedido': 'Esse pedido',
}

const UUID = '[0-9a-fA-F-]{8,}'

// Mensagens com placeholder (UUID, status, número, valor) — match por
// regex, na ordem declarada (primeira que casar vence). `traduzir` recebe o
// resultado de `String.match` e devolve o texto final.
const REGRAS_REGEX = [
  {
    // "Solicitação <uuid> não encontrada" / "Solicitação de entrega <uuid>
    // não encontrada" / "Item de solicitação <uuid> não encontrado" /
    // "Notificação <uuid> não encontrada" / "Pedido <uuid> não encontrado"
    padrao: new RegExp(
      `^(Solicitação(?: de entrega)?|Item de solicitação|Notificação|Pedido) ${UUID} não encontrad[oa]$`
    ),
    traduzir: (m) => {
      const rotulo = ROTULO_ENTIDADE[m[1]] ?? 'Isso'
      return `${rotulo} não existe mais — atualize a tela e tente de novo.`
    },
  },
  {
    padrao: new RegExp(`^Solicitação ${UUID} não está pendente \\(status atual: [a-z_]+\\)$`),
    traduzir: () => 'Essa solicitação já mudou de status — atualize a tela e tente de novo.',
  },
  {
    padrao: new RegExp(`^Solicitação ${UUID} já foi assumida$`),
    traduzir: () => 'Essa solicitação já foi assumida por outra pessoa — atualize a tela.',
  },
  {
    padrao: new RegExp(`^Solicitação ${UUID} não pode ser cancelada \\(status atual: [a-z_]+\\)$`),
    traduzir: () => 'Essa solicitação não pode mais ser cancelada nesse status — atualize a tela.',
  },
  {
    padrao: new RegExp(`^Solicitação ${UUID} não está em andamento \\(status atual: [a-z_]+\\)$`),
    traduzir: () => 'Essa solicitação não está em andamento — atualize a tela e tente de novo.',
  },
  {
    padrao: new RegExp(`^Solicitação ${UUID} não está em rota \\(status atual: [a-z_]+\\)$`),
    traduzir: () => 'Essa entrega não está em rota — atualize a tela e tente de novo.',
  },
  {
    // "Ainda há 3 item(ns) não separado(s)" — preserva o número extraído.
    padrao: /^Ainda há (\d+) item\(ns\) não separado\(s\)$/,
    traduzir: (m) => {
      const n = Number(m[1])
      const item = n === 1 ? 'item' : 'itens'
      const falta = n === 1 ? 'falta' : 'faltam'
      return `Ainda ${falta} ${n} ${item} pra separar. Confirme todos antes de concluir.`
    },
  },
  {
    padrao: new RegExp(`^Funcionário ${UUID} não é um entregador ativo$`),
    traduzir: () => 'Você não está ativo como entregador — fale com o operador.',
  },
  {
    padrao: new RegExp(`^Funcionário ${UUID} não é um separador ativo$`),
    traduzir: () => 'Você não está ativo como separador — fale com o operador.',
  },
  {
    padrao: new RegExp(`^Pedido ${UUID} já tem uma solicitação de entrega ativa$`),
    traduzir: () => 'Esse pedido já tem uma entrega em andamento.',
  },
  {
    padrao: new RegExp(`^Pedido ${UUID} não tem itens para separar$`),
    traduzir: () => 'Esse pedido não tem itens para separar.',
  },
  {
    padrao: /^Só é possível delegar entrega para pedidos com forma_entrega = entrega_propria/,
    traduzir: () => 'Esse pedido não é de entrega própria — não é possível delegar.',
  },
  {
    padrao: /^plataforma inválida:/,
    traduzir: () => 'Não foi possível identificar o tipo de aparelho.',
  },
  {
    padrao: /^prioridade inválida:/,
    traduzir: () => 'Prioridade inválida — avise o suporte.',
  },
]

// Nunca deixe passar texto cru do Postgres/rede — qualquer coisa fora da
// lista conhecida cai aqui, sem jargão técnico e sem repetir o erro original.
const FALLBACK_GENERICO = 'Não deu pra completar agora. Tenta de novo em instantes.'

/**
 * Traduz o erro de uma chamada de RPC/PostgREST para uma mensagem curta em
 * português de balcão, pronta pra mostrar na tela (Alert, banner, etc.).
 * Aceita tanto um objeto Error/PostgrestError (usa `.message`) quanto uma
 * string já extraída.
 */
export function traduzErroRpc(erro) {
  const bruta = typeof erro === 'string' ? erro : erro?.message
  if (!bruta || typeof bruta !== 'string') return FALLBACK_GENERICO

  const texto = bruta.trim()
  if (MENSAGENS_ESTATICAS[texto]) return MENSAGENS_ESTATICAS[texto]

  for (const regra of REGRAS_REGEX) {
    const match = texto.match(regra.padrao)
    if (match) return regra.traduzir(match)
  }

  return FALLBACK_GENERICO
}
