import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button, Input, Form } from '@/ui'
import { errText } from '@/ui'
import { loginAccount } from '@/api/auth'
import { useSession } from '@/lib/session'
import { persistAuthTokens } from '@/lib/tokens'
import { connectRealtime } from '@/lib/realtime'
import { AuthShell } from './AuthShell'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { refresh } = useSession()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [form] = Form.useForm()
  const state = location.state as { from?: string; email?: string; registered?: boolean } | null

  const onSubmit = async (values: { account: string; password: string }) => {
    setLoading(true)
    setError('')
    try {
      const res = accepted ? null : await loginAccount(values.account, values.password)

      // 登录响应自带 token / ws_token，必须先落盘：
      // 后续的 /auth/status 要靠这个 Authorization 头，否则会被当匿名请求。
      if (res) { persistAuthTokens(res.data); setAccepted(true) }

      const ok = await refresh()
      if (!ok) {
        throw new Error('登录请求已返回，但身份尚未确认。请继续确认身份，或检查服务连接。')
      }

      // 执行链路的实时推送走这个通道，登录后即连
      connectRealtime(res?.data?.ws_token)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from || '/testing', { replace: true })
    } catch (e) {
      setError(errText(e, '登录或身份确认失败，请核对连接与账号状态'))
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

      {state?.registered ? <p role="status" style={{ color: 'var(--w-pass)' }}>注册成功，请登录。</p> : null}
      {error && <p role="alert" style={{ color: 'var(--w-fail)' }}>{error}</p>}
      {accepted && <p role="status">登录请求已受理，继续确认身份不会重新提交密码。</p>}
      <Form form={form} initialValues={{ account: state?.email || '' }} layout="vertical" onFinish={onSubmit} requiredMark={false} disabled={loading}>
        <Form.Item
          name="account"
          label="账号"
          rules={[{ required: true, message: '请输入账号或邮箱' }]}
        >
          <Input placeholder="邮箱或用户名" autoComplete="username" size="large" disabled={accepted} autoFocus />
        </Form.Item>
        <Form.Item
          name="password"
          label="密码"
          rules={[{ required: true, message: '请输入密码' }]}
        >
          <Input.Password placeholder="密码" autoComplete="current-password" size="large" disabled={accepted} />
        </Form.Item>
        <Button type="primary" htmlType="submit" block size="large" loading={loading}>
          {accepted ? '继续确认身份' : '登录'}
        </Button>
      </Form>
      {accepted && <Button type="link" disabled={loading} onClick={() => { setAccepted(false); setError('') }}>重新填写账号密码</Button>}
      <p style={{ margin: '16px 0 0', textAlign: 'center' }}><Link to="/register" state={{ from: state?.from }}>注册账号</Link></p>
    </AuthShell>
  )
}
