// src/mocks/db.js
// Dados estáticos que imitam o contrato do Supabase (extensao_separacao_delegada.sql)

export const funcionarios = [
  { id: 'f1', codigo_funcionario: '0231', nome: 'Diego Separador', ativo: true, papeis: ['separacao'] },
  { id: 'f2', codigo_funcionario: '0450', nome: 'Ana Operadora', ativo: true, papeis: ['operador'] }
];

// O estado global simulado
export const mockDb = {
  solicitacoes_separacao: [
    {
      id: 's1',
      pedido_id: 'p1',
      operador_delegante_id: 'op1',
      separador_id: 'f1',
      prioridade: 'imediata',
      horario_retirada: null,
      status: 'pendente',
      tipo: 'delegada',
      observacao: null,
      criado_em: new Date().toISOString()
    },
    {
      id: 's2',
      pedido_id: 'p2',
      operador_delegante_id: 'op1',
      separador_id: 'f1',
      prioridade: 'agendada',
      horario_retirada: new Date(new Date().setHours(16, 0, 0, 0)).toISOString(),
      status: 'pendente',
      tipo: 'delegada',
      observacao: null,
      criado_em: new Date().toISOString()
    },
    {
      id: 's3',
      pedido_id: 'p3',
      operador_delegante_id: 'op1',
      separador_id: 'f1',
      prioridade: 'imediata',
      horario_retirada: null,
      status: 'em_andamento',
      tipo: 'delegada',
      observacao: null,
      criado_em: new Date().toISOString()
    }
  ],

  solicitacoes_separacao_itens: [
    { id: 'si1', solicitacao_id: 's1', item_pedido_id: 'ip1', separado: false },
    { id: 'si2', solicitacao_id: 's1', item_pedido_id: 'ip2', separado: false },
    { id: 'si3', solicitacao_id: 's2', item_pedido_id: 'ip3', separado: false },
    { id: 'si4', solicitacao_id: 's3', item_pedido_id: 'ip4', separado: true },
    { id: 'si5', solicitacao_id: 's3', item_pedido_id: 'ip5', separado: false },
  ],

  pedidos_mock: {
    'p1': { protocolo: 'SC-10497', cliente_nome: 'João Silva', itens_detalhes: { 'ip1': { nome: 'Caderno 10 matérias', quantidade: 2 }, 'ip2': { nome: 'Caneta Azul', quantidade: 5 } } },
    'p2': { protocolo: 'SC-10498', cliente_nome: 'Beatriz Menezes', itens_detalhes: { 'ip3': { nome: 'Mochila Escolar', quantidade: 1 } } },
    'p3': { protocolo: 'SC-10499', cliente_nome: 'Carlos Ferreira', itens_detalhes: { 'ip4': { nome: 'Borracha', quantidade: 3 }, 'ip5': { nome: 'Lápis de cor', quantidade: 1 } } }
  },

  solicitacoes_separacao_mensagens: [
    { id: 'm1', solicitacao_id: 's3', autor_tipo: 'operador', texto: 'Atenção, cliente aguardando na loja.', criado_em: new Date(Date.now() - 600000).toISOString() },
    { id: 'm2', solicitacao_id: 's3', autor_tipo: 'separador', texto: 'Entendido, já estou com o pedido em mãos.', criado_em: new Date(Date.now() - 300000).toISOString() }
  ],

  notificacoes_internas: [
    { id: 'n1', tipo: 'solicitacao_delegada', titulo: 'Nova separação delegada a você', corpo: 'Pedido SC-10497 — prioridade imediata', lida: false, criado_em: new Date().toISOString() },
    { id: 'n2', tipo: 'nova_mensagem', titulo: 'Nova mensagem', corpo: 'Atenção, cliente aguardando na loja.', lida: true, criado_em: new Date(Date.now() - 600000).toISOString() }
  ]
};
