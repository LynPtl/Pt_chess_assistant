/** 界面文案的两种语言。
 *
 *  为什么这么晚才做：README 早就双语了，但界面一直是纯中文 —— 非中文访客点开线上
 *  demo 只能靠猜。这里把文案收进一张表，语言用 `?lang=` 或浏览器语言决定。
 *
 *  约定：
 *  - `t("key", { name: value })`，占位符写成 `{name}`
 *  - 找不到的 key 先回落到中文，再回落到 key 本身（永远不抛错）
 *  - Node 测试里没有 `location` / `navigator`，默认中文，所以既有断言不受影响
 */

const ZH = {
  // 顶部状态条
  shutdown: "停止服务",
  connected: "● 已连上 En Croissant",
  openApp: "打开 En Croissant",
  disconnected: "● 未连上 En Croissant —— {reason}",
  recheck: "重新检测",
  // 易位权
  castleWhite: "白方易位权",
  castleBlack: "黑方易位权",
  inferred: "推断",
  castleStill: "还有",
  castleLost: "已失去",
  // 编辑器
  erase: "擦除",
  eraseHint: "擦除（右键点格子更快）",
  undoTitle: "撤销上一步（Ctrl+Z）",
  undo: "↶ 撤销",
  // 动作行
  copyFen: "复制 FEN",
  copyLink: "复制链接",
  copyLinkTitle: "复制一个带当前局面的链接（打开就是这个局面）",
  lichess: "在 lichess 分析",
  lichessTitle: "把这个局面发到 lichess 分析（会在新标签页打开）",
  retry: "再试一张",
  send: "送入 En Croissant",
  cannotSend: "还不能送入：{reason}。改好 <code>config.json</code>，再点上面的「重新检测」。",
  closeFirst: "先关掉旧窗口",
  closeFirstTitle: "En Croissant 每次送入都会新开一个窗口；勾上就先把已开的关掉",
  // 首页
  dropTitle: "粘贴棋盘截图，或者一段 FEN",
  dropHint: "任意位置粘贴 · 拖入图片 · 或点这里选择文件",
  demoPrompt: "手边没有截图？",
  demoButton: "用这张示例图试一下",
  fenExample: "也可以直接粘贴一段 FEN，例如",
  scanning: "正在识别…",
  recentTitle: "最近识别过的局面",
  kindScreenshot: "截图",
  // 页脚
  footerPitchStatic: "想要 Maia 3 / Stockfish 的完整本地分析？",
  footerPitchLocal: "源码、问题反馈都在 GitHub。",
  footerLinkStatic: "在 GitHub 获取本地版",
  footerLinkLocal: "Pt chess assistant on GitHub",

  // ---- main.js ----
  notConnectedYet: "还没连上本地服务",
  confirmStop: "停止本地服务？停止后这个页面就不能再识别了，要用就重新运行 start.bat。",
  serviceStopped: "服务已停止。重新运行 start.bat 就能再用。",
  staticNoService: "静态版：没有本地服务",
  started: "已启动 En Croissant",
  startFailed: "启动失败",
  startFailedWith: "启动失败：{msg}",
  demoLoadFailed: "示例图加载失败：{msg}",
  scanFailed: "识别出错：{msg}",
  noBoardTitle: "没找到棋盘",
  noBoardHint: "图片里没有可识别的棋盘，试试裁紧一点或换一张截图。",
  yourScreenshot: "你的截图",
  yourScreenshotAlt: "你粘贴的截图",
  fromFen: "从 FEN 导入（未经识别，无需核对棋子）",
  fromPgn: "从 PGN 导入 · 最终局面（{n} 着，未经识别）",
  recognised: "识别结果 · 平均置信度 {n}%",
  edited: " · 已手动修正",
  suspectHint: "红框的 {n} 格识别把握不大，点它们修正",
  editHint: "点格子盖章 · 拖动棋子换位 · 右键擦掉",
  turnLabel: "走子方",
  turnInferred: "（高亮格推断：{who}刚走）",
  white: "白方",
  black: "黑方",
  board: "棋盘",
  flip: "翻转视图",
  confirmWarnings: "识别结果有警告，仍然送入 En Croissant？",
  sent: "已送入 En Croissant",
  sendFailed: "送入失败",
  sendFailedWith: "送入失败：{msg}",
  fenCopied: "FEN 已复制",
  copyFailed: "复制失败：{msg}",
  linkCopied: "链接已复制（打开就是当前局面）",
  pgnLoaded: "已从剪贴板载入 PGN（{n} 着，显示最终局面）",
  fenLoaded: "已从剪贴板导入 FEN",
  testImageFailed: "无法生成 {w}x{h} 的测试图",
};

const EN = {
  shutdown: "Stop service",
  connected: "● Connected to En Croissant",
  openApp: "Open En Croissant",
  disconnected: "● Not connected to En Croissant — {reason}",
  recheck: "Check again",
  castleWhite: "White castling",
  castleBlack: "Black castling",
  inferred: "inferred",
  castleStill: "Still has it",
  castleLost: "Lost",
  erase: "Erase",
  eraseHint: "Erase (right-click a square is faster)",
  undoTitle: "Undo the last edit (Ctrl+Z)",
  undo: "↶ Undo",
  copyFen: "Copy FEN",
  copyLink: "Copy link",
  copyLinkTitle: "Copy a link that opens this position",
  lichess: "Analyse on lichess",
  lichessTitle: "Send this position to lichess analysis (opens a new tab)",
  retry: "Try another",
  send: "Open in En Croissant",
  cannotSend: 'Can\'t hand off yet: {reason}. Fix <code>config.json</code>, then press "Check again".',
  closeFirst: "Close the old window first",
  closeFirstTitle: "En Croissant opens a new window for every hand-off; tick this to close the old one first",
  dropTitle: "Paste a board screenshot, or a FEN",
  dropHint: "paste anywhere · drag an image in · or click here to pick a file",
  demoPrompt: "No screenshot handy?",
  demoButton: "Try this example image",
  fenExample: "You can also paste a FEN, for example",
  scanning: "Reading the board…",
  recentTitle: "Recent positions",
  kindScreenshot: "shot",
  footerPitchStatic: "Want the full analysis with Maia 3 / Stockfish?",
  footerPitchLocal: "Source code and issues live on GitHub.",
  footerLinkStatic: "Get the local build on GitHub",
  footerLinkLocal: "Pt chess assistant on GitHub",

  notConnectedYet: "not connected to the local service yet",
  confirmStop: "Stop the local service? The page cannot recognise anything afterwards; re-run start.bat to use it again.",
  serviceStopped: "The service has stopped. Re-run start.bat to use it again.",
  staticNoService: "static build: no local service",
  started: "En Croissant started",
  startFailed: "Could not start it",
  startFailedWith: "Could not start it: {msg}",
  demoLoadFailed: "Could not load the example image: {msg}",
  scanFailed: "Recognition failed: {msg}",
  noBoardTitle: "No board found",
  noBoardHint: "That image has no recognisable chessboard — try a tighter crop or another screenshot.",
  yourScreenshot: "Your screenshot",
  yourScreenshotAlt: "The screenshot you pasted",
  fromFen: "Imported from a FEN (not recognised, nothing to check)",
  fromPgn: "Imported from a PGN · final position ({n} moves, not recognised)",
  recognised: "Recognised · mean confidence {n}%",
  edited: " · edited",
  suspectHint: "{n} squares were read with low confidence (red) — click to fix them",
  editHint: "Click a square to stamp · drag to move · right-click to erase",
  turnLabel: "Side to move",
  turnInferred: " (from the highlight: {who} just moved)",
  white: "White",
  black: "Black",
  board: "Board",
  flip: "Flip view",
  confirmWarnings: "The read has warnings. Send it to En Croissant anyway?",
  sent: "Sent to En Croissant",
  sendFailed: "Could not hand off",
  sendFailedWith: "Could not hand off: {msg}",
  fenCopied: "FEN copied",
  copyFailed: "Copy failed: {msg}",
  linkCopied: "Link copied — opening it shows this position",
  pgnLoaded: "Loaded a PGN from the clipboard ({n} moves; showing the final position)",
  fenLoaded: "Imported a FEN from the clipboard",
  testImageFailed: "Could not build a {w}x{h} test image",
};

export const LANGS = ["zh", "en"];

/** `?lang=` 优先；否则按浏览器语言；都不是就用英文（公开站点更常见）。 */
export function detectLang(search = "", navigatorLanguage = "") {
  const param = new URLSearchParams(search).get("lang");
  if (param && LANGS.includes(param)) return param;
  return String(navigatorLanguage).toLowerCase().startsWith("zh") ? "zh" : "en";
}

const inBrowser = typeof location !== "undefined";

let current = inBrowser
  ? detectLang(location.search, globalThis.navigator?.language ?? "")
  : "zh";

export function getLang() {
  return current;
}

/** 仅供测试与语言切换使用。 */
export function setLang(lang) {
  current = LANGS.includes(lang) ? lang : "zh";
}

/** @param {string} key @param {Record<string, string|number>} [vars] */
export function t(key, vars) {
  const template = (current === "en" ? EN : ZH)[key] ?? ZH[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    vars[name] === undefined ? match : String(vars[name]),
  );
}
