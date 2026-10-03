import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Input, Form } from '@/ui'
import { useFeedback, errText } from '@/ui'
import { loginAccount } from '@/api/auth'
import { useSession } from '@/lib/session'
import { persistAuthTokens } from '@/lib/tokens'
import { connectRealtime } from '@/lib/realtime'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { refresh } = useSession()
  const fb = useFeedback()
  const [loading, setLoading] = useState(false)

  const onSubmit = async (values: { account: string; password: string }) => {
    setLoading(true)
    try {
      const res = await loginAccount(values.account, values.password)

      // 登录响应自带 token / ws_token，必须先落盘：
      // 后续的 /auth/status 要靠这个 Authorization 头，否则会被当匿名请求。
      persistAuthTokens(res?.data)

      const ok = await refresh()
      if (!ok) {
        throw new Error('账号密码对了，但读取登录状态失败。请重试，或确认 Nexus 的 /auth/status 是否正常。')
      }

      // 执行链路的实时推送走这个通道，登录后即连
      connectRealtime(res?.data?.ws_token)
      const from = (location.state as any)?.from
      navigate(from || '/testing', { replace: true })
    } catch (e) {
      fb.fail(errText(e, '登录失败，检查账号密码或 Nexus 是否可达'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center" style={{ padding: 24 }}>
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          padding: 28,
          background: 'var(--w-surface)',
          border: '1px solid var(--w-border)',
          borderRadius: 'var(--w-radius-xl)',
          boxShadow: 'var(--w-shadow)',
        }}
      >
        <div className="flex items-center gap-3" style={{ marginBottom: 20 }}>
          <div
            className="flex items-center justify-center"
            style={{
              width: 32, height: 32, borderRadius: 9,
              background: 'var(--w-primary)', color: '#fff', fontSize: 12, fontWeight: 800,
            }}
          >
            MW
          </div>
          <div>
            <strong style={{ display: 'block', fontSize: 'var(--w-font-title)', color: 'var(--w-text)' }}>
              Mino Workbench
            </strong>
            <span style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>
              测试工作台与管理后台
            </span>
          </div>
        </div>

        <Form layout="vertical" onFinish={onSubmit} requiredMark={false} disabled={loading}>
          <Form.Item
            name="account"
            label="账号"
            rules={[{ required: true, message: '请输入账号或邮箱' }]}
          >
            <Input placeholder="邮箱或用户名" autoComplete="username" size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="密码" autoComplete="current-password" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            登录
          </Button>
        </Form>
      </div>
    </div>
  )
}
