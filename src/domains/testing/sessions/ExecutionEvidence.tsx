import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Input, Tag } from 'antd'
import { getExecutionEvidence, type ExecutionExpectation } from '@/api/sessions'
import { copyToClipboard } from '@/lib/clipboard'
import { useSession } from '@/lib/session'
import { workbenchBuildIdentity } from '@/lib/buildIdentity'
import { errText, useFeedback } from '@/ui'

const emptyExpectation: ExecutionExpectation = {
  expected_instance_id: '', expected_node_id: '', expected_build_id: '', expected_nexus_build_id: '',
}

export function ExecutionEvidence({ sessionId, eventCount }: { sessionId: string; eventCount: number }) {
  const owner = useSession(state => state.user?.user_id || '')
  const feedback = useFeedback()
  const [draft, setDraft] = useState(emptyExpectation)
  const [expected, setExpected] = useState(emptyExpectation)
  const evidence = useQuery({
    queryKey: ['execution-evidence', sessionId, eventCount, owner, expected],
    queryFn: ({ signal }) => getExecutionEvidence(sessionId, expected, signal),
    retry: false,
  })
  const workbench = useQuery({ queryKey: ['workbench-build', eventCount], queryFn: workbenchBuildIdentity, retry: false })
  const data = evidence.data
  const fields: [keyof ExecutionExpectation, string][] = [
    ['expected_instance_id', '预期测试实例 ID'], ['expected_nexus_build_id', '预期 Nexus build'],
    ['expected_node_id', '预期测试 Scout 节点'], ['expected_build_id', '预期 Scout build'],
  ]
  const copyReference = async () => {
    if (!data) return
    try {
      await copyToClipboard(JSON.stringify({ ...data.reference, viewer_workbench: workbench.data }, null, 2))
      feedback.ok('已复制实例、会话和实际 build 引用')
    } catch (error) { feedback.fail(errText(error, '复制失败')) }
  }
  return <section className="session-summary" aria-label="执行版本与节点">
    <strong>执行版本与节点</strong>{' '}
    {data && <Tag color={data.state === 'verified' ? 'green' : data.state === 'failed' ? 'red' : 'orange'}>
      {data.state === 'verified' ? '执行版本核对通过' : data.state === 'failed' ? '执行证据不符' : '尚未完成版本核对'}
    </Tag>}
    {evidence.isError && <Alert type="error" showIcon message="执行证据不可读取" description={errText(evidence.error, '确认测试实例和会话仍然存在。已删除的测试库不会恢复历史证据。')} />}
    {evidence.isPending && <p role="status">正在读取会话保存的运行证据…</p>}
    {data && <>
      <p>实例：<code>{data.instance_id}</code> · Nexus：<code>{data.nexus.build_id || '未记录'}</code></p>
      <p>当前 Workbench 页面：<code>{workbench.data?.build_id || 'build 不可读取'}</code>
        {workbench.data?.source_unchanged === false && '（源码已变化，需要重启开发 Workbench 后重新验证）'}</p>
      {data.nodes.map(node => <p key={`${node.node_id}:${node.scout_process_generation}:${node.build.build_id}`}>
        Scout：<code>{node.node_id || '身份缺失'}</code> · build：<code>{node.build.build_id || '未记录'}</code>
        {' '}· 执行回执 {node.result_count} 条 · 设备 {node.devices.join('、') || '未记录'}
      </p>)}
      {!data.nodes.length && <p>尚无测试 Scout 的执行回执。</p>}
    </>}
    <p>此处核对当前会话的执行版本。正式 Scout 操作测试 Workbench 的完整链路、测试 MCP 全工具回归仍需分别验收。</p>
    <details>
      <summary>核对预期目标与查看提交引用</summary>
      <p>按测试计划填写预期值；当前实际值不会自动填为预期。</p>
      <form onSubmit={event => {
        event.preventDefault()
        if (JSON.stringify(expected) === JSON.stringify(draft)) void evidence.refetch()
        else setExpected({ ...draft })
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {fields.map(([key, label]) => <label key={key}>{label}<Input required aria-label={label} value={draft[key]}
            onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.value.trim() }))} /></label>)}
        </div>
        <Button htmlType="submit" loading={evidence.isFetching} style={{ marginTop: 12 }}>核对执行证据</Button>
        <Button disabled={!data || evidence.isError} onClick={() => void copyReference()} style={{ marginLeft: 8 }}>复制会话与 build 引用</Button>
      </form>
      {data?.issues.length ? <ul>{data.issues.map(issue => <li key={issue.code}>{issue.message}</li>)}</ul> : null}
      {data && <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(data.reference, null, 2)}</pre>}
    </details>
    {evidence.isError && <Button onClick={() => void evidence.refetch()}>重新读取证据</Button>}
  </section>
}
