import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataTable, EmptyState, Input, PageHeader, Skeleton, errText, useFeedback, type DataColumn } from '@/ui'
import { getRole, listRoles, saveRolePrompt, type RoleRow } from '@/api/adminCatalog'
import { unwrapOne } from '@/lib/unwrap'

/** 角色列表。选中后改系统提示词，保存失败时停在原地。 */
export function RolesPage() {
  const fb = useFeedback()
  const qc = useQueryClient()
  const roles = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: async () => unwrapOne<{ roles?: RoleRow[] }>(await listRoles()) || {},
  })
  const rows = roles.data?.roles || []
  const [picked, setPicked] = useState('')
  const id = picked || rows[0]?.id || ''
  const detail = useQuery({
    queryKey: ['admin', 'roles', id],
    enabled: !!id,
    queryFn: async () => unwrapOne<RoleRow>(await getRole(id)),
  })
  const [draft, setDraft] = useState('')
  useEffect(() => { setDraft(detail.data?.system_prompt || '') }, [detail.data?.system_prompt, id])

  const save = useMutation({
    mutationFn: () => saveRolePrompt(id, draft),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'roles', id] })
      fb.ok('已保存提示词')
    },
    onError: (error) => fb.fail(errText(error, '保存失败')),
  })

  if (roles.isLoading) return <Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} />
  if (roles.isError) return <EmptyState title="读取角色失败" hint={errText(roles.error, '确认 Nexus 可达。')} />

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="角色" subtitle="每个角色一段系统提示词。这里不打开对话调试。" count={`${rows.length} 个`} />
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: 'minmax(280px, 0.9fr) minmax(320px, 1.1fr)', gap: 12 }}>
        <DataTable<RoleRow>
          viewId="admin.roles"
          fill
          rowKey={(row) => row.id}
          dataSource={rows}
          columns={columns}
          onRowClick={(row) => setPicked(row.id)}
          emptyTitle="还没有角色"
        />
        <section className="flex min-h-0 flex-col" style={{ background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)', padding: 16, gap: 10 }}>
          {!id ? <EmptyState title="选一个角色" /> : detail.isLoading ? <Skeleton active paragraph={{ rows: 6 }} title={false} /> : (
            <>
              <strong>{detail.data?.label || id}</strong>
              <span className="w-mono" style={{ color: 'var(--w-text-tertiary)', fontSize: 12 }}>{id}</span>
              <Input.TextArea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                autoSize={{ minRows: 12, maxRows: 22 }}
              />
              <div className="flex justify-end">
                <Button type="primary" size="small" loading={save.isPending} disabled={draft === (detail.data?.system_prompt || '')} onClick={() => save.mutate()}>
                  保存提示词
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

const columns: DataColumn<RoleRow>[] = [
  {
    key: 'label',
    title: '角色',
    alwaysVisible: true,
    render: (_: unknown, row) => (
      <div className="min-w-0">
        <div className="truncate" style={{ fontWeight: 650 }}>{row.label || row.id}</div>
        <div className="w-mono truncate" style={{ color: 'var(--w-text-quaternary)', fontSize: 11 }}>{row.id}</div>
      </div>
    ),
  },
  {
    key: 'skills',
    title: '技能',
    width: 80,
    render: (_: unknown, row) => String(row.skill_ids?.length || 0),
  },
]
