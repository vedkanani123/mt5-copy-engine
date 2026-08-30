const KNOWN_ALIASES: Record<string, string[]> = {
  XAUUSD: ['XAUUSD', 'GOLD', 'XAUUSDM', 'XAUUSDPRO'],
  GOLD: ['GOLD', 'XAUUSD', 'XAUUSDM'],
  BTCUSD: ['BTCUSD', 'BTCUSDT', 'XBTUSD', 'BTC', 'BITCOIN'],
  ETHUSD: ['ETHUSD', 'ETHUSDT', 'ETHEREUM'],
  US30: ['US30', 'DJ30', 'WS30', 'DJI'],
  NAS100: ['NAS100', 'USTEC', 'NASDAQ', 'US100', 'NDX']
}

export function stripBrokerDecorators(symbol: string): string {
  let value = symbol.trim().toUpperCase()
  value = value.replace(/[^A-Z0-9]/g, '')
  value = value.replace(/(PRO|RAW|ECN|MINI|MICRO)$/g, '')
  if (value.endsWith('M') && value.length > 5) value = value.slice(0, -1)
  if ((value.endsWith('C') || value.endsWith('I') || value.endsWith('S')) && value.length > 6) {
    value = value.slice(0, -1)
  }
  return value
}

export function symbolsShareCore(masterSymbol: string, brokerSymbol: string): boolean {
  const wanted = stripBrokerDecorators(masterSymbol)
  const got = stripBrokerDecorators(brokerSymbol)
  if (wanted === got) return true
  const aliasSet = new Set([wanted, ...(KNOWN_ALIASES[wanted] || [])].map(stripBrokerDecorators))
  if (aliasSet.has(got)) return true
  if (wanted.length >= 6 && got.startsWith(wanted) && got.length <= wanted.length + 3) return true
  if (got.length >= 6 && wanted.startsWith(got) && wanted.length <= got.length + 3) return true
  return false
}

export type SymbolResolveResult =
  | { ok: true; symbol: string }
  | { ok: false; error: 'NOT_FOUND' | 'AMBIGUOUS' | 'EMPTY' }

export function resolveBrokerSymbol(
  masterSymbol: string,
  availableSymbols: string[],
  explicitMap: Record<string, string> = {}
): SymbolResolveResult {
  const master = masterSymbol.trim()
  if (!master) return { ok: false, error: 'EMPTY' }

  const mapped = explicitMap[master] || explicitMap[master.toUpperCase()]
  if (mapped) {
    const exactMapped = availableSymbols.find(s => s.toUpperCase() === mapped.toUpperCase())
    if (exactMapped) return { ok: true, symbol: exactMapped }
    return { ok: false, error: 'NOT_FOUND' }
  }

  const exact = availableSymbols.filter(s => s.toUpperCase() === master.toUpperCase())
  if (exact.length === 1) return { ok: true, symbol: exact[0] }
  if (exact.length > 1) return { ok: false, error: 'AMBIGUOUS' }

  const matches = availableSymbols.filter(s => symbolsShareCore(master, s))
  const unique = Array.from(new Set(matches))
  if (unique.length === 1) return { ok: true, symbol: unique[0] }
  if (unique.length > 1) {
    const shortest = [...unique].sort((a, b) => a.length - b.length)[0]
    return { ok: true, symbol: shortest }
  }
  return { ok: false, error: 'NOT_FOUND' }
}
