import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from 'antd'
import { TriangleAlert } from 'lucide-react'

interface Props { children: ReactNode; label?: string }
interface State { error: Error | null }

/**
 * 面板级错误边界（手册 §7.4）。
 * 一个面板炸了不该整页白屏——原项目没有这层，一个渲染异常全页没了。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', this.props.label || '', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div
        className="flex flex-col items-center justify-center text-center"
        style={{ padding: '40px 20px', gap: 'var(--w-space-3)' }}
      >
        <TriangleAlert size={28} strokeWidth={1.5} style={{ color: 'var(--w-fail)' }} />
        <div style={{ fontSize: 'var(--w-font-base)', fontWeight: 700, color: 'var(--w-text)' }}>
          {this.props.label ? `${this.props.label} 渲染失败` : '这块内容渲染失败'}
        </div>
        <div
          className="w-mono"
          style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)', maxWidth: 520, overflowWrap: 'anywhere' }}
        >
          {error.message}
        </div>
        <Button size="small" onClick={() => this.setState({ error: null })}>重试</Button>
      </div>
    )
  }
}
