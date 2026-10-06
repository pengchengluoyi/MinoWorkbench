import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Input, Form } from '@/ui'
import { useFeedback, errText } from '@/ui'
import { loginAccount } from '@/api/auth'
import { useSession } from '@/lib/session'
import { persistAuthTokens } from '@/lib/tokens'
import { connectRealtime } from '@/lib/realtime'
import { AuthShell } from './AuthShell'

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
      const from = (location.state as { from?: string } | null)?.from
      navigate(from || '/testing', { replace: true })
    } catch (e) {
      fb.fail(errText(e, '登录失败，检查账号密码或 Nexus 是否可达'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <h1 style={{ margin: '0 0 4px', fontSize: 'var(--w-font-h2)', fontWeight: 800, color: 'var(--w-text)' }}>
        登录
      </h1>
      <p style={{ margin: '0 0 18px', fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)', lineHeight: 'var(--w-line-relaxed)' }}>
使用 Nexus 账号。连不上时，先核对底部地址。
      </p>

      <Form layout="vertical" onFinish={onSubmit} requiredMark={false} disabled={loading}>
        <Form.Item
          name="account"
          label="账号"
          rules={[{ required: true, message: '请输入账号或邮箱' }]}
        >
          <Input placeholder="邮箱或用户名" autoComplete="username" size="large" autoFocus />
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
    </AuthShell>
  )
}
