#!/usr/bin/env bash
# setup.sh — 一次性装好本项目（macOS / Linux）。
#
#   ./scripts/setup.sh
#
# 只做“能跑起本地页面”这件事：检查 Node、装依赖、构建、写 config.json。
# En Croissant / Stockfish / Maia 都是本地引擎，需要你按 README 自己装 ——
# 它们的安装方式各平台差别大，写死在这里反而容易误导。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[32m%s\033[0m\n' "$1"; }
warn() { printf '    \033[33m%s\033[0m\n' "$1"; }
die()  { printf '\n\033[31m[X] %s\033[0m\n' "$1"; exit 1; }

step "检查 Node.js"
command -v node >/dev/null 2>&1 || die "没找到 node。装 Node.js 22+ 后再跑（https://nodejs.org）"
MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$MAJOR" -lt 22 ]; then
  die "Node $(node --version) 太旧，需要 22+（node --test 的 glob 和 import.meta.resolve）"
fi
ok "Node $(node --version)"

step "安装依赖（顺带复制 wasm 运行时和识别模型）"
npm install
step "构建页面"
npm run build
ok "dist/ 已生成"

step "写 config.json"
if [ -f config.json ]; then
  ok "config.json 已存在，不动它"
else
  cat > config.json <<'JSON'
{
  "enCroissantPath": "",
  "port": 8787,
  "pgnTempDir": "",
  "logPath": "logs/recognitions.jsonl",
  "logMaxBytes": 2097152
}
JSON
  ok "已生成 config.json（enCroissantPath 先留空，配上之后才有「送入」按钮）"
fi

step "完成"
cat <<'TIP'

  启动:     npm start        （然后开 http://127.0.0.1:8787/）
  测试:     npm test         （单元）
            npm run verify   （真实浏览器，需要先起服务）

  没有 En Croissant 也能用：贴图/贴 FEN → 摆棋 → 复制 FEN 拿到别处分析。
  想在本机接引擎，见 README 的「装上引擎（可选）」一节。

TIP
