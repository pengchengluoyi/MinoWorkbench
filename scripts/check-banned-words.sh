#!/usr/bin/env bash
# 禁用词扫描。主仓库 CLAUDE.md 要求全仓库（node_modules 外）不出现旧品牌名。
#
# 注意模式里的方括号：`mini[o]range` 作为正则能匹配到真词，
# 但本文件自身被 `grep -i <真词>` 扫描时不会命中——
# 这样连这条规则本身都不违反规则。新增禁用词请沿用同样写法。
set -uo pipefail
cd "$(dirname "$0")/.."

PATTERNS=(
  'mini[o]range'
)

fail=0
for p in "${PATTERNS[@]}"; do
  hits=$(grep -rniE "$p" \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    --exclude-dir=.git \
    --exclude="$(basename "$0")" \
    . 2>/dev/null || true)
  if [ -n "$hits" ]; then
    echo "✗ 命中禁用词 /$p/："
    echo "$hits"
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo
  echo "禁用词检查未通过。"
  exit 1
fi
echo "✓ 禁用词检查通过"
