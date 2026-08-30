export type CopyLogicalAction =
  | 'OPEN_MARKET'
  | 'CLOSE_MARKET'
  | 'PARTIAL_CLOSE'
  | 'MODIFY_SL_TP'
  | 'CREATE_PENDING'
  | 'MODIFY_PENDING'
  | 'DELETE_PENDING'

export interface CopyEventIdentityInput {
  action: CopyLogicalAction
  masterAccountId: string
  positionId: string
  dealId?: string
  sl?: number
  tp?: number
  remainingVolume?: number
  pendingTicket?: string
}

export function buildCopyEventId(input: CopyEventIdentityInput): string {
  const account = input.masterAccountId.trim()
  const position = String(input.positionId).trim()
  if (!account || !position) return ''

  if (input.action === 'OPEN_MARKET')
    return `${account}|OPEN_MARKET|${position}`

  if (input.action === 'CLOSE_MARKET')
    return `${account}|CLOSE_MARKET|${position}`

  if (input.action === 'PARTIAL_CLOSE') {
    const remaining = Number(input.remainingVolume ?? 0).toFixed(2)
    return `${account}|PARTIAL_CLOSE|${position}|${remaining}`
  }

  if (input.action === 'MODIFY_SL_TP') {
    const sl = Number(input.sl ?? 0).toFixed(5)
    const tp = Number(input.tp ?? 0).toFixed(5)
    return `${account}|MODIFY_SL_TP|${position}|${sl}|${tp}`
  }

  const pending = String(input.pendingTicket || position).trim()
  return `${account}|${input.action}|${pending}`
}

export function shouldIgnoreDuplicateEvent(firstId: string, secondId: string): boolean {
  return firstId !== '' && firstId === secondId
}
