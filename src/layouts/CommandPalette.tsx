import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/lib/session'
import { isAdmin } from '@/lib/iam'
import { useProjects } from '@/domains/testing/apps/queries'

interface Command {
  id: string
  label: string
  hint?: string
  to: string
}

const STATIC: Command[] = [
  { id: 'projects', label: '项目', hint: '工作台', to: '/testing' },
  { id: 'assistant', label: '我的助手', hint: '设置', to: '/assistant' },
  { id: 'nodes', label: 'Scout 节点', hint: '设置', to: '/settings/runtime' },
  { id: 'keys', label: '模型密钥', hint: '设置', to: '/settings/keys' },
  { id: 'health', label: '运行状态', hint: '管理后台', to: '/admin/health' },
  { id: 'audit', label: '操作记录', hint: '管理后台', to: '/audit' },
  { id: 'integrations', label: '集成配置', hint: '管理后台', to: '/integrations' },
]

/**
 * ⌘K 命令面板。跳页面、跳项目。
 * 高密度工作台里，导航折叠之后这是最快的路，不靠装饰动效。
 */
export function CommandPalette() {
  const navigate = useNavigate()
  const role = useSession((state) => state.role)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const projects = useProjects()
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!open) return; const previous = document.activeElement as HTMLElement | null; return () => previous?.focus() }, [open])

  const commands = useMemo(() => {
    const entries: Command[] = []
    for (const project of projects.data || []) {
        const params = new URLSearchParams({
          tab: project.apps?.length ? 'cases' : 'config',
          ...(project.apps?.length ? {} : { configView: 'apps' }),
        })
        entries.push({
          id: `project-${project.id}`,
          label: project.name || project.id,
          hint: '项目',
          to: `/testing/projects/${encodeURIComponent(project.id)}?${params.toString()}`,
        })
    }
    const all = [...STATIC.filter((command) => command.hint !== '管理后台' || isAdmin(role)), ...entries]
    const needle = q.trim().toLowerCase()
    if (!needle) return all.slice(0, 12)
    return all.filter((c) => `${c.label} ${c.hint || ''}`.toLowerCase().includes(needle)).slice(0, 12)
  }, [projects.data, q, role])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
        setQ('')
        setCursor(0)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { setCursor(0) }, [q])

  if (!open) return null

  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      onKeyDown={event => {
        if (event.key !== 'Tab') return
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input,button,[tabindex="0"]') || [])
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }}
      aria-label="命令面板"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--w-z-modal)',
        background: 'var(--w-scrim)',
        display: 'flex',
        justifyContent: 'center',
        paddingTop: '14vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, calc(100vw - 32px))',
          background: 'var(--w-surface)',
          border: '1px solid var(--w-border)',
          borderRadius: 'var(--w-radius-lg)',
          boxShadow: 'var(--w-shadow-lg)',
          overflow: 'hidden',
        }}
      >
        <input
          autoFocus
          value={q}
          placeholder="跳转到页面或项目"
          aria-label="搜索命令"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setCursor((i) => Math.min(commands.length - 1, i + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setCursor((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter' && commands[cursor]) {
              go(commands[cursor].to)
            }
          }}
          style={{
            width: '100%',
            border: 'none',
            outline: 'none',
            padding: '14px 16px',
            fontSize: 'var(--w-font-title)',
            background: 'transparent',
            color: 'var(--w-text)',
          }}
        />
        <p style={{ margin: '4px 16px', color: 'var(--w-text-tertiary)', fontSize: 12 }}>最多显示 12 个匹配结果，可继续输入缩小范围。</p>
        <div style={{ borderTop: '1px solid var(--w-border)', maxHeight: 320, overflow: 'auto' }}>
          {!commands.length && (
            <div style={{ padding: 16, color: 'var(--w-text-tertiary)', fontSize: 'var(--w-font-sm)' }}>没有匹配的去向</div>
          )}
          {commands.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className="w-hit flex w-full items-center gap-2"
              data-active={i === cursor ? 'true' : 'false'}
              onMouseEnter={() => setCursor(i)}
              onClick={() => go(c.to)}
              style={{
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                padding: '8px 16px',
                background: i === cursor ? 'var(--w-fill)' : 'transparent',
                color: 'var(--w-text)',
                fontSize: 'var(--w-font-base)',
              }}
            >
              <span className="truncate" style={{ flex: 1, fontWeight: 650 }}>{c.label}</span>
              {c.hint && <span style={{ color: 'var(--w-text-quaternary)', fontSize: 'var(--w-font-sm)' }}>{c.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
