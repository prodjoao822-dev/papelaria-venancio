import { traduzErroRpc } from '../traduzErroRpc'

describe('traduzErroRpc', () => {
  // Mensagens estáticas (match exato)
  it('traduz mensagem estática de atribuição', () => {
    expect(traduzErroRpc({ message: 'Esta solicitação não está atribuída a você' }))
      .toBe('Essa tarefa não é sua — confirme com quem te passou.')
  })

  it('traduz mensagem estática de entrega não atribuída', () => {
    expect(traduzErroRpc({ message: 'Esta entrega não está atribuída a você' }))
      .toBe('Essa entrega não é sua — confirme com quem te passou.')
  })

  it('traduz mensagem estática de mensagem vazia', () => {
    expect(traduzErroRpc({ message: 'Mensagem vazia' }))
      .toBe('Escreva algo antes de enviar.')
  })

  it('traduz mensagem estática de motivo de insucesso obrigatório', () => {
    expect(traduzErroRpc({ message: 'Motivo do insucesso é obrigatório' }))
      .toBe('Explique o motivo do insucesso antes de confirmar.')
  })

  it('aceita string crua além de objeto de erro', () => {
    expect(traduzErroRpc('Mensagem excede 2000 caracteres'))
      .toBe('Mensagem muito longa — reduza o texto e tente de novo.')
  })

  // Mensagens com placeholder (UUID/status/número)
  it('traduz "não encontrada" preservando o tipo de entidade (solicitação)', () => {
    expect(traduzErroRpc({ message: 'Solicitação 3fa85f64-5717-4562-b3fc-2c963f66afa6 não encontrada' }))
      .toBe('Essa solicitação não existe mais — atualize a tela e tente de novo.')
  })

  it('traduz "não encontrado" para pedido', () => {
    expect(traduzErroRpc({ message: 'Pedido 3fa85f64-5717-4562-b3fc-2c963f66afa6 não encontrado' }))
      .toBe('Esse pedido não existe mais — atualize a tela e tente de novo.')
  })

  it('traduz "não está pendente (status atual: ...)" sem expor o status técnico', () => {
    const traduzida = traduzErroRpc({
      message: 'Solicitação 3fa85f64-5717-4562-b3fc-2c963f66afa6 não está pendente (status atual: em_andamento)',
    })
    expect(traduzida).toBe('Essa solicitação já mudou de status — atualize a tela e tente de novo.')
    expect(traduzida).not.toMatch(/em_andamento/)
    expect(traduzida).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/)
  })

  it('traduz "Ainda há N item(ns) não separado(s)" preservando o número', () => {
    expect(traduzErroRpc({ message: 'Ainda há 3 item(ns) não separado(s)' }))
      .toBe('Ainda faltam 3 itens pra separar. Confirme todos antes de concluir.')
  })

  it('usa singular quando falta só 1 item', () => {
    expect(traduzErroRpc({ message: 'Ainda há 1 item(ns) não separado(s)' }))
      .toBe('Ainda falta 1 item pra separar. Confirme todos antes de concluir.')
  })

  it('traduz "Funcionário <uuid> não é um separador ativo"', () => {
    expect(traduzErroRpc({ message: 'Funcionário 3fa85f64-5717-4562-b3fc-2c963f66afa6 não é um separador ativo' }))
      .toBe('Você não está ativo como separador — fale com o operador.')
  })

  // Fallback genérico
  it('cai no fallback genérico para mensagem desconhecida', () => {
    expect(traduzErroRpc({ message: 'relation "foo" does not exist' }))
      .toBe('Não deu pra completar agora. Tenta de novo em instantes.')
  })

  it('cai no fallback genérico para erro sem mensagem (ex.: falha de rede)', () => {
    expect(traduzErroRpc({})).toBe('Não deu pra completar agora. Tenta de novo em instantes.')
    expect(traduzErroRpc(null)).toBe('Não deu pra completar agora. Tenta de novo em instantes.')
    expect(traduzErroRpc(undefined)).toBe('Não deu pra completar agora. Tenta de novo em instantes.')
  })

  it('nunca deixa passar um UUID cru no texto final, mesmo no fallback', () => {
    const traduzida = traduzErroRpc({ message: 'erro obscuro com id 3fa85f64-5717-4562-b3fc-2c963f66afa6 no meio' })
    expect(traduzida).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/)
  })
})
