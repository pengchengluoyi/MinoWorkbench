import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { Button, Form, Input, Modal, errText, useFeedback } from '@/ui'
import { createAppInProject, createProject } from '@/api/project'
import { APP_PLATFORM_OPTIONS, APP_PLATFORM_OPTIONS_ADVANCED } from '@/constants/appPlatforms'
import { projectKeys } from './queries'

export type CreateProjectRef = { id: string; name: string }
export type CreateKind =
  | { kind: 'project' }
  | { kind: 'app'; projects: CreateProjectRef[] }

/** 新建项目 / 新建应用。失败时弹窗不关、不清输入。 */
export function CreateDialog({
  target,
  onClose,
}: {
  target: CreateKind | null
  onClose: () => void
}) {
  const [form] = Form.useForm()
  const fb = useFeedback()
  const qc = useQueryClient()
  const [advanced, setAdvanced] = useState(false)

  const isProject = target?.kind === 'project'
  const projects = target?.kind === 'app' ? target.projects : []

  useEffect(() => {
    if (!target) return
    setAdvanced(false)
    form.setFieldsValue({
      name: '',
      description: '',
      platform: 'Mobile',
      projectId: target.kind === 'app' ? target.projects[0]?.id : undefined,
    })
  }, [target, form])

  const mutation = useMutation({
    mutationFn: async (values: { name: string; description?: string; platform?: string; projectId?: string }) => {
      if (!target) return
      if (target.kind === 'project') {
        return createProject({ name: values.name.trim(), description: values.description })
      }
      const projectId = values.projectId || target.projects[0]?.id
      if (!projectId) throw new Error('请选择项目')
      return createAppInProject(projectId, {
        name: values.name.trim(),
        description: values.description,
        platforms: values.platform,
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectKeys.all })
      fb.ok(target?.kind === 'project' ? '项目已创建' : '应用已创建')
      onClose()
    },
    onError: (e) => fb.fail(errText(e, '创建失败')),
  })

  const sole = projects.length === 1 ? projects[0] : null

  return (
    <Modal
      open={!!target}
      title={isProject ? '新建项目' : sole ? `在「${sole.name}」下新建应用` : '新建应用'}
      onCancel={onClose}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="ok" type="primary" loading={mutation.isPending} onClick={() => form.submit()}>
          创建
        </Button>,
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={(v) => mutation.mutate(v)}
      >
        {!isProject && projects.length > 1 && (
          <Form.Item name="projectId" label="项目" rules={[{ required: true, message: '请选择项目' }]}>
            <ChoiceGrid options={projects.map((p) => ({ value: p.id, label: p.name }))} />
          </Form.Item>
        )}
        <Form.Item
          name="name"
          label="名称"
          rules={[{ required: true, message: isProject ? '请输入项目名称' : '请输入应用名称' }]}
        >
          <Input placeholder={isProject ? '例如：电商主站' : '例如：买家 App'} autoFocus autoComplete="off" />
        </Form.Item>
        <Form.Item name="description" label="说明">
          <Input.TextArea rows={2} placeholder="可选" />
        </Form.Item>
        {!isProject && (
          <Form.Item name="platform" label="覆盖端" rules={[{ required: true, message: '请选择覆盖端' }]}>
            <PlatformPicker advanced={advanced} onToggleAdvanced={() => setAdvanced((v) => !v)} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}

function ChoiceGrid({
  value,
  onChange,
  options,
}: {
  value?: string
  onChange?: (next: string) => void
  options: { value: string; label: string; hint?: string }[]
}) {
  return (
    <div role="radiogroup" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {options.map((o) => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange?.(o.value)}
            className="w-hit"
            style={{
              textAlign: 'left',
              border: `1px solid ${on ? 'var(--w-primary)' : 'var(--w-border-strong)'}`,
              background: on ? 'var(--w-primary-soft)' : 'var(--w-surface)',
              color: on ? 'var(--w-primary)' : 'var(--w-text)',
              borderRadius: 'var(--w-radius-sm)',
              padding: '8px 10px',
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            {o.label}
            {o.hint && (
              <small style={{ display: 'block', fontWeight: 500, color: 'var(--w-text-tertiary)', fontSize: 'var(--w-font-meta)' }}>
                {o.hint}
              </small>
            )}
          </button>
        )
      })}
    </div>
  )
}

function PlatformPicker({
  value,
  onChange,
  advanced,
  onToggleAdvanced,
}: {
  value?: string
  onChange?: (next: string) => void
  advanced: boolean
  onToggleAdvanced: () => void
}) {
  const common = APP_PLATFORM_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
    hint: o.value === 'Mobile' ? 'Android 与 iOS' : o.value === 'Web' ? '浏览器' : '桌面',
  }))
  const extra = APP_PLATFORM_OPTIONS_ADVANCED.map((o) => ({ value: o.value, label: o.label }))

  return (
    <div>
      <ChoiceGrid value={value} onChange={onChange} options={common} />
      <button
        type="button"
        className="w-hit flex items-center gap-1"
        aria-expanded={advanced}
        onClick={onToggleAdvanced}
        style={{
          marginTop: 8,
          border: 'none',
          background: 'transparent',
          padding: '4px 2px',
          cursor: 'pointer',
          color: 'var(--w-text-secondary)',
          fontWeight: 650,
          fontSize: 'var(--w-font-sm)',
        }}
      >
        <ChevronRight size={13} aria-hidden className="w-fold-chevron" data-open={advanced ? 'true' : 'false'} />
        仅单端
      </button>
      {advanced && (
        <div style={{ marginTop: 8 }}>
          <ChoiceGrid value={value} onChange={onChange} options={extra} />
        </div>
      )}
    </div>
  )
}
