#!/usr/bin/env bash
# MinoWorkbench 是纯 Web 应用，不允许出现 Electron 的运行时用法。
#
# 查的是「用法」而不是「这个词」：注释和文档里说明"原版用了 X，已删掉"是合理的，
# 不该因此让 CI 红。所以匹配的是真实 API 与导入形式。
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0

# 运行时用法：宿主桥、IPC、主进程 API、以及对 electron 包的导入
USAGE='electronAPI|ipcRenderer|ipcMain|contextBridge|webFrame|process\.versions\.electron|from +.(electron)|require\( *.(electron).'
hits=$(grep -rnE "$USAGE" src 2>/dev/null || true)
if [ -n "$hits" ]; then
  echo "✗ src 下出现 Electron 运行时用法："
  echo "$hits"
  fail=1
fi

# 依赖
hits=$(grep -nE '"(electron|electron-builder|electron-updater|vite-plugin-electron)"' package.json 2>/dev/null || true)
if [ -n "$hits" ]; then
  echo "✗ package.json 出现 Electron 依赖："
  echo "$hits"
  fail=1
fi

# preload / 主进程文件
hits=$(find . -path ./node_modules -prune -o -type f \( -name 'preload.*' -o -name 'electron.vite.*' \) -print 2>/dev/null || true)
if [ -n "$hits" ]; then
  echo "✗ 出现 Electron 相关文件："
  echo "$hits"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo
  echo "Electron 检查未通过。"
  exit 1
fi
echo "✓ Electron 检查通过（纯 Web）"
