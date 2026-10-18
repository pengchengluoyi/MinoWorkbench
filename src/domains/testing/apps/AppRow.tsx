import { Link } from 'react-router-dom'
import { Folder, Activity } from 'lucide-react'
import type { ProjectRow as Project } from '@/types/project'

export function ProjectRow({ project, running, recent, focused, href, onHover, onOpen }: {
  project: Project; running: number; recent: boolean; focused: boolean; href: string; onHover: () => void; onOpen: () => void
}) {
  return <Link to={href} onClick={onOpen} onMouseEnter={onHover} data-focus={focused ? 'true' : 'false'} className="w-app-row w-hit" title={project.name}>
    <span className="min-w-0 flex items-center gap-2"><Folder size={16} /><strong className="truncate">{project.name || '未命名项目'}</strong>{recent && <small>最近</small>}</span>
    <span className="truncate" style={{ color: 'var(--w-text-tertiary)' }}>{project.description || '在配置中管理应用与环境'}</span>
    <span style={{ color: 'var(--w-pass)' }}>{running > 0 && <><Activity size={12} className="inline" /> {running} 执行中</>}</span>
    <span style={{ textAlign: 'right', color: focused ? 'var(--w-primary)' : 'var(--w-text-tertiary)' }}>{focused ? '进入' : '›'}</span>
  </Link>
}
