// Tokens de cor do bundle de design (Papelaria Venâncio app design/Venancio App
// Mobile.dc.html, telas 01-13 · Separador). Fonte de verdade é o HTML — não
// invente hex novo aqui sem checar lá primeiro. Nomeados semanticamente para
// evitar cor mágica espalhada pelas telas.
export const colors = {
  // Marca / ação primária
  primary: '#1B5FAE',
  primaryDark: '#164C8C',
  primaryLight: '#EAF1FA', // fundo de badge/destaque azul-claro

  // Prioridade imediata (sempre amarelo, nunca outra cor)
  urgente: '#FFC72C',
  urgenteTexto: '#8A5B00',
  urgenteFundo: '#FFFDF5',

  // Sucesso / pronta
  sucesso: '#2AA35C',
  sucessoFundo: '#F3FBF6',
  sucessoFundoForte: '#E7F7EE',

  // Em andamento
  andamento: '#F2994A',
  andamentoFundo: '#FFF1E4',

  // Erro
  erro: '#E5484D',
  erroFundo: '#FDEEEE',
  erroBorda: '#F6C8C9',
  erroTexto: '#B23237',

  // Texto
  texto: '#1C2033',
  textoSecundario: '#5B6072',
  textoTerciario: '#8B91A3',
  textoDesabilitado: '#A6ABBB',

  // Superfícies e bordas
  fundo: '#F5F7FB',
  fundoInput: '#FAFBFD',
  superficie: '#FFFFFF',
  borda: '#E4E8F0',
  divisor: '#F0F2F7',
  botaoDesabilitadoFundo: '#F0F2F7',
  bordaCheckbox: '#C7CCDC', // borda do quadrado de item não marcado (tela 08/09)
};

export default colors;
