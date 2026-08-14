/** Etiqueta "atendido por X" — mesma ideia das labels do WhatsApp Business,
 * mostrada em qualquer tela que liste clientes/pedidos (não só Atendimento). */
export function EtiquetaAtendimento({ nome }) {
  if (!nome) return null
  return (
    <span className="etiqueta-atendimento" title={`Sendo atendido por ${nome}`}>
      👤 {nome}
    </span>
  )
}
