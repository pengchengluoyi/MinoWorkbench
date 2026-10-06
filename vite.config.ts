import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

/**
 * dev 下若未显式指定 VITE_NEXUS_URL，用 proxy 走同源，避免 CORS。
 * 生产构建一律直连 nexusOrigin()。
 */
/**
 * Nexus 的顶层路径前缀清单。
 * 由两个原项目的 api 层全量扫描得到（grep "url: '/..."），共 24 个。
 */
const NEXUS_PREFIXES = [
  'ability', 'api', 'app_graph', 'app-automation', 'apps', 'auth',
  'case-runner', 'device', 'feishu', 'file', 'flow-blocks', 'get_api',
  'health', 'hitl', 'logs', 'me', 'nav-fsm', 'packs', 'project',
  'releases', 'runtime', 'schedule', 'settings', 'static', 'sys', 'task',
  'workflow', 'workflow_run',
]

export default defineConfig(({ mode }) => {
  const nexus = process.env.VITE_NEXUS_URL || 'http://mino.local:10104'
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5273,
      strictPort: true,
      // Nexus 的接口散在 27 个顶层前缀下（没有统一的 /api 前缀）。
      //
      // 两个坑：
      // 1) 漏配前缀 → 该接口落到 SPA 的 index.html，返回 200 + HTML，
      //    症状是"接口返回了但数据全是 undefined"。lib/request.ts 有 HTML 兜底会报错提醒。
      // 2) 前缀与客户端路由撞车 → 比如 /settings 既是 Nexus 前缀，
      //    又是 Studio 的 /settings/** 路由；不处理的话在 /settings/runtime 上刷新
      //    会被代理到 Nexus 拿 404。
      //
      // bypass 解决第 2 个：浏览器导航带 Accept: text/html，直接给 SPA；
      // XHR（Accept: application/json）才真代理。沿用 MinoConsole 验证过的做法。
      proxy: mode === 'development' && !process.env.VITE_NEXUS_URL
        ? {
            '/ws': { target: nexus, changeOrigin: true, ws: true },
            [`^/(${NEXUS_PREFIXES.join('|')})(/|$|\\?)`]: {
              target: nexus,
              changeOrigin: true,
              // 升级 / 插件安装会一直占着这条 HTTP，直到包下完。
              // 8 秒掐断后页面只看到 Network Error，Nexus 仍在下载，按钮也点不了第二次。
              timeout: 700_000,
              proxyTimeout: 700_000,
              configure: (proxy) => {
                proxy.on('error', (_err, _req, res) => {
                  const http = res as { headersSent?: boolean; writeHead?: (code: number, headers: Record<string, string>) => void; end?: (body?: string) => void }
                  if (!http.writeHead || http.headersSent) return
                  http.writeHead(502, { 'Content-Type': 'application/json' })
                  http.end(JSON.stringify({ message: 'Nexus 不可达' }))
                })
              },
              bypass: (req: { headers: Record<string, string | string[] | undefined> }) => {
                const accept = String(req.headers.accept || '')
                if (accept.includes('text/html')) return '/index.html'
                return undefined
              },
            },
          }
        : undefined,
    },
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      // 分包按 id 判定。
      // 注意不能写成 manualChunks: { antd: ['antd'] } —— 那种写法会把整包
      // 拉进 chunk，等于废掉 tree-shaking（实测 gzip 多付 100KB+）。
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react'
            if (/[\\/]node_modules[\\/](antd|@ant-design|rc-[^\\/]+)[\\/]/.test(id)) return 'antd'
            if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return 'query'
            return 'vendor'
          },
        },
      },
      chunkSizeWarningLimit: 700,
    },
  }
})
