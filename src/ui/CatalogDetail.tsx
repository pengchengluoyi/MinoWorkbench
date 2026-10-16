import { Drawer } from 'antd'
import { EmptyState } from './EmptyState'
import { redactedText } from '@/lib/redact'
import { CatalogReferences } from './CatalogBrowser'
const LABEL: Record<string,string> = { id:'编号', uid:'目录身份', name:'名称', label:'名称', title:'标题', description:'完整说明', summary:'摘要', version:'版本', source_path:'来源文件', enabled:'启用状态', kind:'类型', platforms:'适用平台', params_schema:'参数合同', slots:'任务槽位', role_ids:'关联角色', skill_ids:'关联技能', metadata:'附加信息', system_prompt:'完整提示词' }
export function CatalogDetail({ title, openId, row, onClose }: { title: string; openId: string; row?: object; onClose: () => void }) {
 return <Drawer open={!!openId} width={640} title={title} onClose={onClose} destroyOnHidden>{row ? <><p>当前服务端目录，仅供查看；未声明内容不能推断为已配置或可执行。</p><CatalogReferences row={row} /><dl style={{ margin:0 }}>{Object.entries(row).map(([key,value]) => <div key={key} style={{ padding:'10px 0', borderBottom:'1px solid var(--w-border)' }}><dt style={{ fontWeight:700 }}>{LABEL[key] || key}</dt><dd className="w-read-detail" style={{ margin:'6px 0 0' }}>{typeof value === 'boolean' ? value ? '是' : '否' : value == null ? '未返回' : redactedText(value)}</dd></div>)}</dl></> : <EmptyState title="此记录不在当前目录中" hint={`编号：${openId}`} />}</Drawer>
}
