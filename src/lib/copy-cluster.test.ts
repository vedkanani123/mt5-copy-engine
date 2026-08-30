import { describe, expect, it } from 'vitest'
import {
  collectCopyTargets,
  isCopyOn,
  isRootMasterCluster,
  wouldCreateMasterCycle
} from './copy-cluster'

const accounts = [
  { id: 'm1', mode: 'MASTER' as const, copy_status: 'ACTIVE', master_account_id: null },
  { id: 's1', mode: 'SLAVE' as const, copy_status: 'ACTIVE', master_account_id: 'm1' },
  { id: 's2', mode: 'SLAVE' as const, copy_status: 'PAUSED', master_account_id: 'm1' },
  { id: 'm2', mode: 'MASTER' as const, copy_status: 'ACTIVE', master_account_id: 'm1' },
  { id: 's3', mode: 'SLAVE' as const, copy_status: 'ACTIVE', master_account_id: 'm2' },
  { id: 's4', mode: 'SLAVE' as const, copy_status: 'ACTIVE', master_account_id: 'm2' }
]

describe('isCopyOn', () => {
  it('defaults missing status to ON', () => {
    expect(isCopyOn(undefined)).toBe(true)
    expect(isCopyOn('ACTIVE')).toBe(true)
    expect(isCopyOn('PAUSED')).toBe(false)
  })
})

describe('collectCopyTargets', () => {
  it('copies to on slaves, skips off slaves, and walks nested master clusters', () => {
    const targets = collectCopyTargets(accounts, 'm1').map(account => account.id)
    expect(targets).toEqual(['s1', 'm2', 's3', 's4'])
  })

  it('still copies nested slaves when the linked master is off', () => {
    const nestedOff = accounts.map(account =>
      account.id === 'm2' ? { ...account, copy_status: 'PAUSED' } : account
    )
    const targets = collectCopyTargets(nestedOff, 'm1').map(account => account.id)
    expect(targets).toEqual(['s1', 's3', 's4'])
  })

  it('sends nothing when the origin master copy is off', () => {
    const originOff = accounts.map(account =>
      account.id === 'm1' ? { ...account, copy_status: 'PAUSED' } : account
    )
    expect(collectCopyTargets(originOff, 'm1')).toEqual([])
  })
})

describe('wouldCreateMasterCycle', () => {
  it('blocks a master from following itself or a descendant', () => {
    expect(wouldCreateMasterCycle(accounts, 'm1', 'm1')).toBe(true)
    expect(wouldCreateMasterCycle(accounts, 'm1', 'm2')).toBe(true)
    expect(wouldCreateMasterCycle(accounts, 'm2', 'm1')).toBe(false)
  })
})

describe('isRootMasterCluster', () => {
  it('treats nested masters as children of the upstream cluster', () => {
    expect(isRootMasterCluster(accounts, accounts[0])).toBe(true)
    expect(isRootMasterCluster(accounts, accounts[3])).toBe(false)
  })
})
