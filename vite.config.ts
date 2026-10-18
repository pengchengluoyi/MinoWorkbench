import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const sourceRoot = fileURLToPath(new URL('.', import.meta.url))
const sourceDigest = () => {
  const hash = createHash('sha256')
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) hash.update(relative(sourceRoot, path)).update('\0').update(readFileSync(path)).update('\0')
    }
  }
  visit(join(sourceRoot, 'src'))
  for (const name of ['index.html', 'package.json', 'package-lock.json', 'vite.config.ts']) {
    hash.update(name).update('\0').update(readFileSync(join(sourceRoot, name))).update('\0')
  }
  return hash.digest('hex')
}

const sourceCommit = () => {
  try { return execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { return '' }
}

/**
 * dev 下若未显式指定 VITE_NEXUS_URL，用 proxy 走同源，避免 CORS。
 * 生产构建一律直连 nexusOrigin()。
 */
/**
 * Nexus 的顶层路径前缀清单。
 * 由两个原项目的 api 层全量扫描得到（grep "url: '/..."），共 24 个。
 */
const NEXUS_PREFIXES = [
  'ability', 'api', 'assistant', 'app_graph', 'app-automation', 'apps', 'auth',
  'case-runner', 'device', 'feishu', 'file', 'flow-blocks', 'get_api',
  'health', 'hitl', 'logs', 'me', 'nav-fsm', 'packs', 'project',
  'releases', 'runtime', 'schedule', 'settings', 'static', 'sys', 'task',
  'workflow', 'workflow_run',
]

export default defineConfig(({ mode }) => {
  // VITE_PROXY_TARGET：仅 dev 代理目标（联调指向本机 Nexus），不影响生产 origin
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const nexus = env.VITE_PROXY_TARGET || env.VITE_NEXUS_URL || 'http://127.0.0.1:50101'
  const digest = sourceDigest()
  const build = { build_id: `dev-${digest.slice(0, 24)}`, source_digest: digest, source_commit: sourceCommit(), identity_kind: 'source', source_unchanged: true }
  return {
    define: { __MINO_WORKBENCH_BUILD__: JSON.stringify(build) },
    plugins: [react(), tailwindcss(), {
      name: 'workbench-process-build',
      configureServer(server) {
        server.middlewares.use('/__mino/workbench-build', (_request, response) => {
          response.setHeader('Content-Type', 'application/json')
          response.setHeader('Cache-Control', 'no-store')
          response.end(JSON.stringify({ ...build, source_unchanged: sourceDigest() === digest }))
        })
      },
    }, {
      name: 'local-development-only',
      configResolved(config) {
        if (config.command !== 'serve') return
        for (const listener of [config.server, config.preview]) {
          if (!['127.0.0.1', 'localhost', '::1'].includes(String(listener.host)) || listener.port !== 60101) {
            throw new Error('源码 Workbench 仅允许 localhost:60101')
          }
        }
        const target = new URL(nexus)
        if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.port !== '50101') {
          throw new Error('开发 Workbench 只能连接本机 Nexus :50101')
        }
      },
    }],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      host: '127.0.0.1',
      port: 60101,
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
      proxy: mode === 'development' && !env.VITE_NEXUS_URL
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
    preview: {
      host: '127.0.0.1',
      port: 60101,
      strictPort: true,
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
            // 表格解析仅在打开导入时加载，不放入所有页面共用的 vendor。
            if (/[\\/]node_modules[\\/]xlsx[\\/]/.test(id)) return 'spreadsheet'
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react'
            if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return 'query'
            return undefined
          },
        },
      },
      chunkSizeWarningLimit: 700,
    },
  }
})
