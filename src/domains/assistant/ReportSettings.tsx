import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Skeleton, errText, useFeedback } from '@/ui'
import { getReportSettings, saveReportSettings } from '@/api/assistant'
import { assistantKeys } from './queries'
import { QueryProblem } from './AssistantNotReady'

export function ReportSettings() {
  const qc = useQueryClient()
  const feedback = useFeedback()
  const queryKey = [...assistantKeys.all, 'report-settings']
  const settings = useQuery({ queryKey, queryFn: getReportSettings })
  const [address, setAddress] = useState('')
  useEffect(() => {
    if (settings.data) setAddress(settings.data.workbench_url || settings.data.effective_url)
  }, [settings.data])
  const save = useMutation({
    mutationFn: saveReportSettings,
    onSuccess: (value) => { qc.setQueryData(queryKey, value); feedback.ok('报告地址已更新') },
    onError: (error) => feedback.fail(errText(error)),
  })
  const host = window.location.hostname
  const currentIsLan = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
  return <section className="w-surface-card" style={{ padding: 18 }}>
    <strong>测试报告链接</strong>
    <p style={{ color: 'var(--w-text-tertiary)', fontSize: 13 }}>任务结果通知会链接到对应任务或用例详情，打开后沿用 Workbench 登录和访问权限。</p>
    {settings.isLoading ? <Skeleton active paragraph={{ rows: 2 }} /> : settings.isError ?
      <QueryProblem error={settings.error} what="报告地址" onRetry={() => void settings.refetch()} /> : <>
      <label htmlFor="report-workbench-url" style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>Workbench 内网访问地址</label>
      <div className="flex flex-wrap gap-2">
        <Input id="report-workbench-url" aria-label="Workbench 内网访问地址" value={address} disabled={save.isPending}
          placeholder="http://192.168.1.20:5273" style={{ maxWidth: 460 }} onChange={(event) => setAddress(event.target.value)} />
        <Button type="primary" loading={save.isPending} onClick={() => save.mutate(address)}>保存报告地址</Button>
        <Button disabled={!currentIsLan || save.isPending} onClick={() => setAddress(window.location.origin)}>使用当前网页地址</Button>
        {settings.data?.workbench_url ? <Button disabled={save.isPending} onClick={() => save.mutate('')}>恢复默认</Button> : null}
      </div>
      <p style={{ marginBottom: 0, fontSize: 13, color: 'var(--w-text-tertiary)', overflowWrap: 'anywhere' }}>
        {settings.data?.available ? `当前报告入口：${settings.data.effective_url}` : '未取得可用内网地址，请填写可从 IM 所在设备访问的 Workbench 地址。'}
        {settings.data?.source === 'lan_default' ? ' 默认按 Nexus 所在机器的内网 IP 与 Workbench 5273 端口生成；分机或反向代理部署请修改。' : ''}
      </p>
      {!currentIsLan ? <p style={{ fontSize: 13, color: 'var(--w-text-tertiary)' }}>当前网页地址无法作为内网报告入口，请填写 Workbench 的内网 IP 和实际端口。</p> : null}
    </>}
  </section>
}
