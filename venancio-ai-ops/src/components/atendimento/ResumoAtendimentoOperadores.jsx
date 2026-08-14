/**
 * "Quem está atendendo quem agora" — contagem de clientes ativos por operador.
 * Recebe `linhas`/`carregando` por prop (não chama useAtendimentoAtivo() aqui)
 * porque este componente sempre é renderizado dentro de uma página que já
 * chama o hook — duas instâncias do hook montadas ao mesmo tempo disputariam
 * o mesmo dado à toa (duas queries + duas subscriptions Realtime pra exibir
 * a mesma coisa).
 */
export function ResumoAtendimentoOperadores({ linhas, carregando }) {
  const porOperador = {}
  linhas.forEach((l) => {
    if (!l.operadores?.nome) return
    const chave = l.operador_id
    if (!porOperador[chave]) porOperador[chave] = { nome: l.operadores.nome, total: 0 }
    porOperador[chave].total += 1
  })
  const resumo = Object.values(porOperador).sort((a, b) => b.total - a.total)

  return (
    <div className="activity-feed" style={{ marginBottom: 16 }}>
      <div className="activity-feed-header">
        <span className="activity-feed-titulo">Atendimento Ativo</span>
        {!carregando && <div className="activity-feed-dot" title="Ao vivo" />}
      </div>

      <div className="activity-feed-lista">
        {carregando ? (
          <div className="activity-feed-vazio">Carregando…</div>
        ) : resumo.length === 0 ? (
          <div className="activity-feed-vazio">Nenhum atendimento assumido por um operador agora</div>
        ) : (
          resumo.map((op) => (
            <div key={op.nome} className="resumo-atend-linha">
              <span className="resumo-atend-nome">👤 {op.nome}</span>
              <span className="resumo-atend-total">{op.total} cliente{op.total > 1 ? 's' : ''}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
