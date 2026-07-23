export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value ?? 0)
}

export function formatDate(dateString, opcoes = {}) {
  if (!dateString) return '—'
  const data = new Date(dateString)
  const padrao = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...opcoes,
  }
  return new Intl.DateTimeFormat('pt-BR', padrao).format(data)
}

export function formatDateTime(dateString) {
  if (!dateString) return '—'
  const data = new Date(dateString)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(data)
}

export function formatTimeAgo(dateString) {
  if (!dateString) return ''
  const agora = new Date()
  const data = new Date(dateString)
  const diffMs = agora - data
  const diffSeg = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSeg / 60)
  const diffHora = Math.floor(diffMin / 60)

  if (diffSeg < 60) return 'agora há pouco'
  if (diffMin < 60) return `há ${diffMin}min`
  if (diffHora < 24) return `há ${diffHora}h`
  return formatDate(dateString)
}

export function formatPhone(telefone) {
  if (!telefone) return '—'
  const nums = telefone.replace(/\D/g, '')
  if (nums.length === 13) {
    return `+${nums.slice(0, 2)} (${nums.slice(2, 4)}) ${nums.slice(4, 9)}-${nums.slice(9)}`
  }
  if (nums.length === 11) {
    return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`
  }
  if (nums.length === 10) {
    return `(${nums.slice(0, 2)}) ${nums.slice(2, 6)}-${nums.slice(6)}`
  }
  return telefone
}

export function formatEntrega(forma) {
  const mapa = {
    retirada: 'Retirada na loja',
    entrega_propria: 'Entrega própria',
    uber_flash: 'Uber Flash / Motoboy',
  }
  return mapa[forma] ?? forma ?? '—'
}

export function truncateText(texto, maxLen = 40) {
  if (!texto) return ''
  return texto.length > maxLen ? texto.slice(0, maxLen) + '…' : texto
}
