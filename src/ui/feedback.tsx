import { App as AntApp } from 'antd'
import type { ReactNode } from 'react'

/**
 * antd 5 的 message / Modal / notification 静态方法拿不到主题和 context，
 * 必须通过 App.useApp() 取实例。这里收一个统一出口：
 * 业务只用 useFeedback()，不许静态 import message。
 */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  return <AntApp component={false}>{children}</AntApp>
}

export function useFeedback() {
  const { message, modal, notification } = AntApp.useApp()

  return {
    ok: (content: ReactNode) => message.success(content),
    warn: (content: ReactNode) => message.warning(content),
    /** 读接口失败走这里，统一前缀，便于用户分辨是"没数据"还是"读失败" */
    fail: (content: ReactNode) => message.error(content),
    info: (content: ReactNode) => message.info(content),
    loading: (content: ReactNode) => message.loading(content),

    confirm: (opts: {
      title: ReactNode
      content?: ReactNode
      okText?: string
      cancelText?: string
      danger?: boolean
    }) =>
      new Promise<boolean>((resolve) => {
        modal.confirm({
          title: opts.title,
          content: opts.content,
          okText: opts.okText ?? '确定',
          cancelText: opts.cancelText ?? '取消',
          okButtonProps: opts.danger ? { danger: true } : undefined,
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        })
      }),

    notify: notification,
  }
}

const textOf = (value: unknown): string => {
  if (value == null || value === '') return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === 'object' && 'msg' in item) return String((item as { msg?: unknown }).msg || '')
      return textOf(item)
    }).filter(Boolean).join('；')
  }
  return ''
}

/** 从 axios 错误里抠出能给人看的文案。Nexus 的报错在 detail 里。校验失败时 detail 是对象数组，必须收成字符串，否则提示组件会把整页打白。 */
export const errText = (e: unknown, fallback = '操作失败'): string => {
  const any = e as { response?: { data?: { detail?: unknown; message?: unknown } }; message?: unknown }
  return textOf(any?.response?.data?.detail) || textOf(any?.response?.data?.message) || textOf(any?.message) || fallback
}
