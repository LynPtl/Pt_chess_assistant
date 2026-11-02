# 粘贴截图 → 摆好棋 → 本地分析（设计稿）

日期：2026-11-02
状态：待批准
规模：小改动（单个本地工具，约 500 行）

---

## 1. 意图与为什么

用户想要的是**一个本地的、类似 lichess 的局面分析环境**，入口是"粘贴一张棋盘截图，棋就摆好了"。

关键判断：**分析界面不需要我们写**。En Croissant（GPL-3，Tauri）已经提供了 lichess 式的分析体验，并且：

- 已内置图片识别（`src-tauri/src/vision.rs`，ChessQ-Lite-V4 / DINOv2，63MB，candle 纯 Rust 本地推理）
- 是标准 UCI 引擎宿主，Maia3（`maia3-5m`）可直接作为引擎加入
- 支持命令行打开文件：`cli.args[{name:"file",index:1}]` → `src/utils/launch.ts:openCommandLineFile()`
- 解析 PGN 时会读 `[FEN "..."]` 头：`src/utils/chess.ts:499` `parsePGN`，552 行 `fen: FEN ?? INITIAL_FEN`

它自己那套"图片→摆棋"有两个真缺陷（已读源码确认）：

1. `src/components/common/ImportImageButton.tsx:33` 硬编码 `` onImport(`${result.data} w - - 0 1`) `` —— **走子方永远是白方，易位权永远是空**
2. 只有文件选择器（`@tauri-apps/plugin-dialog` 的 `open()`），**不能粘贴**

所以本项目不写分析器、不 fork En Croissant，只写**"摆棋"这一段**，把局面按正确语义交给它。

## 2. 目标 / 非目标 / 反目标

### 目标

- 粘贴（Ctrl+V）或拖入一张棋盘截图，得到**语义正确**的 FEN：棋子摆位 + 走子方 + 易位权 + 翻转方向
- 识别结果在送出前**可见、可改**：截图、识别出的棋盘、置信度、警告都在一屏
- 一键把局面交给 En Croissant 打开（不模拟按键、不抢焦点）
- 每次识别写一条日志（时间、FEN、置信度、警告）
- 全程本地，图片不出机器

### 非目标

- 不写分析界面、不写引擎前端（拿 En Croissant 的）
- 不 fork / 不改 En Croissant 源码
- 不自动安装 Maia3 或 Stockfish，不代管引擎
- 不做走子列表 OCR、不识别对局来源、不做批量
- 不做云端、不做账号

### 反目标（技术上能跑，也算失败）

- 把低置信度或不合法的局面**静默**送进分析器
- 走子方/易位猜错却没有任何提示
- 为了省事引入 Python + torch 只为了识别（识别不需要它，Maia3 在 En Croissant 里跑）
- 绑定到 0.0.0.0 把本地服务暴露到局域网

## 3. 约束

| 项 | 现状 |
|---|---|
| 平台 | Windows（已验证：Python 3.11.6、Node v24.20.0） |
| 已装软件 | **无** En Croissant / Maia3 / Stockfish —— 需要用户自行安装 |
| 识别后端 | `@scoriiu/fenshot`（MIT，1.3MB ONNX + onnxruntime-web wasm，**浏览器原生**） |
| 棋盘 UI（确认窗用） | `cm-chessboard` 或纯 SVG，只读展示即可 |
| 运行时 | 单一 Node 进程：静态服务 + 交接端点 |

## 4. 考虑过的方案

| | 分析器 | 摆棋 | 取舍 | 结论 |
|---|---|---|---|---|
| **A** | En Croissant（原样） | 外挂工具，用 PGN+CLI 交接 | 多一个窗口/一步操作；核心约半天；拿满 En Croissant 功能 | **选中** |
| B | En Croissant（fork） | 改 `ImportImageButton`：加 paste、加走子方、修 `w - - 0 1` | 体验最顺，但要 Rust+pnpm 工具链（1–2GB）、跟上游同步 | 备选，A 用着不爽再上 |
| C | 自己写页面 + WebSocket 引擎网关 | 自己写 | 白手重造 En Croissant 已有的轮子 | 否决 |

选 A 的理由：把"分析体验"外包给一个成熟 GPL 应用，我们只补它明确缺的那一段，风险和工作量最小；且 A 的摆棋逻辑将来可以原样搬进 B。

## 5. 决定的细节

### 5.1 架构

```
浏览器 (127.0.0.1:PORT)              Node 单进程
  粘贴/拖入图片
       ↓
  fenshot 识别（wasm，本地）    ←── 静态资源由同一个 Node 服务提供
       ↓
  确认窗：截图 + 识别棋盘 + 置信度
         + 走子方(w/b) + 易位(推断/无) + 翻转
       ↓ POST /handoff {fen}
                                写入 %TEMP%\<app>\position.pgn
                                （[SetUp "1"][FEN "..."]）
                                启动 en-croissant.exe position.pgn
                                追加日志
```

只监听 `127.0.0.1`。

### 5.2 识别后端：`@scoriiu/fenshot`（我的决定）

在浏览器里跑它的 `createRecognizer`（这才是它的原生活环境，不需要 Node rasterizer 垫片），得到：

- `placement`（棋子摆位，`1` 已压缩成 run-length，合法 FEN）
- `meanConfidence` / `minConfidence` / `reliable`（`minConfidence >= 0.7`）
- `plausible`（双方各恰好一王）
- `resolveOrientation()` 按兵推进方向判断是否黑方视角
- `inferCastling()` + `placementToFen(placement, turn)`

选它而不选 ChessQ 的理由：同一套 API 里自带置信度、翻转判定、王数合法性哨兵、易位推断，且训练集覆盖 lichess/chess.com 主题与书页棋谱图；En Croissant 内置的那套不暴露这些信号。

### 5.3 走子方（我的决定）

像素里读不出来。默认 `w`（与 En Croissant 一致），但**始终显示、可切换**，并在日志里记下当时的选择。

### 5.4 易位权（我的决定）

默认采用 `inferCastling()` 的推断（王/车在原始格即有权利），并在界面上**显示推断出了哪几个权利**（如 `KQkq`），提供一个"无易位"开关。

理由：多数粘贴的是对局中的截图，权利通常还在，推断比直接清空更接近真值；但推断会偏乐观（王回过家就会凭空多出权利），所以必须让它可见、可一键关掉。

### 5.5 交接机制（我的决定）

写临时 PGN 再用命令行打开，而不是 clipboard FEN 或按键模拟：

```pgn
[Event "Pasted position"]
[SetUp "1"]
[FEN "<full fen>"]

*
```

然后 `spawn(enCroissantPath, [pgnPath], {detached:true})`。

降级路径：`config.json` 里的 `enCroissantPath` 缺失或不正确时，界面隐藏"送入"按钮，改为只提供"复制 FEN"并给出填写路径的提示——绝不假装成功。

### 5.6 配置

`config.json`（首次运行若不存在则生成带注释的模板）：

```json
{
  "enCroissantPath": "C:\\Program Files\\En Croissant\\en-croissant.exe",
  "port": 8787,
  "pgnTempDir": "",          // 空 = 系统临时目录
  "logPath": "logs/recognitions.jsonl"
}
```

### 5.7 日志

每次识别/交接一行 JSONL：`ts, fen, turn, castlingMode, flipped, meanConfidence, minConfidence, reliable, plausible, handedOff`。不记录图片、不记录路径。

### 5.8 兜底与拒绝

| 情况 | 行为 |
|---|---|
| 图里找不到棋盘（`recognize` 返回 null） | 提示"没找到棋盘，试试裁紧一点"，不进确认窗 |
| `reliable === false` | 确认窗顶部红色警告，列出最差格子的置信度；"送入"按钮仍可用，但需要额外确认一次 |
| `plausible === false`（王数不对） | 红色警告"这可能不是一个合法局面"，默认不自动送入 |
| `new Chess(fen)` 抛错 | 红色警告，禁止送入，只允许修正后重试（修正靠走子方/易位/翻转三个开关） |

## 6. 交付物

```
D:/mychess/
  README.md                 安装 En Croissant/Maia3、启动、配置、已知限制
  package.json              依赖 + scripts(start / test / sync-assets)
  config.json               运行配置（带默认模板）
  src/server.mjs            静态服务 + POST /handoff + 日志
  src/index.html            粘贴页
  src/app.js                fenshot 接线 + 确认窗 + 交接调用
  src/style.css
  scripts/sync-assets.mjs   把 onnxruntime wasm 与 ONNX 模型同步到 vendor/
  vendor/                   ort-wasm-*.{mjs,wasm} + chess-tiles-v2.onnx
  test/fixtures/*.png       识别回归用截图（取自 fenshot 仓库 tests/fixtures/，MIT）
  test/expected.json        每张图的预期 FEN / 预期拒绝
  start.bat                 双击启动（npm start + 打开浏览器）
  docs/specs/2026-11-02-paste-to-en-encroissant-design.md
```

## 7. 验收标准

- [ ] 至少 5 张标准棋盘截图能出正确 FEN（含 fenshot 自带 fixture：白方视角、黑方视角、整屏双棋盘、无兵残局）
- [ ] 黑方视角截图经 `resolveOrientation` 后 FEN 与其白方版本一致
- [ ] 异形棋子集截图（`lichess-italian-horsey.png`）被判为 `reliable: false` 并给出警告，而不是静默给错 FEN
- [ ] 无棋盘截图（`reddit-chrome-no-board.png`）被拒绝
- [ ] 点击"送入"后 En Croissant 打开并显示该局面，**走子方正确**
- [ ] 同一局面切到黑方走，En Croissant 里显示黑方走
- [ ] Maia3 在 En Croissant 中作为 UCI 引擎可用，并能分析送入的局面
- [ ] 从粘贴到 FEN 出现的中位耗时 < 3 秒；到 En Croissant 打开 < 10 秒
- [ ] `config.json` 里路径错误时，界面只给复制 FEN 而不报假成功
- [ ] 服务只监听 127.0.0.1
- [ ] README 覆盖安装、配置、使用、失败场景（低分辨率 / 异形棋子 / 翻转 / 遮挡 / 书页图）

## 7.1 回归测试怎么跑（我的决定）

**不开 headless 浏览器、不用 Node 垫片。** 页面里放一个 `?fixtures=1` 开发模式：依次把 `test/fixtures/*.png` 喂进**生产用的那条** `createRecognizer` 管线，在页面上列出每张图的 FEN、是否 `reliable`、和 `test/expected.json` 的比对结果（pass / fail / expect-reject）。

理由：

- 浏览器才是识别管线的真实运行环境；用 Node 重写一条只为了测试，测的就不是生产路径了
- 省掉 Playwright 这种重依赖
- 代价：回归是手动的（打开带参数的 URL 看一眼），不进 CI —— 这是刻意接受的取舍

## 8. 留给实现者的

- 用 `cm-chessboard` 还是纯 SVG 渲染确认窗的只读棋盘 —— 二选一，倾向纯 SVG（少一个依赖）
- 走子方/易位/翻转三个开关的排布
- `POST /handoff` 的具体响应形状
- 是否顺手做一个"打开日志"按钮
- 回归测试夹具从 fenshot 仓库的 `packages/fenshot/tests/fixtures/` 取，还是自己另拍
- 端口被占用时怎么办（顺延还是报错退出）

## 9. 未验证的风险（只有跑起来才知道）

1. **En Croissant 给新开的 tab 会不会自动挂上已配置的引擎** —— 若不自动，需在 README 写明"送入后手动选一次引擎"，或改用它的默认引擎设置
2. **Maia3 启动时间** —— `maia3-5m` 需要 import torch，可能撞上 En Croissant 的引擎初始化超时；缓解：先 `maia3-cache --model maia3-5m` 预下 checkpoint，并在 README 写明
3. **`en-croissant.exe` 已在运行时再启动一个进程** —— 可能出现第二个窗口；若不优雅，改为"先激活已有窗口，再交 PGN"
4. **onnxruntime-web 在没有 COOP/COEP 响应头时的性能** —— 单线程 wasm 应该能跑，只是慢；若必须多线程，由 Node 服务补这两个头
