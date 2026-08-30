export interface CloseCandidate {
  ticket: string | number
  symbol: string
  type: 'BUY' | 'SELL'
  comment?: string
}

export interface CloseRequest {
  ticket?: string | number
  symbol?: string
  side?: 'BUY' | 'SELL'
}

function sameTicket(a: string | number | undefined, b: string | number | undefined): boolean {
  if (a === undefined || b === undefined || a === '' || b === '') return false
  return String(a) === String(b)
}

export function pickSingleCloseTarget(
  positions: CloseCandidate[],
  request: CloseRequest
): CloseCandidate | null {
  if (request.ticket !== undefined && request.ticket !== '') {
    const exact = positions.find(p => sameTicket(p.ticket, request.ticket))
    if (exact) return exact

    const copied = positions.find(p => (p.comment || '').includes(`Copy #${request.ticket}`))
    if (copied) return copied
  }

  const symbol = (request.symbol || '').toUpperCase()
  const side = request.side
  const matches = positions.filter(p => {
    const sameSymbol = !symbol || p.symbol.toUpperCase() === symbol
    const sameSide = !side || p.type === side
    return sameSymbol && sameSide
  })

  if (matches.length === 1) return matches[0]
  if (side && matches.length > 1) return matches[0]
  return null
}
