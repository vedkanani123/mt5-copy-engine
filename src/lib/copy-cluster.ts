export interface ClusterAccount {
  id: string
  mode: 'MASTER' | 'SLAVE'
  copy_status?: string | null
  master_account_id?: string | null
}

export function isCopyOn(status: string | null | undefined): boolean {
  return (status || 'ACTIVE') === 'ACTIVE'
}

export function wouldCreateMasterCycle(
  accounts: ClusterAccount[],
  followerId: string,
  newParentId: string | null
): boolean {
  if (!newParentId) return false
  if (followerId === newParentId) return true

  const parentById = new Map(accounts.map(account => [account.id, account.master_account_id || null]))
  let cursor: string | null = newParentId
  const seen = new Set<string>([followerId])

  while (cursor) {
    if (seen.has(cursor)) return true
    seen.add(cursor)
    cursor = parentById.get(cursor) || null
  }

  return false
}

export function collectCopyTargets(
  accounts: ClusterAccount[],
  originMasterId: string
): ClusterAccount[] {
  const origin = accounts.find(account => account.id === originMasterId)
  if (!origin || origin.mode !== 'MASTER' || !isCopyOn(origin.copy_status)) {
    return []
  }

  const childrenByParent = new Map<string, ClusterAccount[]>()
  for (const account of accounts) {
    const parentId = account.master_account_id
    if (!parentId) continue
    const siblings = childrenByParent.get(parentId) || []
    siblings.push(account)
    childrenByParent.set(parentId, siblings)
  }

  const targets: ClusterAccount[] = []
  const queue = [originMasterId]
  const visited = new Set<string>([originMasterId])

  while (queue.length > 0) {
    const parentId = queue.shift()
    if (!parentId) continue
    const children = childrenByParent.get(parentId) || []
    for (const child of children) {
      if (visited.has(child.id)) continue
      visited.add(child.id)
      queue.push(child.id)
      if (isCopyOn(child.copy_status)) targets.push(child)
    }
  }

  return targets
}

export function isRootMasterCluster(
  accounts: ClusterAccount[],
  account: ClusterAccount
): boolean {
  if (account.mode !== 'MASTER') return false
  const parent = accounts.find(candidate => candidate.id === account.master_account_id)
  return !parent || parent.mode !== 'MASTER'
}
