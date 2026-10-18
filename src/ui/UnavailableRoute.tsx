import { Link, useLocation } from 'react-router-dom'
import { EmptyState } from './EmptyState'
export function UnavailableRoute() {
 const location = useLocation()
 return <main style={{ padding: 32 }}><EmptyState title="此页面不存在或已停用" hint={<><p>当前地址：<code>{location.pathname}</code></p><p>旧入口没有可确认的对象映射，原地址已保留。</p></>} action={<div className="flex gap-3"><Link to="/testing">返回项目工作台</Link><Link to="/settings/runtime">查看 Scout 节点</Link></div>} /></main>
}
