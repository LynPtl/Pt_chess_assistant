# mychess — 粘贴截图，摆好棋，交给 En Croissant 分析

粘贴（或拖入）一张棋盘截图 → 本地识别成**语义正确**的 FEN → 一键送进
[En Croissant](https://www.encroissant.org)，在那里用 Stockfish / Maia 3 分析。

识别、拼接 FEN、日志、启动分析器全部在本机完成，图片不出机器。

```
截图 ──粘贴──> 浏览器（fenshot 的 wasm 模型识别）──> FEN ──POST──> 本地 Node 服务
                                                                      │ 写 position.pgn
                                                                      └> en-croissant.exe position.pgn
```

本项目**不含分析界面**。分析界面是 En Croissant 的，我们只补它缺的那一段：
它自带的"图片导入"只能选文件，而且把走子方写死成白方、易位权写死成无。

---

## 它做什么 / 不做什么

做：

- 粘贴、拖入、或选择图片 → 识别棋盘
- 显示识别出的棋盘、平均置信度、原截图，供你核对
- **走子方**（白/黑）、**易位权**（按王车原位推断 / 一律无）、**旋转 180°** 三个开关
- 把 FEN 写成带 `[SetUp "1"][FEN "..."]` 的临时 PGN，命令行交给 En Croissant
- 每次识别写一行 JSONL 日志
- 不确定就明说：低置信度、王数不对、FEN 不合法都会挡在送出之前

不做：

- 不写分析界面、不写引擎前端
- 不 fork / 不修改 En Croissant
- 不安装或代管引擎
- 不做对局列表 OCR、不读截图里的着法
- 不联网（除了你打开的 `127.0.0.1`）

---

## 安装

前置：[Node.js](https://nodejs.org) 22+（开发时用的是 v24.20.0）。再装 [En Croissant](https://www.encroissant.org)。

```bat
git clone <this repo> mychess
cd mychess
npm install
npm run build
```

`npm install` 会把 onnxruntime 的 wasm 与 fenshot 的模型（约 14MB）同步到
`src/ort/`、`src/model/`（都被 gitignore）；`npm run build` 产出 `dist/`。

### 找到 En Croissant 的可执行文件路径

安装后一般是：

```
C:\Program Files\En Croissant\en-croissant.exe
```

在开始菜单里右键 En Croissant →「打开文件位置」，或到上面的目录里确认。
把路径填进配置（见下）。

### 配置

把 `config.example.json` 复制成 `config.json`，改成你的路径：

```json
{
  "enCroissantPath": "C:/Program Files/En Croissant/en-croissant.exe",
  "port": 8787,
  "pgnTempDir": "",
  "logPath": "logs/recognitions.jsonl"
}
```

| 键 | 含义 |
|---|---|
| `enCroissantPath` | En Croissant 的 exe 完整路径。**留空或路径不存在时，页面只给"复制 FEN"，不显示送入按钮** |
| `port` | 本地服务端口，默认 8787，只监听 `127.0.0.1` |
| `pgnTempDir` | 临时 PGN 目录；留空则用系统临时目录下的 `mychess-paste` |
| `logPath` | 识别日志，相对路径相对于 `config.json` 所在目录 |

`config.json` 与 `logs/` 都不进 git。

> **路径请用正斜杠（如上）。** JSON 把反斜杠后跟 n 当换行转义，所以写成
> `"C:\\Program Files\\nodejs\\node.exe"` 时，路径会被读成 `C:\Program` + 换行 + `odejs`……，
> 结果是“路径不存在”。本项目会直接报错让你改成正斜杠，而不是假装没配置。

---

## 用

双击 `start.bat`（它会按需装依赖、构建、起服务并打开浏览器），或者：

```bat
npm start          :: 起服务并自动打开 http://127.0.0.1:8787/
set MYCHESS_NO_OPEN=1 && npm start    :: 不自动开浏览器
```

然后：

1. 对棋盘截图（`Win`+`Shift`+`S` 就行）
2. 在页面任意位置 `Ctrl`+`V`
3. 看一眼识别出的棋盘和置信度，必要时切换走子方 / 易位权 / 旋转
4. 点「送入 En Croissant」→ 新开的 En Croissant 窗口里就是这个局面

> 像素里读不出**走子方**，也读不出**易位权是否已失效**。默认白方、按王车原位推断易位权，
> 界面上都会显示出来——这正是需要你核对的两件事。

---

## 在 En Croissant 里接上 Maia 3

Maia 3 是标准 UCI 引擎，装好之后 En Croissant 里当成普通引擎加即可。

```bash
git clone https://github.com/CSSLab/maia3.git
cd maia3
python -m pip install .            # 需要 torch；CPU 版约 200MB，见下
maia3-cache --model maia3-5m       # 预下 checkpoint，否则引擎启动可能超时
```

想省空间就装 CPU 版 torch：

```bash
python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
```

然后在 En Croissant：Engines → 添加 UCI 引擎 → 命令填 `maia3-5m`
（用 `where maia3-5m` 找完整路径），**参数留空**。别把 `.pt` 文件填进去，
也别加 `--model`——预设可执行文件已经带好了架构参数。

Maia 3 的 `MultiPV` 给出的是"人类大概会走的几步"，`Elo`/`SelfElo`/`OppoElo`
调的是预测的对象；它给的分是从 WDL 换出来的，**不是 Stockfish 那种搜索分**。

---

## 回归测试

```bat
npm run build
npm test                                  :: Node 侧单元测试
node scripts/browser-check.mjs "http://127.0.0.1:8787/?fixtures=1"
```

或起服务后用浏览器打开 <http://127.0.0.1:8787/?fixtures=1>，会看到一张表：
9 张图逐张跑**生产那条识别路径**，与 `test/fixtures/expected.json` 比对。

`scripts/browser-check.mjs` 是个无头 Chrome 检查器（走 DevTools 协议，
不依赖 Playwright）：等页面自己的完成信号再取结果，因为 `chrome --dump-dom`
在 load 时就返回，等不到 wasm 异步识别。

开发钩子（都在 `?selftest=` 分支里，不影响正常使用）：

| 参数 | 用途 |
|---|---|
| `?selftest=<文件名>` | 只跑一张 fixture，结果写进 `body[data-result]` 与页面上 |
| `&w=3840` | 把 fixture 放大到 3840 宽，模拟全屏截图 |
| `&crop=x,y,w,h` | 裁一块出来，模拟棋盘被裁掉/遮挡 |

测试图来自 [scoriiu/fenshot](https://github.com/scoriiu/fenshot) 的
`packages/fenshot/tests/fixtures/`（MIT）。

---

## 已知限制

**识别本身的边界**（fenshot 的能力边界，不是本项目的 bug）：

- 只认 2D 正视图：截图、书页棋谱图、App 截图。物理棋盘的斜拍照片基本无效
- 棋子集差异极大时会**拒绝**而不是猜（这是刻意的：`reliable: false`）
- 无兵残局里兵的方向没了，朝向判不出来，需要手动「旋转 180°」

**走子方与易位权**（物理上读不出来）：

- 走子方默认白方，必须自己切
- 易位权按"王和车还在原位"推断，会**偏乐观**（王回过家就会凭空多出权利），可一键改成"无"
- 吃过路兵与回合数固定写成 `- 0 1`

**实测结论（En Croissant 0.15.1，本机已装）**：

- **送入后不会自动开始分析。** 标签页会开出来、局面正确，但分析面板是空的，
  En Croissant 的 Engines 页显示 `No engine selected`。到 Analysis → Engines
  里选中你装好的引擎即可，之后每个新标签页都要选一次（或按你配置的默认引擎走）。
- **每次送入都会新开一个窗口。** 虽然它带 `tauri-plugin-single-instance`，
  实测第二个实例没有退出（`en-croissant.exe` 进程数 1 → 2）。介意的话送之前先关掉旧窗口。
  想改善的话，En Croissant 支持 `encroissant://import?url=<pgn 地址>` 深链，
  可以把「spawn exe」换成「打开深链」——这是本工具当前版本没做的。
- **Maia 3 的启动超时**未测（本机没装 torch）。同一位置已验证 Stockfish 19 能被识别
  （Engines 页显示 VERSION 19），所以引擎槽本身没问题，剩下的只是 Maia 3 的加载耗时。

已验证的（在这台机器上跑过）：

- [x] 9 张 fixture 全部符合预期（白方视角、黑方视角、整屏双棋盘、无兵残局、
      非标准蓝色主题、异形棋子集诚实拒绝、无棋盘图拒绝）
- [x] 3840 宽输入 1.4 秒内出正确 FEN
- [x] 半张棋盘 → 三条警告 + 送入按钮置灰
- [x] 点「送入」→ 写 PGN → 启动真实进程（路径含空格）→ 页面显示"已送入"
- [x] 日志逐条落盘，字段固定
- [x] `enCroissantPath` 配错时只给"复制 FEN"，不报假成功
- [x] 真机端到端：装 En Croissant 0.15.1 → 送入 → 新窗口标签页 `Pasted position`
      里就是识别出的那盘棋（已截图确认盘面）
- [x] 引擎槽可用：Stockfish 19 被 En Croissant 正确识别（VERSION 19）
