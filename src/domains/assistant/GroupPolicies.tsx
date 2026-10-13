import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Select, Switch, Skeleton, Empty, useFeedback, errText } from '@/ui'
import { getAssistantGroupPolicies, putAssistantGroupPolicy, type AssistantGroupPolicy } from '@/api/assistant'
import { assistantKeys, useIdentities } from './queries'
import { getProjects } from '@/api/project'
import { unwrapList } from '@/lib/unwrap'
import type { ProjectRow } from '@/types/project'
import { QueryProblem } from './AssistantNotReady'
import { channelLabel } from './format'

const INITIAL: AssistantGroupPolicy = { channel: '', instance_id: '', tenant: '', chat_id: '', enabled: false, allow_execute: false, disclose_results: false, project_ids: [] }

export function GroupPolicies() {
  const qc = useQueryClient()
  const feedback = useFeedback()
  const identities = useIdentities()
  const policies = useQuery({ queryKey: [...assistantKeys.all, 'group-policies'], queryFn: getAssistantGroupPolicies })
  const [editing, setEditing] = useState<AssistantGroupPolicy | null>(null)
  const projects = useQuery({ queryKey: [...assistantKeys.all, 'group-projects'], queryFn: async () => unwrapList<ProjectRow>(await getProjects(), { keys: ['projects'], label: 'GET /project/list' }) })
  const update = useMutation({
    mutationFn: putAssistantGroupPolicy,
    onSuccess: () => { setEditing(null); void qc.invalidateQueries({ queryKey: [...assistantKeys.all, 'group-policies'] }) },
    onError: (error) => feedback.fail(errText(error)),
  })
  const edit = (policy: AssistantGroupPolicy) => { setEditing(policy) }
  const bound = identities.data || []
  return <section className="w-surface-card" style={{ padding: 18 }}>
    <div className="flex justify-between items-center"><strong>群聊策略</strong><Button size="small" disabled={!bound.length} onClick={() => edit({ ...INITIAL })}>添加群策略</Button></div>
    <p style={{ fontSize: 13, color: 'var(--w-text-tertiary)' }}>群里 @ 机器人只触发处理，实际操作仍校验绑定账号与项目权限。默认提供使用帮助；账号主人可设置指定群和项目的执行及结果披露权限。</p>
    {policies.isLoading ? <Skeleton active paragraph={{ rows: 2 }} /> : policies.isError ? <QueryProblem error={policies.error} what="群策略" onRetry={() => void policies.refetch()} /> :
      policies.data?.items.length ? <div className="flex flex-col gap-2">{policies.data.items.map((policy) => <div key={policy.id} className="flex justify-between items-center flex-wrap gap-2" style={{ borderBottom: '1px solid var(--w-border)', padding: '10px 0' }}>
        <div><span>{channelLabel(policy.channel)} · {policy.chat_id}</span><div style={{ fontSize: 12, color: 'var(--w-text-tertiary)', marginTop: 4 }}>{policy.enabled ? '已启用' : '已停用'} · {policy.allow_execute ? '可执行' : '仅查询'} · {policy.disclose_results ? '可发送明细' : '仅状态'} · {policy.project_ids.length} 个项目</div></div>
        <div className="flex gap-2"><Button size="small" onClick={() => edit(policy)}>编辑</Button>{policy.enabled ? <Button size="small" loading={update.isPending} onClick={() => update.mutate({ ...policy, enabled: false })}>停用</Button> : null}</div>
      </div>)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未授权群聊执行" />}
    {projects.isError ? <QueryProblem error={projects.error} what="授权项目" onRetry={() => void projects.refetch()} /> : null}
    {editing ? <div style={{ marginTop: 16, padding: 16, background: 'var(--w-fill)', borderRadius: 'var(--w-radius-md)' }}>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        <label>已验证的机器人实例<Select aria-label="机器人实例" style={{ width: '100%', marginTop: 6 }} value={editing.instance_id ? `${editing.channel}:${editing.instance_id}` : undefined} placeholder="选择绑定实例" options={bound.map((identity) => ({ value: `${identity.channel}:${identity.instance_id}`, label: `${channelLabel(identity.channel)} · ${identity.node_name || identity.node_id}` }))} onChange={(value) => {
          const identity = bound.find((row) => `${row.channel}:${row.instance_id}` === value)
          if (identity) setEditing({ ...editing, channel: identity.channel, instance_id: identity.instance_id, tenant: identity.tenant || '' })
        }} /></label>
        <label>群会话 ID<Input aria-label="群会话 ID" style={{ marginTop: 6 }} value={editing.chat_id} onChange={(event) => setEditing({ ...editing, chat_id: event.target.value })} placeholder="填写平台的群会话 ID" /></label>
        <label>允许的项目<Select aria-label="允许的项目" mode="multiple" style={{ display: 'block', width: '100%', marginTop: 6 }} loading={projects.isLoading} value={editing.project_ids} options={(projects.data || []).map((project) => ({ value: project.id, label: project.name }))} onChange={(values) => setEditing({ ...editing, project_ids: values })} placeholder="按项目名称选择授权范围" /></label>
      </div>
      <div className="flex flex-wrap gap-6" style={{ marginTop: 16 }}>
        <label className="flex gap-2 items-center"><Switch checked={editing.enabled} onChange={(checked) => setEditing({ ...editing, enabled: checked })} />启用策略</label>
        <label className="flex gap-2 items-center"><Switch checked={editing.allow_execute} onChange={(checked) => setEditing({ ...editing, allow_execute: checked })} />允许执行测试</label>
        <label className="flex gap-2 items-center"><Switch checked={editing.disclose_results} onChange={(checked) => setEditing({ ...editing, disclose_results: checked })} />允许发送结果明细</label>
      </div>
      <div className="flex justify-end gap-2" style={{ marginTop: 16 }}><Button onClick={() => setEditing(null)}>取消编辑</Button><Button type="primary" disabled={!editing.instance_id || !editing.chat_id.trim() || (editing.enabled && !editing.project_ids.length)} loading={update.isPending} onClick={() => update.mutate({ ...editing, chat_id: editing.chat_id.trim(), project_ids: editing.project_ids })}>保存群策略</Button></div>
    </div> : null}
  </section>
}
