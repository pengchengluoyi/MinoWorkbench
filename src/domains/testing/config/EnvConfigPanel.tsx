import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RotateCcw, Save, Trash2, TriangleAlert } from 'lucide-react'
import { Button, EmptyState, Input, Skeleton, Tooltip, errText, useFeedback } from '@/ui'
import {
  channelField, getProjectEnv, normalizeEnvDoc, readCell, updateProjectEnv,
  type EnvChannel, type EnvProfiles,
} from '@/api/projectEnv'
import { unwrapOne } from '@/lib/unwrap'

/**
 * 环境配置。
 *
 * 数据本身是 环境 × 端 的二维映射（profiles[env][channel][field]），
 * 所以界面就做成可编辑网格 —— 行是环境（test / prod…），列是端（Android / iOS / Web）。
 * 一屏看完所有环境所有端，比"一个环境一张卡片"省得多。
 */
export function EnvConfigPanel() {
  const [params] = useSearchParams()
  const projectId = params.get('projectId') || ''
  const fb = useFeedback()
  const qc = useQueryClient()

  const envQuery = useQuery({
    queryKey: ['project', projectId, 'env'],
    enabled: !!projectId,
    queryFn: async () => normalizeEnvDoc(unwrapOne(await getProjectEnv(projectId))),
  })

  const [draft, setDraft] = useState<EnvProfiles>({})
  const [channels, setChannels] = useState<EnvChannel[]>([])
  const [newProfile, setNewProfile] = useState('')

  // 接口回来后灌入草稿；之后以草稿为准，不被轮询覆盖
  useEffect(() => {
    if (envQuery.data) {
      setDraft(envQuery.data.profiles)
      setChannels(envQuery.data.channels)
    }
  }, [envQuery.data])

  const profileNames = useMemo(() => Object.keys(draft).sort(), [draft])

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(envQuery.data?.profiles ?? {}),
    [draft, envQuery.data],
  )

  const save = useMutation({
    mutationFn: () => updateProjectEnv(projectId, { profiles: draft, channels }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['project', projectId, 'env'] })
      fb.ok('环境配置已保存')
    },
    onError: (e) => fb.fail(errText(e, '保存失败')),
  })

  const setCell = (profile: string, c: EnvChannel, value: string) => {
    setDraft((prev) => ({
      ...prev,
      [profile]: { ...prev[profile], [c.id]: { ...prev[profile]?.[c.id], [channelField(c)]: value } },
    }))
  }

  const addProfile = () => {
    const name = newProfile.trim()
    if (!name) return
    if (draft[name]) return fb.warn(`环境「${name}」已存在`)
    setDraft((prev) => ({
      ...prev,
      [name]: Object.fromEntries(channels.map((c) => [c.id, { [channelField(c)]: '' }])),
    }))
    setNewProfile('')
  }

  const removeProfile = async (name: string) => {
    const ok = await fb.confirm({
      title: `删除环境「${name}」？`,
      content: '保存后生效。已经引用这个环境的用例会失去对应配置。',
      danger: true,
      okText: '删除',
    })
    if (!ok) return
    setDraft((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  if (!projectId) {
    return (
      <Card>
        <EmptyState
          icon={<TriangleAlert size={28} strokeWidth={1.5} style={{ color: 'var(--w-warn)' }} />}
          title="缺少项目信息"
          hint="环境配置挂在项目下，这个链接里没有 projectId。从应用列表重新进入即可。"
        />
      </Card>
    )
  }

  if (envQuery.isLoading) return <Skeleton active paragraph={{ rows: 7 }} title={{ width: 160 }} />

  if (envQuery.isError) {
    return (
      <Card>
        <EmptyState
          icon={<TriangleAlert size={28} strokeWidth={1.5} style={{ color: 'var(--w-fail)' }} />}
          title="读取环境配置失败"
          hint={errText(envQuery.error, '确认 Nexus 可达。')}
          action={<Button size="small" onClick={() => void envQuery.refetch()}>重试</Button>}
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--w-space-3)', minHeight: 0 }}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 style={{ margin: 0, fontSize: 'var(--w-font-h2)', fontWeight: 800, color: 'var(--w-text)' }}>
          环境配置
        </h2>
        <span style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-quaternary)' }}>
          {profileNames.length} 个环境 · {channels.length} 个端
        </span>
        <span style={{ flex: 1 }} />
        {dirty && (
          <>
            <span style={{ fontSize: 'var(--w-font-meta)', fontWeight: 700, color: 'var(--w-warn)' }}>
              有未保存的改动
            </span>
            <Tooltip title="放弃改动">
              <Button
                size="small"
                icon={<RotateCcw size={13} />}
                onClick={() => setDraft(envQuery.data?.profiles ?? {})}
                aria-label="放弃改动"
              />
            </Tooltip>
          </>
        )}
        <Button
          type="primary"
          size="small"
          icon={<Save size={13} />}
          loading={save.isPending}
          disabled={!dirty}
          onClick={() => save.mutate()}
        >
          保存
        </Button>
      </div>

      {!profileNames.length ? (
        <Card>
          <EmptyState
            title="还没有环境"
            hint="环境用来区分 test / staging / prod 等不同目标。下面加一个开始。"
          />
        </Card>
      ) : (
        <div
          style={{
            background: 'var(--w-surface)',
            border: '1px solid var(--w-border)',
            borderRadius: 'var(--w-radius-lg)',
            overflow: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead>
              <tr>
                <Th style={{ width: 140, position: 'sticky', left: 0, background: 'var(--w-surface-hover)' }}>环境</Th>
                {channels.map((c) => (
                  <Th key={c.id}>
                    {c.label || c.id}
                    <span style={{ marginLeft: 6, fontWeight: 600, color: 'var(--w-text-quaternary)', fontSize: 'var(--w-font-meta)' }}>
                      {channelField(c)}
                    </span>
                  </Th>
                ))}
                <Th style={{ width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {profileNames.map((name) => (
                <tr key={name}>
                  <Td style={{ position: 'sticky', left: 0, background: 'var(--w-surface)', fontWeight: 650 }}>
                    {name}
                  </Td>
                  {channels.map((c) => (
                    <Td key={c.id}>
                      <Input
                        size="small"
                        variant="borderless"
                        value={readCell(draft, name, c)}
                        onChange={(e) => setCell(name, c, e.target.value)}
                        placeholder={channelField(c)}
                        style={{ fontFamily: 'var(--w-font-mono)', fontSize: 'var(--w-font-sm)' }}
                      />
                    </Td>
                  ))}
                  <Td>
                    <Tooltip title="删除这个环境">
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<Trash2 size={13} />}
                        onClick={() => void removeProfile(name)}
                        aria-label={`删除环境 ${name}`}
                      />
                    </Tooltip>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          size="small"
          placeholder="新环境名，例如 staging"
          value={newProfile}
          onChange={(e) => setNewProfile(e.target.value)}
          onPressEnter={addProfile}
          style={{ width: 200 }}
        />
        <Button size="small" icon={<Plus size={13} />} disabled={!newProfile.trim()} onClick={addProfile}>
          添加环境
        </Button>
      </div>
    </div>
  )
}

const Th = ({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) => (
  <th
    style={{
      textAlign: 'left',
      padding: 'var(--w-cell-padding-y) var(--w-cell-padding-x)',
      fontSize: 'var(--w-font-meta)',
      fontWeight: 700,
      color: 'var(--w-text-tertiary)',
      borderBottom: '1px solid var(--w-border)',
      background: 'var(--w-surface-hover)',
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {children}
  </th>
)

const Td = ({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) => (
  <td
    style={{
      padding: '2px var(--w-space-2)',
      borderBottom: '1px solid var(--w-border)',
      fontSize: 'var(--w-font-sm)',
      color: 'var(--w-text)',
      ...style,
    }}
  >
    {children}
  </td>
)

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)' }}>
      {children}
    </div>
  )
}
