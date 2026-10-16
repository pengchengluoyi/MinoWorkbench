import '@ant-design/v5-patch-for-react-19'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { nexusOrigin } from './lib/config'
import './styles/global.css'
import './styles/workspace.css'

const root = createRoot(document.getElementById('root')!)
const boot = async () => {
  try {
    nexusOrigin()
    if (location.pathname === '/index.html' || /^\/releases\/[A-Za-z0-9][A-Za-z0-9._-]*\/index\.html$/.test(location.pathname)) {
      history.replaceState(history.state, '', '/' + location.search + location.hash)
    }
    const { prepareAuthTarget } = await import('./lib/tokens')
    prepareAuthTarget()
    const { default: App } = await import('./App')
    root.render(<StrictMode><App /></StrictMode>)
  } catch (error) {
    root.render(<main role="alert" style={{ padding: '2rem' }}>
      <h1>工作台暂时无法启动</h1>
      <p>{error instanceof Error ? error.message : '请检查部署配置及网络连接。'}</p>
      <button onClick={() => location.reload()}>重新加载</button>
    </main>)
  }
}
void boot()
