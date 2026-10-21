import { Sender } from '@ant-design/x'
import { useEffect, useRef, useState } from 'react'
import type { ClipboardEventHandler, RefObject, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AtSign, Check, ChevronDown, Search, ShieldCheck, UserPlus, Users, X } from 'lucide-react'
import { Button, Dropdown, errText } from '@/ui'
import { request } from '@/lib/request'

export interface WorkspaceMember {
  id: string; label: string; sender_name: string; summary: string; fixed: boolean; chat_jobs: string[]
  capabilities?: { id: string; label: string }[]; available?: boolean; unavailable_reason?: string
}
const colors = ['indigo', 'teal', 'amber', 'violet', 'blue']
export function MemberAvatar({ name, id }: { name: string; id: string }) {
  const color = colors[Array.from(id).reduce((sum, c) => sum + c.charCodeAt(0), 0) % colors.length]
  return <span aria-hidden="true" className={'workspace-person-avatar tone-' + color}>{name.slice(0, 1)}</span>
}

export function MemberText({ text, members }: { text: string; members: WorkspaceMember[] }) {
  const aliases = members.flatMap(m => [m.sender_name, m.label, m.id]).sort((a, b) => b.length - a.length)
  if (!aliases.length) return <>{text}</>
  const expression = new RegExp('(?<![A-Za-z0-9_.+\\-])(@(?:' + aliases.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + '))(?=$|[\\s，。！？,:：、;；])', 'g')
  return <>{text.split(expression).map((part, i) => {
    const member = part.startsWith('@') ? members.find(m => [m.id, m.sender_name, m.label].includes(part.slice(1))) : undefined
    return member ? <span className="workspace-mention" key={i}>@{member.sender_name}</span> : part
  })}</>
}

export function MemberEditor({ base, members, readOnly, change, mention, restoreDefaults }: {
  base: string; members: WorkspaceMember[]; readOnly: boolean
  change: (member: string, remove: boolean) => void; mention: (member: WorkspaceMember) => void; restoreDefaults: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const choices = useQuery({ queryKey: ['workspace-members', base],
    queryFn: async () => (await request<{ available: WorkspaceMember[]; roles?: WorkspaceMember[] }>({ url: base + '/members' })).data!, retry: false })
  const roles = choices.data?.roles || choices.data?.available || []
  const filtered = roles.filter(r => (r.label + r.summary + r.id).toLowerCase().includes(search.toLowerCase()))
  return <section className="workspace-people" aria-label="群成员">
    <div className="workspace-section-heading"><div><h3>协作成员 <span>{members.length}</span></h3><p>直接提问交给管家，输入 @ 指定成员回复。</p></div>
      <Button icon={<UserPlus size={15} />} disabled={readOnly} onClick={() => setAdding(!adding)}>{adding ? '收起目录' : '添加成员'}</Button></div>
    <div className="workspace-member-list">{members.map(member => <article className="workspace-member-row" key={member.id}>
      <MemberAvatar id={member.id} name={member.sender_name} />
      <div className="workspace-member-info"><div className="workspace-member-name"><strong>{member.sender_name}</strong>{member.fixed && <span className="workspace-role-tag"><ShieldCheck size={11} />管家 · 常驻</span>}</div>
        <p>{member.summary}</p><div className="workspace-capabilities">{(member.capabilities || []).map(c => <span key={c.id}>{c.label}</span>)}</div></div>
      <div className="workspace-member-actions"><Button type="text" aria-label={'提及' + member.sender_name} title={'提及' + member.sender_name} icon={<AtSign size={16} />} disabled={readOnly} onClick={() => mention(member)} />
        {!member.fixed && <Dropdown trigger={['click']} menu={{ items: [{ key: 'remove', label: '移出群聊', danger: true, disabled: readOnly, onClick: () => change(member.id, true) }] }}><Button type="text" aria-label={member.sender_name + '成员操作'} icon={<ChevronDown size={14} />} disabled={readOnly} /></Dropdown>}</div>
    </article>)}</div>
    <div className="workspace-defaults"><span>新对话自动加入服务端配置的默认成员</span><Button type="link" size="small" disabled={readOnly} onClick={restoreDefaults}>补齐默认成员</Button></div>
    {adding && <section className="workspace-role-directory" aria-label="角色目录">
      <div className="workspace-section-heading"><h3>角色目录 <span>{roles.length}</span></h3><Button type="text" aria-label="关闭角色目录" icon={<X size={15} />} onClick={() => setAdding(false)} /></div>
      <label className="workspace-member-search"><Search size={15} /><input aria-label="搜索角色" autoFocus placeholder="搜索名称或职责" value={search} onChange={e => setSearch(e.target.value)} /></label>
      {choices.isPending && <p role="status">正在读取角色目录…</p>}
      {choices.error && <p role="alert">{errText(choices.error)} <Button onClick={() => void choices.refetch()}>重试</Button></p>}
      {!choices.isPending && !choices.error && !filtered.length && <p className="workspace-no-results">没有匹配的角色，试试其他名称。</p>}
      {filtered.map(role => { const joined = members.some(m => m.id === role.id); const available = role.available !== false
        return <article className={'workspace-member-row' + (!available ? ' is-unavailable' : '')} key={role.id}>
          <MemberAvatar id={role.id} name={role.sender_name} /><div className="workspace-member-info"><strong>{role.sender_name}</strong><p>{role.summary}</p>{!available && <small>{role.unavailable_reason}</small>}</div>
          {joined ? <span className="workspace-joined"><Check size={13} />已加入</span> : <Button size="small" disabled={readOnly || !available} onClick={() => change(role.id, false)}>{available ? '加入' : '暂不可用'}</Button>}
        </article>
      })}
    </section>}
  </section>
}

export function MentionInput({ value, onChange, members, disabled, onSend, onPaste, inputRef, footer, header, sendDisabled, loading }: {
  value: string; onChange: (value: string) => void; members: WorkspaceMember[]; disabled: boolean
  footer?: ReactNode; header?: ReactNode; sendDisabled?: boolean; loading?: boolean
  onSend: () => void; onPaste: ClipboardEventHandler<HTMLTextAreaElement>; inputRef: RefObject<HTMLTextAreaElement | null>
}) {
  const [caret, setCaret] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const before = value.slice(0, caret)
  const start = before.lastIndexOf('@')
  const query = before.slice(start + 1)
  // A completed mention is no longer a search token, even as the user keeps typing.
  const completed = members.some(m => [m.sender_name, m.label, m.id].some(name => query.startsWith(name) && /^\s/.test(query.slice(name.length))))
  const open = !completed && !disabled && !dismissed && start >= 0 && (start === 0 || !/[A-Za-z0-9_.+-]/.test(before[start - 1])) && !query.includes('\n') && query.length < 50
  const matches = members.filter(m => [m.sender_name, m.label, m.id].some(v => v.toLowerCase().includes(query.toLowerCase())))
  const selected = Math.min(active, Math.max(0, matches.length - 1))
  useEffect(() => { if (open) listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [open, selected])
  const pick = (member: WorkspaceMember) => {
    const token = '@' + member.sender_name + ' '
    const next = value.slice(0, start) + token + value.slice(caret)
    onChange(next); setDismissed(true)
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(start + token.length, start + token.length) })
  }
  const openMenu = () => {
    const position = inputRef.current?.selectionStart ?? value.length
    const end = inputRef.current?.selectionEnd ?? position
    const prefix = position && !/\s/.test(value[position - 1]) ? ' @' : '@'
    onChange(value.slice(0, position) + prefix + value.slice(end))
    setCaret(position + prefix.length); setDismissed(false); setActive(0)
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(position + prefix.length, position + prefix.length) })
  }
  return <div className="workspace-mention-input" onSelectCapture={event => {
    if (event.target instanceof HTMLTextAreaElement) setCaret(event.target.selectionStart)
  }}>
    {open && <div className="workspace-mention-menu"><header><Users size={14} /><strong>提及群成员</strong><span>↑↓ 选择 · Enter 确认</span></header>
      <div role="listbox" id="workspace-mention-options" aria-label="选择提及成员" ref={listRef}>
        {matches.map((m, index) => <button type="button" role="option" id={'workspace-mention-' + index} aria-selected={index === selected} key={m.id} onMouseDown={e => e.preventDefault()} onClick={() => pick(m)}>
          <MemberAvatar id={m.id} name={m.sender_name} /><span><strong>{m.sender_name}</strong><small>{m.summary}</small></span>{index === selected && <span className="workspace-mention-enter">↵</span>}
        </button>)}
        {!matches.length && <p className="workspace-no-results">没有匹配的群成员，可到成员页添加。</p>}
      </div></div>}
    <Sender ref={sender => {
      const input = sender?.nativeElement.querySelector('textarea') || null
      inputRef.current = input
      if (input) {
        input.setAttribute('aria-label', '工作区消息')
        input.setAttribute('role', 'combobox')
        input.setAttribute('aria-autocomplete', 'list')
        input.setAttribute('aria-expanded', String(open))
        if (open) input.setAttribute('aria-controls', 'workspace-mention-options')
        else input.removeAttribute('aria-controls')
        if (open && matches.length) input.setAttribute('aria-activedescendant', 'workspace-mention-' + selected)
        else input.removeAttribute('aria-activedescendant')
      }
    }}
      value={value} disabled={disabled} loading={loading} submitType={false}
      placeholder="输入消息，@ 提及成员"
      autoSize={{ minRows: 2, maxRows: 6 }}
      onPaste={event => onPaste(event as React.ClipboardEvent<HTMLTextAreaElement>)}
      onBlur={() => setDismissed(true)}
      onChange={(next, event) => { onChange(next); setCaret((event?.target as HTMLTextAreaElement | undefined)?.selectionStart ?? next.length); setDismissed(false); setActive(0) }}
      prefix={<Button type="text" aria-label="提及成员" title="提及成员" disabled={disabled} icon={<AtSign size={17} />} onMouseDown={e => e.preventDefault()} onClick={openMenu} />}
      footer={footer} header={header}
      actions={(_, { components: { SendButton } }) => <SendButton aria-label="发送" shape="default" icon={null} disabled={sendDisabled || disabled} loading={loading} onClick={onSend}>发送</SendButton>}
      onKeyDown={e => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return
        if (open) {
          if (e.key === 'Escape') { e.preventDefault(); setDismissed(true); return }
          if (matches.length && ['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); setActive((selected + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length); return }
          if (['Enter', 'Tab'].includes(e.key) && !e.shiftKey) { e.preventDefault(); if (matches.length) pick(matches[selected]); return }
        }
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() }
      }} />

  </div>
}
