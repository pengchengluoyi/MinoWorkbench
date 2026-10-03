import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Form, Input, Modal, Select, errText, useFeedback } from '@/ui'
import { createAppInProject, createProject } from '@/api/project'
import { APP_PLATFORM_OPTIONS, APP_PLATFORM_OPTIONS_ADVANCED } from '@/constants/appPlatforms'
import { projectKeys } from './queries'

export type CreateKind = { kind: 'project' } | { kind: 'app'; projectId: string; projectName: string }

/** 新建项目 / 新建应用。失败时弹窗不关、不清输入（契约「交互」节）。 */
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

  useEffect(() => {
    if (target) form.resetFields()
  }, [target, form])

  const mutation = useMutation({
    mutationFn: async (values: { name: string; description?: string; platform?: string }) => {
      if (!target) return
      if (target.kind === 'project') {
        return createProject({ name: values.name.trim(), description: values.description })
      }
      return createAppInProject(target.projectId, {
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

  const isProject = target?.kind === 'project'

  return (
    <Modal
      open={!!target}
      title={isProject ? '新建项目' : `在「${target?.kind === 'app' ? target.projectName : ''}」下新建应用`}
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
        initialValues={{ platform: 'Mobile' }}
        onFinish={(v) => mutation.mutate(v)}
      >
        <Form.Item
          name="name"
          label="名称"
          rules={[{ required: true, message: isProject ? '请输入项目名称' : '请输入应用名称' }]}
        >
          <Input placeholder={isProject ? '例如：电商主站' : '例如：买家 App'} autoFocus />
        </Form.Item>
        <Form.Item name="description" label="说明">
          <Input.TextArea rows={2} placeholder="可选" />
        </Form.Item>
        {!isProject && (
          <Form.Item name="platform" label="覆盖端" rules={[{ required: true, message: '请选择覆盖端' }]}>
            <Select
              options={[
                {
                  label: '常用',
                  options: APP_PLATFORM_OPTIONS.map((o) => ({
                    value: o.value,
                    label: `${o.icon} ${o.label}${o.desc ? ` · ${o.desc}` : ''}`,
                  })),
                },
                {
                  label: '仅单端',
                  options: APP_PLATFORM_OPTIONS_ADVANCED.map((o) => ({
                    value: o.value,
                    label: `${o.icon} ${o.label}`,
                  })),
                },
              ]}
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}
