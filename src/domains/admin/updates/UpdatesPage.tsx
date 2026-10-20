import { Alert } from 'antd'

export function UpdatesPage() {
  return <section style={{ maxWidth: 900, margin: '0 auto' }}>
    <h1>版本与升级</h1>
    <Alert type="info" showIcon message="Nexus 与 Workbench 作为一个版本安装"
      description="请在服务所在机器安装新版 wheel，然后执行 mino-nexus service restart。页面不再下载或执行服务更新。Scout 仍在节点管理中独立更新。" />
  </section>
}
