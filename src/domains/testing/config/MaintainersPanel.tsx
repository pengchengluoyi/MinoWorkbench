import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, EmptyState, Select, Skeleton, Tag, errText, useFeedback } from '@/ui'
import { addProjectMaintainer, getProjectMaintainers, listAuthUsers, removeProjectMaintainer, type AuthUser, type ProjectMaintainers } from '@/api/project'
import { unwrapOne } from '@/lib/unwrap'
import { recordAudit } from '@/domains/admin/audit/auditLog'

/**
 * 项目维护者。
 * 维护者与管理员可以改用例、待补充、控件、环境、账号池和发布；其他账号只读。
 * 创建者天然是维护者，不能移除；只有管理员能增删。
 */
export function MaintainersPanel({ projectId }: { projectId: string }) {
  const fb = useFeedback()
  const qc = useQueryClient()
  const [pick, setPick] = useState<string>()
  const key = ['project', projectId, 'maintainers']
  const query = useQuery({
    queryKey: key,
    enabled: !!projectId,
    queryFn: async () => unwrapOne<ProjectMaintainers>(await getProjectMaintainers(projectId)),
  })
  const canManage = !!query.data?.can_manage
  const users = useQuery({
    queryKey: ['auth', 'users'],
    enabled: canManage,
    queryFn: async () => unwrapOne<{ users?: AuthUser[] }>(await listAuthUsers())?.users || [],
  })
  const done = (text: string) => {
    void qc.invalidateQueries({ queryKey: key })
    recordAudit(text)
    fb.ok(text)
  }
  const add = useMutation({
    mutationFn: (uid: string) => addProjectMaintainer(projectId, uid),
    onSuccess: () => { setPick(undefined); done('已添加项目维护者') },
    onError: (e) => fb.fail(errText(e, '添加失败')),
  })
  const remove = useMutation({
    mutationFn: (uid: string) => removeProjectMaintainer(projectId, uid),
    onSuccess: () => done('已移除项目维护者'),
    onError: (e) => fb.fail(errText(e, '移除失败')),
  })

  if (query.isLoading) return <Skeleton active paragraph={{ rows: 4 }} />
  if (query.isError || !query.data) return <EmptyState title="读取维护者失败" hint={errText(query.error, '确认 Nexus 可达。')} action={<Button onClick={() => void query.refetch()}>重试读取</Button>} />

  const items = query.data.items || []
  const taken = new Set(items.map(m => m.user_id))
  const options = (users.data || []).filter(u => !taken.has(u.user_id))
    .map(u => ({ value: u.user_id, label: `${u.name || u.username}${u.email ? ` · ${u.email}` : ''}` }))

  return <div className="flex min-h-0 flex-col" style={{ gap: 12, maxWidth: 720 }}>
    <Alert type={query.data.can_edit ? 'success' : 'info'} showIcon message={query.data.can_edit
      ? '你可以修改这个项目的用例、待补充、控件、环境、账号池和发布。'
      : '你对这个项目只读。需要修改时请联系管理员把你加为维护者。'} />
    {items.map(m => <div key={m.user_id} className="flex items-center" style={{ gap: 8, padding: '8px 0', borderBottom: '1px solid var(--w-border, rgba(0,0,0,0.06))' }}>
      <span className="min-w-0 flex-1" style={{ overflowWrap: 'anywhere' }}>
        <b>{m.name || m.user_id}</b>{m.email && <span className="w-form-hint"> · {m.email}</span>}
      </span>
      {m.source === 'creator' ? <Tag>创建者</Tag> : <Tag color="blue">维护者</Tag>}
      {canManage && m.source !== 'creator' && <Button size="small" danger loading={remove.isPending && remove.variables === m.user_id}
        onClick={async () => { if (await fb.confirm({ title: `移除 ${m.name || m.user_id} 的维护权限？`, danger: true, okText: '移除' })) remove.mutate(m.user_id) }}>移除</Button>}
    </div>)}
    {canManage && <div className="flex items-center" style={{ gap: 8 }}>
      <Select aria-label="选择账号" showSearch optionFilterProp="label" placeholder="选择要加为维护者的账号" style={{ flex: 1 }}
        loading={users.isLoading} value={pick} onChange={setPick} options={options} />
      <Button type="primary" disabled={!pick} loading={add.isPending} onClick={() => pick && add.mutate(pick)}>添加维护者</Button>
    </div>}
  </div>
}
