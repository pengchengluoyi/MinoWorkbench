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
  'releases', 'runtime', 'schedule', 'settings', 'sys', 'task',
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
      // Nexus 的接口散在 24 个顶层前缀下（没有统一的 /api 前缀）。
      // 漏配一个，dev 下该接口会落到 SPA 的 index.html 并返回 200 + HTML，
      // 症状是"接口返回了但数据是 undefined"——极难查。
      // 新增 Nexus 前缀务必加到这里；同时 lib/request.ts 有 HTML 响应兜底会报错提醒。
      proxy: mode === 'development' && !process.env.VITE_NEXUS_URL
        ? {
            [`^/(${NEXUS_PREFIXES.join('|')})(/|$|\\?)`]: {
              target: nexus,
              changeOrigin: true,
            },
            '/ws': { target: nexus, changeOrigin: true, ws: true },
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
