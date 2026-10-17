import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const index = args.indexOf('--nexus-url')
const target = index >= 0 ? args[index + 1] : process.env.VITE_NEXUS_URL || process.env.VITE_PROXY_TARGET
if (!target) {
  console.error('开发启动须显式指定测试 Nexus：npm run dev -- --nexus-url http://127.0.0.1:11104 --port 5274')
  process.exit(2)
}
const url = new URL(target)
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
  console.error('Nexus 地址必须是无凭据的 HTTP origin'); process.exit(2)
}
if (index >= 0) args.splice(index, 2)
if (!args.includes('--port')) args.push('--port', '5274')
const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), ...args], {
  stdio: 'inherit', env: { ...process.env, VITE_PROXY_TARGET: url.origin, VITE_NEXUS_URL: '', MINO_DEV_NEXUS_URL: url.origin },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', code => process.exit(code ?? 1))
