import { useEffect, useId, useSyncExternalStore } from 'react'
import { useBlocker } from 'react-router-dom'
import { App as AntApp } from 'antd'
const drafts = new Set<string>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(fn => fn())
export function useUnsavedChanges(dirty: boolean) {
 const id = useId()
 useEffect(() => { if (dirty) drafts.add(id); else drafts.delete(id); notify(); return () => { drafts.delete(id); notify() } }, [dirty, id])
}
export function DraftNavigationGuard() {
 const { modal } = AntApp.useApp()
 const dirty = useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => drafts.size > 0)
 const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search))
 useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn) }, [dirty])
 useEffect(() => { if (blocker.state !== 'blocked') return; const dialog = modal.confirm({ styles: { header: { display: 'none' } }, title: '有尚未保存的修改', content: '留在当前页可以继续编辑和保存；离开会放弃本页草稿。', okText: '放弃修改并离开', cancelText: '继续编辑', onOk: () => blocker.proceed(), onCancel: () => blocker.reset() }); return () => dialog.destroy() }, [blocker, modal])
 return null
}
