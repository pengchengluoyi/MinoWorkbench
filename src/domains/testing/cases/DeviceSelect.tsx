import type { ReactNode } from 'react'
import { Globe, Monitor, RefreshCw, Smartphone } from 'lucide-react'
import { Link } from 'react-router-dom'
import { deviceFamilyLabel, isExecutable, type RunDevice } from '@/api/run'
import { Button, Select, Tag } from '@/ui'

interface DeviceOption {
  key?: string
  value?: string
  label: ReactNode
  disabled?: boolean
  searchText?: string
  device?: RunDevice
  options?: DeviceOption[]
}

/** Both run entry points consume the server decision and preserve blocked rows. */
export function DeviceSelect({ devices, value, onChange, loading = false, refreshing = false, onRefresh, compact = false }: {
  devices: RunDevice[]
  value: string
  onChange: (sn: string) => void
  loading?: boolean
  refreshing?: boolean
  onRefresh?: () => void
  compact?: boolean
}) {
  const groups = new Map<string, { name: string; devices: RunDevice[] }>()
  for (const device of devices) {
    const nodeId = device.node_id || String(device.current_scout_id || '') || `unknown:${device.sn}`
    const group = groups.get(nodeId) || { name: nodeId, devices: [] }
    if (device.node_name && device.node_name !== nodeId) group.name = device.node_name
    group.devices.push(device)
    groups.set(nodeId, group)
  }
  const selected = devices.find((device) => device.sn === value)
  const readyCount = devices.filter(isExecutable).length
  const options: DeviceOption[] = [...groups.entries()].map(([nodeId, group]) => ({
    key: nodeId,
    label: <div className="flex items-center justify-between gap-2" style={{ color: 'var(--w-text-secondary)' }}>
      <span style={{ overflowWrap: 'anywhere' }}>{group.name}</span>
      <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{group.devices.filter(isExecutable).length} / {group.devices.length} 可执行</span>
    </div>,
    options: [...group.devices].sort((left, right) => Number(isExecutable(right)) - Number(isExecutable(left))).map((device) => ({
      value: device.sn,
      label: `${deviceFamilyLabel(device)}${device.model && device.platform !== 'desktop' ? ` · ${device.model}` : ''}`,
      disabled: !isExecutable(device),
      searchText: `${group.name} ${nodeId} ${device.sn} ${device.model || ''} ${deviceFamilyLabel(device)}`.toLowerCase(),
      device,
    })),
  }))
  const note = selected && !isExecutable(selected) ? selected.blocked_reason || '所选设备未就绪'
    : !devices.length ? '暂无设备，请到 Scout 节点页查看接入状态。'
        : !readyCount ? '当前渠道没有可执行设备，展开列表查看原因。'
          : `${readyCount} 台可执行设备 · ${groups.size} 个 Scout 节点`
  return (
    <div className="flex flex-col gap-1" style={{ width: compact ? 330 : 480, maxWidth: '100%', minWidth: 0 }}>
      <Select<string, DeviceOption>
        aria-label="执行设备"
        placeholder={loading ? '正在查询设备…' : '选择执行设备'}
        value={value || undefined}
        onChange={(next) => onChange(next || '')}
        allowClear
        showSearch
        loading={loading}
        disabled={loading}
        size={compact ? 'small' : 'middle'}
        options={options}
        style={{ width: '100%' }}
        popupMatchSelectWidth={480}
        styles={{ popup: { root: { maxWidth: 'calc(100vw - 24px)' } } }}
        dropdownAlign={{ overflow: { adjustX: true, adjustY: true, shiftX: true } }}
        listHeight={320}
        virtual={false}
        filterOption={(input, option) => String(option?.searchText || '').includes(input.toLowerCase())}
        labelRender={() => selected ? deviceFamilyLabel(selected) + (selected.model && selected.platform !== 'desktop' ? ` · ${selected.model}` : '') : '所选设备已不可用'}
        notFoundContent={devices.length ? '没有匹配的设备' : '尚未发现设备'}
        optionRender={(option) => {
          const device = option.data.device
          if (!device) return option.label
          const ready = isExecutable(device)
          const Icon = device.platform === 'desktop' ? Monitor : device.platform === 'web' ? Globe : Smartphone
          return <div style={{ padding: '5px 0', whiteSpace: 'normal' }}>
            <div className="flex items-center gap-2" style={{ color: 'var(--w-text)' }}>
              <Icon size={15} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{option.label}</span>
              <Tag color={ready ? 'success' : device.blocking_code === 'busy' ? 'warning' : 'default'} style={{ margin: 0 }}>
                {ready ? '可执行' : device.status === 'offline' ? '未连接' : '不可执行'}
              </Tag>
            </div>
            {!ready ? <div style={{ marginTop: 4, marginLeft: 23, fontSize: 12, color: 'var(--w-text-secondary)', overflowWrap: 'anywhere' }}>{device.blocked_reason || '设备未就绪'}</div> : null}
          </div>
        }}
        popupRender={(menu) => <>
          {menu}
          <div className="flex items-center justify-between gap-2" style={{ padding: '8px 10px', borderTop: '1px solid var(--w-border)' }}>
            <span style={{ fontSize: 12, color: 'var(--w-text-secondary)' }}>{groups.size} 个节点 · {readyCount} 台可执行</span>
            <span className="flex items-center gap-2">
              {onRefresh ? <Button type="text" size="small" icon={<RefreshCw size={13} />} loading={refreshing} onClick={onRefresh}>刷新设备</Button> : null}
              <Link to="/settings/runtime" target="_blank" rel="noopener noreferrer">节点管理</Link>
            </span>
          </div>
        </>}
      />
      {!loading ? <div role="status" style={{ fontSize: 11, lineHeight: '18px', padding: compact ? '2px 7px' : 0, borderRadius: 6,
        background: compact ? 'var(--w-surface)' : undefined, color: 'var(--w-text-secondary)' }}>
        {note}
      </div> : null}
    </div>
  )
}
