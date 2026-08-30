import React from 'react'
import {
  GitFork,
  Radio,
  Server,
  Zap,
  ArrowRight,
  Shield,
  Layers
} from 'lucide-react'
import type { TradingAccount } from '../../lib/types'
import { money, isAccountOnline } from '../../lib/formatters'
import { StatusBadge } from '../common/StatusBadge'

export interface TopologyGraphProps {
  accounts: TradingAccount[]
  eaStates: Record<string, any>
  onSelectAccount: (id: string) => void
}

export const TopologyGraph: React.FC<TopologyGraphProps> = ({
  accounts,
  eaStates,
  onSelectAccount
}) => {
  const masters = accounts.filter(a => a.mode === 'MASTER')

  return (
    <div className="topologyGraphWrapper glass">
      <div className="topologyHeader">
        <div className="topologyTitle">
          <GitFork size={20} className="textAccent" />
          <div>
            <h3>Live Copier Topology Network</h3>
            <p>Visual mapping of Master dispatch nodes and downstream Slave copier terminals.</p>
          </div>
        </div>
      </div>

      <div className="topologyGrid">
        {masters.length === 0 ? (
          <div className="topologyEmptyState">
            <Radio size={32} className="textDim" />
            <h4>No Master Terminals Connected</h4>
            <p>Create a Master EA account to view the real-time copy topology graph.</p>
          </div>
        ) : (
          masters.map(master => {
            const masterOnline = isAccountOnline(master, eaStates[master.id])
            const slaves = accounts.filter(
              a => a.mode === 'SLAVE' && a.master_account_id === master.id
            )
            const linkedMasters = accounts.filter(
              a => a.mode === 'MASTER' && a.master_account_id === master.id
            )

            return (
              <div key={master.id} className="topologyClusterNode glass">
                {/* Master Node */}
                <div
                  className={`masterNode ${masterOnline ? 'nodeOnline' : 'nodeOffline'}`}
                  onClick={() => onSelectAccount(master.id)}
                >
                  <div className="nodeBadge">
                    <span>👑 MASTER NODE</span>
                  </div>
                  <div className="nodeInfo">
                    <h4>{master.label}</h4>
                    <span className="nodeMeta mono">
                      {master.broker || 'MT5'} • #{master.account_number || '---'}
                    </span>
                    <span className="nodeBalance mono">{money(master.balance)}</span>
                  </div>
                  <StatusBadge online={masterOnline} />
                </div>

                {/* Connection Branch Lines */}
                <div className="topologyBranchConnector">
                  <div className="verticalConnectorLine" />
                  <div className="pulseStreamDot" />
                </div>

                {/* Slave Copier Nodes */}
                <div className="slaveNodesContainer">
                  {linkedMasters.map(linked => (
                    <div
                      key={linked.id}
                      className={`slaveNode ${isAccountOnline(linked, eaStates[linked.id]) ? 'nodeOnline' : 'nodeOffline'}`}
                      onClick={() => onSelectAccount(linked.id)}
                    >
                      <div className="slaveNodeLeft">
                        <div className="slaveModeTag">👑 LINKED MASTER</div>
                        <div>
                          <h5>{linked.label}</h5>
                          <small className="mono textMuted">
                            Copy {linked.copy_status === 'PAUSED' ? 'OFF' : 'ON'} • #{linked.account_number || '---'}
                          </small>
                        </div>
                      </div>
                    </div>
                  ))}
                  {slaves.length === 0 && linkedMasters.length === 0 ? (
                    <div className="emptySlavesNode">
                      <small>No slaves or linked masters yet.</small>
                    </div>
                  ) : (
                    slaves.map(slave => {
                      const slaveOnline = isAccountOnline(slave, eaStates[slave.id])
                      return (
                        <div
                          key={slave.id}
                          className={`slaveNode ${slaveOnline ? 'nodeOnline' : 'nodeOffline'}`}
                          onClick={() => onSelectAccount(slave.id)}
                        >
                          <div className="slaveNodeLeft">
                            <div className="slaveModeTag">⚡ SLAVE</div>
                            <div>
                              <h5>{slave.label}</h5>
                              <small className="mono textMuted">
                                {slave.broker || 'Broker'} • #{slave.account_number || '---'}
                              </small>
                            </div>
                          </div>

                          <div className="slaveNodeRight">
                            <span className="nodeBalance mono">{money(slave.balance)}</span>
                            <StatusBadge online={slaveOnline} />
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
