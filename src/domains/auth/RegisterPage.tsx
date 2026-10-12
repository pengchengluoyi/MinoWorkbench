import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button, Form, Input, errText } from '@/ui'
import { registerAccount } from '@/api/auth'
import { AuthShell } from './AuthShell'

export function RegisterPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const onSubmit = async ({ email, password }: { email: string; password: string }) => {
    setLoading(true)
    setError('')
    const normalized = email.trim().toLowerCase()
    try {
      await registerAccount(normalized, password)
      navigate('/login', { replace: true, state: { ...(location.state || {}), email: normalized, registered: true } })
    } catch (failure) {
      const message = errText(failure, '注册失败，请重试')
      if (/邮箱/.test(message)) form.setFields([{ name: 'email', errors: [message] }])
      else if (/密码/.test(message)) form.setFields([{ name: 'password', errors: [message] }])
      else setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <h1 style={{ margin: '0 0 4px', fontSize: 'var(--w-font-h2)', fontWeight: 800 }}>注册账号</h1>
      <p style={{ margin: '0 0 18px', color: 'var(--w-text-tertiary)' }}>使用邮箱和密码创建 Nexus 账号。</p>
      <Form form={form} layout="vertical" requiredMark={false} disabled={loading} onFinish={onSubmit}>
        <Form.Item name="email" label="邮箱" normalize={(value: string) => value.trim()} rules={[
          { required: true, message: '请输入邮箱' },
          { pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: '请填写有效邮箱' },
        ]}>
          <Input size="large" autoFocus autoComplete="email" placeholder="邮箱" />
        </Form.Item>
        <Form.Item name="password" label="密码" rules={[
          { required: true, message: '请输入密码' },
          { min: 8, message: '密码至少 8 位' },
        ]}>
          <Input.Password size="large" autoComplete="new-password" placeholder="至少 8 位" />
        </Form.Item>
        <Form.Item name="confirm" label="确认密码" dependencies={['password']} rules={[
          { required: true, message: '请再次输入密码' },
          ({ getFieldValue }) => ({ validator: (_, value) => !value || value === getFieldValue('password')
            ? Promise.resolve() : Promise.reject(new Error('两次输入的密码不一致')) }),
        ]}>
          <Input.Password size="large" autoComplete="new-password" placeholder="再次输入密码" />
        </Form.Item>
        {error ? <p role="alert" style={{ color: 'var(--w-fail)' }}>{error}</p> : null}
        <Button type="primary" htmlType="submit" block size="large" loading={loading}>注册账号</Button>
      </Form>
      <p style={{ margin: '16px 0 0', textAlign: 'center' }}><Link to="/login" state={location.state}>返回登录</Link></p>
    </AuthShell>
  )
}
