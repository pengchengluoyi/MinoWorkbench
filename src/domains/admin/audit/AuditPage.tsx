import { useCallback, useState } from 'react'
import { Button, DataTable, PageHeader, useFeedback, type DataColumn } from '@/ui'
import { Trash2 } from 'lucide-react'
import { clearAudit, listAudit, type AuditRow } from './auditLog'

const fmt = (t: number) => {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const columns: DataColumn<AuditRow>[] = [
  {
    key: 'time',
    title: '时间',
    width: 190,
    alwaysVisible: true,
    render: (_: unknown, row) => (
      <span className="w-mono" style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>
        {fmt(row.t)}
      </span>
    ),
  },
  {
    key: 'action',
    title: '操作',
    dataIndex: 'action',
    width: 180,
    render: (v: string) => <strong style={{ fontWeight: 650 }}>{v}</strong>,
  },
  {
    key: 'detail',
    title: '对象',
    dataIndex: 'detail',
    ellipsis: true,
    render: (v: string) => v || '—',
  },
]

export function AuditPage() {
  const fb = useFeedback()
  const [rows, setRows] = useState<AuditRow[]>(() => listAudit())

  const onClear = useCallback(async () => {
    const ok = await fb.confirm({
      title: '清空本会话的操作记录？',
      content: '记录只存在当前浏览器会话里，清空后无法恢复。',
      danger: true,
      okText: '清空',
    })
    if (!ok) return
    clearAudit()
    setRows([])
    fb.ok('已清空')
  }, [fb])

  return (
    <div className="flex flex-col" style={{ minHeight: 0 }}>
      <PageHeader
        title="操作记录"
        subtitle="只记录当前浏览器会话内发生的管理操作"
        count={`${rows.length} 条`}
        extra={
          <Button size="small" danger icon={<Trash2 size={13} />} disabled={!rows.length} onClick={onClear}>
            清空本会话
          </Button>
        }
      />
      <DataTable<AuditRow>
        viewId="admin.audit"
        columns={columns}
        dataSource={rows}
        rowKey={(r) => `${r.t}-${r.action}`}
        emptyTitle="本会话还没有操作记录"
        emptyHint="在管理后台做过增删改之后，这里会出现对应条目。"
      />
    </div>
  )
}
