// Impressão e PDF do orçamento, no mesmo layout dos orçamentos que o JS Bot já
// manda pro cliente (PDFs pré-montados na pasta "ORÇAMENTOS 2026" — cabeçalho
// fixo da loja, bloco Data/Sequência/Vendedor, tabela Código/Produtos/Qtde/
// Valor/Total, rodapé de agradecimento). Fonte monoespaçada (Courier) de
// propósito, pra reproduzir a cara de formulário fixo do original.
import jsPDF from 'jspdf'
import { EMPRESA_INFO } from './constants'
import { formatDate, formatPhone } from './formatters'

function numero(valor, casas = 2) {
  return (valor ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

// Normaliza os itens do orçamento pro formato da tabela impressa — mesmo
// vocabulário usado tanto na impressão quanto no PDF, pra não duplicar regra.
function montarLinhasOrcamento(orc) {
  const itens = (orc.itens_orcamento ?? []).map((item) => ({
    codigo: item.produtos?.sku ?? '',
    nome: item.nome_item ?? item.produtos?.nome ?? item.descricao_livre ?? '—',
    qtd: item.quantidade ?? 0,
    valorUnitario: item.valor_unitario,
    valorTotal: item.valor_total,
  }))

  const totalProdutos = itens.reduce((acc, i) => acc + (i.valorTotal ?? 0), 0)

  return { itens, totalProdutos, totalGeral: orc.valor_total ?? totalProdutos }
}

function montarCabecalho(orc) {
  return {
    data: formatDate(orc.criado_em),
    sequencia: orc.sequencia || '—',
    cliente: orc.clientes?.nome ?? 'Cliente não identificado',
    telefone: formatPhone(orc.clientes?.telefone),
    observacao: orc.observacoes || '',
    protocolo: orc.protocolo,
  }
}

// ── PDF (jsPDF) ──────────────────────────────────────────────────────────────

function gerarPdfOrcamento(orc) {
  const { itens, totalProdutos, totalGeral } = montarLinhasOrcamento(orc)
  const cab = montarCabecalho(orc)

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margemEsq = 12
  const margemDir = 198
  let y = 15

  doc.setFont('courier', 'bold')
  doc.setFontSize(13)
  doc.text(EMPRESA_INFO.nome, 105, y, { align: 'center' })
  y += 5
  doc.setFont('courier', 'normal')
  doc.setFontSize(9)
  doc.text(`** ${EMPRESA_INFO.slogan} **`, 105, y, { align: 'center' })
  y += 7

  doc.setFontSize(8.5)
  doc.text(`Rua: ${EMPRESA_INFO.endereco}`, margemEsq, y)
  doc.text(`CNPJ: ${EMPRESA_INFO.cnpj}`, margemDir, y, { align: 'right' })
  y += 4.5
  doc.text(
    `Bairro: ${EMPRESA_INFO.bairro}   Cidade: ${EMPRESA_INFO.cidade}   CEP: ${EMPRESA_INFO.cep}`,
    margemEsq, y
  )
  y += 4.5
  doc.text(EMPRESA_INFO.telefone, margemEsq, y)
  doc.text(`E-mail: ${EMPRESA_INFO.email}`, margemDir, y, { align: 'right' })
  y += 3
  doc.setLineWidth(0.3)
  doc.line(margemEsq, y, margemDir, y)
  y += 5

  doc.text(`Orçamento: ${cab.protocolo}`, margemEsq, y)
  doc.text(`Data: ${cab.data}`, 90, y)
  doc.text(`Sequência: ${cab.sequencia}`, margemDir, y, { align: 'right' })
  y += 5
  doc.text(`Cliente: ${cab.cliente}`, margemEsq, y)
  y += 4.5
  doc.text(`Tel.: ${cab.telefone}`, margemEsq, y)
  y += 4.5
  if (cab.observacao) {
    doc.text(`Observação: ${cab.observacao}`, margemEsq, y)
    y += 4.5
  }
  y += 1
  doc.line(margemEsq, y, margemDir, y)
  y += 5

  // Tabela — cabeçalho de colunas
  doc.setFont('courier', 'bold')
  doc.text('Código', margemEsq, y)
  doc.text('Produto', margemEsq + 16, y)
  doc.text('Qtde', 148, y, { align: 'right' })
  doc.text('Valor', 172, y, { align: 'right' })
  doc.text('Total', margemDir, y, { align: 'right' })
  y += 3
  doc.setFont('courier', 'normal')
  doc.line(margemEsq, y, margemDir, y)
  y += 5

  const larguraNome = 78
  for (const item of itens) {
    const linhasNome = doc.splitTextToSize(item.nome, larguraNome)
    if (y > 275) {
      doc.addPage()
      y = 15
    }
    doc.text(String(item.codigo), margemEsq, y)
    doc.text(linhasNome, margemEsq + 16, y)
    doc.text(numero(item.qtd, item.qtd % 1 === 0 ? 0 : 2), 148, y, { align: 'right' })
    doc.text(item.valorUnitario === null ? '—' : numero(item.valorUnitario), 172, y, { align: 'right' })
    doc.text(item.valorTotal === null ? '—' : numero(item.valorTotal), margemDir, y, { align: 'right' })
    y += 4.5 * linhasNome.length
  }

  y += 1
  doc.line(margemEsq, y, margemDir, y)
  y += 6
  doc.setFont('courier', 'bold')
  doc.text(`Produtos: ${numero(totalProdutos)}`, margemEsq, y)
  doc.text(`Valor Total: ${numero(totalGeral)}`, margemDir, y, { align: 'right' })
  y += 10

  doc.setFont('courier', 'normal')
  doc.setFontSize(8)
  doc.text('"OBRIGADA POR ESCOLHER NOSSA LOJA! ESPERAMOS VER VOCÊ DE NOVO EM BREVE!"', 105, y, { align: 'center' })

  return doc
}

function nomeArquivoOrcamento(orc) {
  const clienteSlug = (orc.clientes?.nome ?? 'cliente').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')
  return `Orcamento_${orc.protocolo}_${clienteSlug}.pdf`
}

function baixarPdfOrcamento(orc) {
  const doc = gerarPdfOrcamento(orc)
  doc.save(nomeArquivoOrcamento(orc))
}

// Base64 puro (sem o prefixo "data:application/pdf;base64,") — formato que a
// Evolution API espera no campo `media` (ver enviarDocumentoBase64 no bot).
function gerarPdfBase64Orcamento(orc) {
  const doc = gerarPdfOrcamento(orc)
  const dataUri = doc.output('datauristring')
  const base64 = dataUri.split(',')[1]
  return { base64, nomeArquivo: nomeArquivoOrcamento(orc) }
}

// ── Impressão (janela própria — não herda o layout/overlay do app) ──────────

function montarHtmlImpressao(orc) {
  const { itens, totalProdutos, totalGeral } = montarLinhasOrcamento(orc)
  const cab = montarCabecalho(orc)

  const linhasItens = itens.map((item) => `
    <tr>
      <td>${item.codigo}</td>
      <td>${item.nome}</td>
      <td class="num">${numero(item.qtd, item.qtd % 1 === 0 ? 0 : 2)}</td>
      <td class="num">${item.valorUnitario === null ? '—' : numero(item.valorUnitario)}</td>
      <td class="num">${item.valorTotal === null ? '—' : numero(item.valorTotal)}</td>
    </tr>
  `).join('')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${cab.protocolo}</title>
<style>
  body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; padding: 24px; }
  h1 { text-align: center; font-size: 18px; margin: 0; }
  .slogan { text-align: center; font-size: 11px; margin: 4px 0 12px; }
  .cabecalho-loja { display: flex; justify-content: space-between; font-size: 11px; }
  hr { border: none; border-top: 1px solid #000; margin: 10px 0; }
  .info-linha { display: flex; justify-content: space-between; font-size: 12px; margin: 3px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 3px 4px; font-size: 11px; }
  th { border-bottom: 1px solid #000; }
  .num { text-align: right; }
  .totais { display: flex; justify-content: space-between; font-weight: bold; margin-top: 8px; border-top: 1px solid #000; padding-top: 8px; }
  .rodape { text-align: center; margin-top: 20px; font-size: 11px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>${EMPRESA_INFO.nome}</h1>
  <p class="slogan">** ${EMPRESA_INFO.slogan} **</p>
  <div class="cabecalho-loja">
    <span>Rua: ${EMPRESA_INFO.endereco}</span>
    <span>CNPJ: ${EMPRESA_INFO.cnpj}</span>
  </div>
  <div class="cabecalho-loja">
    <span>Bairro: ${EMPRESA_INFO.bairro} — Cidade: ${EMPRESA_INFO.cidade} — CEP: ${EMPRESA_INFO.cep}</span>
    <span>E-mail: ${EMPRESA_INFO.email}</span>
  </div>
  <hr>
  <div class="info-linha"><span>Orçamento: ${cab.protocolo}</span><span>Data: ${cab.data}</span><span>Sequência: ${cab.sequencia}</span></div>
  <div class="info-linha"><span>Cliente: ${cab.cliente}</span><span>Tel.: ${cab.telefone}</span></div>
  ${cab.observacao ? `<div class="info-linha"><span>Observação: ${cab.observacao}</span></div>` : ''}
  <hr>
  <table>
    <thead>
      <tr><th>Código</th><th>Produto</th><th class="num">Qtde</th><th class="num">Valor</th><th class="num">Total</th></tr>
    </thead>
    <tbody>${linhasItens}</tbody>
  </table>
  <div class="totais"><span>Produtos: ${numero(totalProdutos)}</span><span>Valor Total: ${numero(totalGeral)}</span></div>
  <p class="rodape">"OBRIGADA POR ESCOLHER NOSSA LOJA! ESPERAMOS VER VOCÊ DE NOVO EM BREVE!"</p>
</body>
</html>`
}

function imprimirOrcamento(orc) {
  const janela = window.open('', '_blank', 'width=800,height=1000')
  if (!janela) return
  janela.document.write(montarHtmlImpressao(orc))
  janela.document.close()
  janela.onload = () => {
    janela.focus()
    janela.print()
  }
}

export const orcamentoDocumento = {
  baixarPdfOrcamento,
  gerarPdfBase64Orcamento,
  imprimirOrcamento,
}
