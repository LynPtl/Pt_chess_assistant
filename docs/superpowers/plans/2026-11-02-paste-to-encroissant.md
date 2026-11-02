# 粘贴截图 → 摆好棋 → 交给 En Croissant 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一个本地工具：粘贴棋盘截图 → 识别成**语义正确**的完整 FEN（走子方/易位/翻转可改）→ 写成临时 PGN → 命令行交给 En Croissant 打开分析。

**Architecture:** 单一 Node 进程同时提供静态页面和 `POST /handoff`。页面在浏览器里跑 `@scoriiu/fenshot`（wasm，本地）做识别，用 `src/fen.mjs` 合成 FEN；点"送入"时 POST 给同进程服务，服务校验 FEN、写 `[SetUp "1"][FEN]` PGN、spawn `en-croissant.exe <pgn>`、追加 JSONL 日志。分析界面完全交给 En Croissant。

**Tech Stack:** Node 24 ESM、Vite 7（仅构建）、`@scoriiu/fenshot` 0.1.5、`onnxruntime-web` 1.26.0、`chess.js` 1.4.0、`node:test`

**Spec:** `docs/specs/2026-11-02-paste-to-encroissant-design.md`

## Global Constraints

- Node `v24.20.0`（已装）；全部 ESM，`package.json` 必须有 `"type": "module"`
- 依赖仅允许：`@scoriiu/fenshot@^0.1.5`、`onnxruntime-web@1.26.0`、`chess.js@^1.4.0`；devDep 仅 `vite@^7.0.0`
- **不引入 Python / torch / Playwright / sharp**
- 服务只监听 `127.0.0.1`；默认端口 `8787`
- 识别产物一律是合法 6 字段 FEN：`<placement> <turn> <castling> - 0 1`（吃过路兵与回合数固定中性值）
- 前端不模拟键盘、不抢窗口焦点；与 En Croissant 的唯一接口是"写 PGN + 命令行打开"
- 失败必须显式报错，禁止静默成功
- 提交信息用 conventional commits（`feat:` / `test:` / `chore:` / `docs:`）

## Review Focus

以下五类输入/失败模式 spec 隐含但没有专门要求，最容易咬到真人用户。每条都在注释标注所属 Task 里配了测试。

1. **粘贴的不是图片**（复制了文字或一段 FEN 文本）→ 页面应安静地什么都不做，不能抛异常也不能卡在 scanning 状态。
2. **截图里棋盘被裁掉/被遮挡** → 应落到低置信度或 `plausible === false` 的警告分支，不能崩、不能静默送入。
3. **3840×2160 全屏截图** → 识别仍在数秒内完成（fenshot 内部把长边缩到 1600）。
4. **同一个临时 PGN 被 En Croissant 占着时再次送入** → 写文件失败必须报错（500 + 界面提示），不能假装成功。
5. **路径含空格与中文**（`C:\Program Files\En Croissant\en-croissant.exe`、中文用户名）→ spawn 必须按参数数组传，不拼 shell 字符串。

---

### Task 1: 骨架、配置加载、静态服务

**Files:**
- Create: `package.json`, `.gitignore`, `src/config.mjs`, `src/server.mjs`, `test/config.test.mjs`, `test/static.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces:
  - `src/config.mjs` → `export const DEFAULT_CONFIG = { enCroissantPath: "", port: 8787, pgnTempDir: "", logPath: "logs/recognitions.jsonl" }`；`export function loadConfig(configPath = "config.json"): Config`（文件不存在时返回默认值，JSON 损坏时抛错，`logPath` / `pgnTempDir` 解析为绝对路径）
  - `src/server.mjs` → `export function createServer(config, deps = {}): http.Server`，`deps = { staticRoot = "dist", fixtureRoot = "test/fixtures", launch }`；静态路由 `/`、`/assets/*`、`/vendor/*`、`/fixtures/*`；`GET /healthz` 返回 `{"ok":true,"configured":boolean}`（`configured` = `config.enCroissantPath` 非空且文件存在）

- [ ] **Step 1: 初始化仓库与依赖**

```bash
cd /d/mychess
npm init -y
npm pkg set type=module name=mychess
npm pkg set scripts.start="node src/server.mjs" scripts.test="node --test test/" scripts.build="vite build"
npm i @scoriiu/fenshot@^0.1.5 onnxruntime-web@1.26.0 chess.js@^1.4.0
npm i -D vite@^7.0.0
```

- [ ] **Step 2: 写 `.gitignore`**

```
node_modules/
dist/
src/ort/
src/model/
config.json
logs/
```

- [ ] **Step 3: 写失败的测试 `test/static.test.mjs`**

用 `node:fs.mkdtempSync` 建临时静态目录，写入假的 `index.html` 和 `a.wasm`，再 `createServer(config, { staticRoot: tmp }).listen(0, "127.0.0.1")`，用全局 `fetch` 断言：

```js
test("GET / 返回 index.html", async (t) => { /* status 200, content-type 含 text/html */ });
test(".wasm 的 content-type 是 application/wasm", async (t) => { /* */ });
test("未知路径返回 404", async (t) => { /* */ });
test("拒绝路径穿越 /../ 请求，返回 400 或 404", async (t) => { /* */ });
test("GET /healthz 返回 ok 与 configured 两个布尔字段", async (t) => { /* */ });
```

每个测试用 `t.after(() => server.close())` 收尾。

- [ ] **Step 4: 跑测试确认失败**

Run: `node --test test/static.test.mjs`
Expected: FAIL —— `Cannot find module '../src/server.mjs'`

- [ ] **Step 5: 写失败的测试 `test/config.test.mjs`**

```js
test("config.json 不存在时返回默认值且不抛错", ...);
test("JSON 损坏时抛错且错误信息含文件路径", ...);
test("logPath 与 pgnTempDir 被解析成绝对路径", ...);
test("port 缺失时回落到 8787", ...);
```

- [ ] **Step 6: 跑测试确认失败**

Run: `node --test test/config.test.mjs`
Expected: FAIL —— `Cannot find module '../src/config.mjs'`

- [ ] **Step 7: 实现 `src/config.mjs` 和 `src/server.mjs`**

`src/server.mjs` 要点：MIME 表必须包含 `{ ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".onnx": "application/octet-stream", ".png": "image/png", ".json": "application/json" }`；解析 URL 后 `path.normalize` 并断言结果仍在 `staticRoot` 内，否则 400。默认 `launch` 留到 Task 3 实现，本任务只需把 `deps.launch` 透传下去。

- [ ] **Step 8: 跑测试确认通过**

Run: `node --test test/`
Expected: 全部 PASS

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "chore: scaffold node server, config loader and static routing"
```

---

### Task 2: `src/fen.mjs` —— 摆位 + 走子方 + 易位模式 + 翻转 → 完整 FEN

**Files:**
- Create: `src/fen.mjs`, `test/fen.test.mjs`

**Interfaces:**
- Consumes: 无（自包含，不导入 `@scoriiu/fenshot`，这样 Node 测试和浏览器都能直接用）
- Produces:
  - `export function flipPlacement(placement: string): string`
  - `export function inferCastling(placement: string): string`（返回如 `"KQkq"`，无权利返回 `"-"`）
  - `export function isPlausible(placement: string): boolean`（白黑各恰好一个王）
  - `export function composeFen(placement: string, opts: { turn: "w"|"b", castling: "inferred"|"none", flipped: boolean }): string`

算法直接照搬 fenshot `packages/fenshot/src/fen.ts` 与 `compose.ts`（MIT）：`flipPlacement` 反序 rank 且反序每个 rank 内的字符；`inferCastling` 展开 `\d` 成 `.` 后检查白方 rank1 与黑方 rank8 的 `[4]` 是 K/k、`[7]`/`[0]` 是 R/r；`composeFen` 先 `flipped ? flipPlacement(placement) : placement`，再拼 `` `${p} ${turn} ${castling === "none" ? "-" : inferCastling(p)} - 0 1` ``。

- [ ] **Step 1: 写失败的测试 `test/fen.test.mjs`**

```js
const ITALIAN = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R";

test("composeFen 推断出双方四个易位权", () => {
  assert.equal(
    composeFen(ITALIAN, { turn: "w", castling: "inferred", flipped: false }),
    "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1",
  );
});

test("castling: none 时清空易位权", () => {
  assert.equal(
    composeFen(ITALIAN, { turn: "b", castling: "none", flipped: false }),
    "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b - - 0 1",
  );
});

test("flipped 时 180 度旋转摆位", () => {
  assert.equal(flipPlacement("R3K2R/8/8/8/8/8/8/8"), "8/8/8/8/8/8/8/R3K2R");
  assert.equal(flipPlacement("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"),
               "RNBQKBNR/PPPPPPPP/8/8/8/8/pppppppp/rnbqkbnr");
});

test("王离位则不给该侧易位权", () => {
  assert.equal(inferCastling("4k3/8/8/8/8/8/8/R2QK2R"), "-");
});

test("isPlausible 要求双方各恰好一个王", () => {
  assert.equal(isPlausible(ITALIAN), true);
  assert.equal(isPlausible("8/8/8/8/8/8/8/8"), false);
  assert.equal(isPlausible("4k3/8/8/8/8/8/8/4K2K"), false);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/fen.test.mjs`
Expected: FAIL —— `Cannot find module '../src/fen.mjs'`

- [ ] **Step 3: 实现 `src/fen.mjs`**

四个导出函数，按上面 Interfaces 的签名与算法。不加别的导出。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/fen.test.mjs`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/fen.mjs test/fen.test.mjs
git commit -m "feat: compose full FEN from scanned placement with turn, castling and flip"
```

---

### Task 3: `src/pgn.mjs` + `POST /handoff`

**Files:**
- Create: `src/pgn.mjs`, `test/pgn.test.mjs`, `test/handoff.test.mjs`
- Modify: `src/server.mjs`

**Interfaces:**
- Consumes: Task 1 的 `createServer(config, deps)`；Task 2 的 `isPlausible`（仅日志用）
- Produces:
  - `src/pgn.mjs` → `export function buildPositionPgn(fen: string, event = "Pasted position"): string`
  - `src/server.mjs` → `POST /handoff`，请求体 `{"fen": string}`；响应 `200 {"ok":true,"pgnPath":string}` / `400 {"ok":false,"error":string}` / `500 {"ok":false,"error":string}`；默认 launch 实现写在 `src/server.mjs` 内：`spawn(config.enCroissantPath, [pgnPath], { detached: true, stdio: "ignore" }).unref()`

- [ ] **Step 1: 写失败的测试 `test/pgn.test.mjs`**

```js
test("含 SetUp 与 FEN 头，正文为 *", () => {
  assert.equal(
    buildPositionPgn("8/8/8/8/8/8/8/K6k w - - 0 1"),
    '[Event "Pasted position"]\n[SetUp "1"]\n[FEN "8/8/8/8/8/8/8/K6k w - - 0 1"]\n\n*\n',
  );
});
test("FEN 里的双引号被转义成 \\\"", () => { /* 传入含 " 的字符串，断言输出中转义 */ });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/pgn.test.mjs` → FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/pgn.mjs`**（约 10 行）

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/pgn.test.mjs` → PASS

- [ ] **Step 5: 写失败的测试 `test/handoff.test.mjs`**

用 `node:fs.mkdtempSync` 作 `pgnTempDir`，注入假 launch 收集收到的路径；`config.enCroissantPath` 视用例设为假路径或 `""`。

```js
test("合法 FEN：写入 PGN 并调用 launch，返回 200", async (t) => {
  // 断言 launch 收到 <pgnTempDir>/position.pgn 的原始绝对路径（未加引号、未拼接），且文件内容含该 FEN
});
test("FEN 不合法（chess.js 拒绝）时返回 400 且不调用 launch", ...);
test("enCroissantPath 为空时返回 400 且提示未配置", ...);
test("追加一行 JSONL 日志，字段恰为 ts/fen/turn/castlingMode/flipped/meanConfidence/minConfidence/reliable/plausible/handedOff", ...);
// Review Focus 5
test("临时目录路径含空格与中文时仍能正确写入", async (t) => {
  // mkdtemp 后在其下建 "中文 目录 名" 子目录作为 pgnTempDir
});
// Review Focus 4
test("目标 PGN 路径不可写（同名目录占位）时返回 500 且 error 非空", async (t) => {
  // 在 pgnTempDir 下 mkdir position.pgn
});
```

- [ ] **Step 6: 跑测试确认失败**

Run: `node --test test/handoff.test.mjs` → FAIL（404 或未实现）

- [ ] **Step 7: 在 `src/server.mjs` 实现 `/handoff`**

流程：解析 JSON → 缺 `fen` 或 `chess.js` 的 `new Chess(fen)` 抛错 → 400；`config.enCroissantPath` 为空 → 400 `"未配置 enCroissantPath"`；`mkdir -p` 临时目录 → 写 `position.pgn` → `launch(pgnPath)` → 写日志 → 200。请求体上限 8KB，超限 413。

- [ ] **Step 8: 跑测试确认通过**

Run: `node --test test/` → 全部 PASS

- [ ] **Step 9: 提交**

```bash
git add src/pgn.mjs src/server.mjs test/pgn.test.mjs test/handoff.test.mjs
git commit -m "feat: hand a position to en-croissant via generated PGN and CLI"
```

---

### Task 4: 构建管线 —— Vite + 资产同步 + 最小可加载页面

**Files:**
- Create: `index.html`, `vite.config.js`, `scripts/sync-assets.mjs`, `src/main.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 的 `createServer`（`staticRoot` 默认 `dist`）
- Produces:
  - `scripts/sync-assets.mjs`：把 `node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.{mjs,wasm}` 与 `node_modules/@scoriiu/fenshot/model/chess-tiles-v2.onnx` 复制到 `src/ort/` 和 `src/model/`
  - `src/main.js`：`import { createRecognizer } from "@scoriiu/fenshot"`，导出的 `export const recognizer = createRecognizer({ modelUrl, wasmPaths })`，页面加载后把 `document.body.dataset.status` 置为 `"ready"` 或 `"error"`

- [ ] **Step 1: 写 `scripts/sync-assets.mjs`**

照搬 fenshot `apps/web/scripts/sync-ort.mjs` 的 `createRequire` + `require.resolve("onnxruntime-web")` 取 `dist` 目录的方式（其 exports map 隐藏了 `dist/*`），额外复制 ONNX 模型。运行时打印复制来源。

- [ ] **Step 2: 配 `package.json` 脚本**

```bash
npm pkg set scripts.sync="node scripts/sync-assets.mjs"
npm pkg set scripts.postinstall="node scripts/sync-assets.mjs"
npm pkg set scripts.dev="vite" scripts.prebuild="node scripts/sync-assets.mjs"
```

- [ ] **Step 3: 写 `vite.config.js`**

`base: "./"`（照 fenshot 的做法，产物可从任意子路径加载），`build.outDir: "dist"`。

- [ ] **Step 4: 写失败的验证（构建冒烟）**

写 `test/build.test.mjs`：

```js
test("dist/index.html 存在且引用了 js 资源", () => { /* 读 dist/index.html，assert.match /<script[^>]+src=/ */ });
test("dist 中包含 ort wasm 与 onnx 模型文件", () => { /* readdirSync 递归查找 .wasm 与 .onnx */ });
```

- [ ] **Step 5: 跑测试确认失败**

Run: `node --test test/build.test.mjs`
Expected: FAIL —— `dist/index.html` 不存在

- [ ] **Step 6: 写 `index.html` 与 `src/main.js`**

`index.html` 里 `<script type="module" src="/src/main.js"></script>`。`src/main.js` 用 `?url` 导入三份资产（`./ort/ort-wasm-simd-threaded.mjs?url`、`./ort/ort-wasm-simd-threaded.wasm?url`、`./model/chess-tiles-v2.onnx?url`），构造 recognizer 后设置 `document.body.dataset.status`。

- [ ] **Step 7: 构建并跑测试**

Run: `npm run build && node --test test/build.test.mjs`
Expected: 构建成功，两个测试 PASS

- [ ] **Step 8: 手动验证页面能加载 fenshot**

Run: `npm run build && npm start`，浏览器开 `http://127.0.0.1:8787/`，DevTools Console 无报错，`document.body.dataset.status === "ready"`。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "chore: vite build pipeline with onnxruntime and model asset sync"
```

---

### Task 5: 粘贴/拖入 → 识别 → 只读棋盘 + 置信度

**Files:**
- Create: `src/board.mjs`, `src/style.css`
- Modify: `src/main.js`, `index.html`

**Interfaces:**
- Consumes: Task 4 的 `recognizer`
- Produces:
  - `src/board.mjs` → `export function renderBoardSvg(placement: string, flipped: boolean): string`（返回 8×8 `<svg>` 字符串，用 Unicode 棋子字形，白子用 `#fff` 填充 + `#111` 描边，黑子反之）
  - `src/main.js` → 内部状态 `state = { scan, placement, imageUrl } | null`；`scanImage(blob)` 调用 `recognizer.recognize(blob)`，`null` 时进入 `noboard` 分支；`render()` 按状态重绘

- [ ] **Step 1: 写 `src/board.mjs`**

按 Interfaces 的签名实现。`flipped` 时 rank 顺序与每行字符顺序都反转。除 `renderBoardSvg` 外不导出。

- [ ] **Step 2: `src/main.js` 接上粘贴、拖入、文件选择**

要点：`window.addEventListener("paste", ...)` 里用 `Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith("image/"))?.getAsFile()`。**找不到图片元素时必须安静返回**（Review Focus 1：粘贴纯文本不报错、不进入 scanning）。`recognize` 抛异常时进入 `noboard` 分支并显示错误文案。

- [ ] **Step 3: 手动验证正常路径**

Run: `npm run build && npm start`，浏览器开页面，截图后 Ctrl+V：
- 显示原截图与识别出的棋盘，两者并排
- 显示平均置信度百分比
- Console 无报错

- [ ] **Step 4: 手动验证 Review Focus 1（粘贴非图片）**

复制一段网页文字（含 FEN 字符串），在页面 Ctrl+V：
Expected: 页面无变化、无红字、无 spinner 卡住；Console 无异常。

- [ ] **Step 5: 手动验证 Review Focus 3（超大截图）**

把一张 3840×2160 全屏截图粘进去：
Expected: 数秒内出结果；不因内存或尺寸报错。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: paste or drop a screenshot and render the recognized board"
```

---

### Task 6: 走子方 / 易位 / 翻转 + 拒绝状态 + 送入按钮

**Files:**
- Modify: `src/main.js`, `src/style.css`, `index.html`

**Interfaces:**
- Consumes: Task 2 的 `composeFen` / `isPlausible`，Task 3 的 `POST /handoff`，Task 5 的 `state` 与 `render()`
- Produces: 页面上的三个控件 + 一个"送入 En Croissant"按钮 + 一个"复制 FEN"降级按钮

- [ ] **Step 1: 加状态与控件**

`state` 增加 `turn: "w" | "b"`（默认 `"w"`）、`castling: "inferred" | "none"`（默认 `"inferred"`）、`flipped: boolean`（默认取 `orientation === "black"`）。任一控件变化都重算 `fen = composeFen(state.placement, {...})` 并重绘：棋盘、FEN 文本、易位权实际取值（如 `KQkq` 或 `-`）。

- [ ] **Step 2: 加拒绝与警告分支**

按 spec 5.8 实现四个分支，全部是红色 `role="alert"` 横幅：

| 条件 | 文案要点 | 按钮 |
|---|---|---|
| `scan.reliable === false` | 最差格子置信度 + "请核对棋子" | 送入前需再确认一次 |
| `isPlausible(placement) === false` | "王数不对，这可能不是合法局面" | 送入前需再确认一次 |
| `new Chess(fen)` 抛错 | 显示 `chess.js` 的错误信息 | **禁用**送入 |
| 无任何问题 | 不显示横幅 | 正常 |

- [ ] **Step 3: 接入 `POST /handoff` 与 `config.json`**

"送入"按钮 POST `{fen}` 到同源 `/handoff`。200 时按钮短暂变"已送入"；400/500 时把 `error` 原文显示在横幅里。**`enCroissantPath` 未配置时（页面启动时 `GET /healthz` 返回 `configured: false`），界面隐藏"送入"按钮，只留"复制 FEN"** —— 不要靠试探 `POST /handoff` 的报错来决定。

- [ ] **Step 4: 手动验证走子方正确**

把一个黑方走的中局摆进去，切到 Black，点送入。
Expected: En Croissant 打开该局面，走子指示为黑方（界面底部/棋盘方向）。

- [ ] **Step 5: 手动验证降级路径**

把 `config.json` 的 `enCroissantPath` 改成不存在的路径，重启服务，重载页面点送入。
Expected: 显示错误提示；"复制 FEN"仍可用；不出现"已送入"。

- [ ] **Step 6: 手动验证 Review Focus 2（棋盘被裁掉）**

把截图裁成只剩半个棋盘粘贴：
Expected: 落到 `reliable: false` 或 `plausible: false` 的警告分支，不崩、不静默送入。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: side-to-move, castling and flip controls with refusal states"
```

---

### Task 7: fixtures 回归模式、`start.bat`、README

**Files:**
- Create: `test/fixtures/*.png`、`test/expected.json`、`start.bat`、`README.md`、`config.example.json`
- Modify: `src/main.js`

**Interfaces:**
- Consumes: Task 5/6 的 `scanImage` 与 `composeFen`
- Produces: 页面 `?fixtures=1` 模式（依次识别 `test/fixtures/*.png`，逐行显示 `文件名 | 期望 | 实际 | PASS/FAIL/EXPECT-REJECT`）

- [ ] **Step 1: 复制测试图与期望值**

从 fenshot 仓库（已在 `/d/tmp/fenshot-recon`）复制 `packages/fenshot/tests/fixtures/*.png` 到 `test/fixtures/`，按 `packages/fenshot/tests/fixtures/testset-manifest.json` 生成 `test/expected.json`，值为 `{ "fen": "<placement>", "expect": "match" | "low-confidence-reject" | "no-board" }`。README 里注明图源为 fenshot（MIT）。

- [ ] **Step 2: 实现 `?fixtures=1`**

`new URLSearchParams(location.search).get("fixtures") === "1"` 时，`fetch("/fixtures/expected.json")` 后逐个 `fetch("/fixtures/<name>")` 取 `blob` 走**生产那条** `scanImage` 管线，结果渲染成表格。判定规则：`expect: "match"` → FEN 的 placement 段相等且 `reliable === true`；`"low-confidence-reject"` → `reliable === false`；`"no-board"` → `recognize` 返回 `null`。

- [ ] **Step 3: 手动跑回归**

Run: `npm run build && npm start`，打开 `http://127.0.0.1:8787/?fixtures=1`
Expected: 8 行中 `expect: "match"` 的 6 行 PASS，`lichess-italian-horsey.png` 与 `reddit-chrome-no-board.png` 按各自期望显示通过，无一行 FAIL。

- [ ] **Step 4: 写 `start.bat`**

```bat
@echo off
cd /d "%~dp0"
if not exist dist ( call npm run build )
start "" http://127.0.0.1:8787/
node src/server.mjs
```

- [ ] **Step 5: 写 `config.example.json` 与 README**

`config.example.json` 内容为 spec 5.6 的四个键，`enCroissantPath` 给出 `C:\\Program Files\\En Croissant\\en-croissant.exe` 示例。README 必须覆盖：安装 En Croissant、如何找到 exe 路径、`maia3-cache --model maia3-5m` 预下 checkpoint 与在 En Croissant 里添加 `maia3-5m` 为 UCI 引擎的步骤、`npm install && npm run build && start.bat`、`?fixtures=1` 回归怎么跑、已知限制（spec 第 9 节四条 + 只能识别 2D 正视图 + 走子方/易位需人工确认）。

- [ ] **Step 6: 端到端手动验收**

按 spec 第 7 节逐项过一遍并在 README 的"验收记录"里打勾；任何一项没过就停下来记到 README 的"已知问题"，不要标成通过。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "test: fixture regression mode; docs: README, config example and start script"
```

---

## 验收（对应 spec 第 7 节）

Task 7 Step 6 逐项核对。未通过项一律记入 README 的"已知问题"，不得标为通过。
