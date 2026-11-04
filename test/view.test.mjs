import { test } from "node:test";
import assert from "node:assert/strict";
import { castlingControls, noticeBlock, paletteHtml, statusStrip } from "../src/view.mjs";

const ITALIAN = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R";
const KINGS_OFF = "r2q1rk1/pp2ppbp/2P3p1/2n1n3/2P5/P1N4P/1PB1QPP1/R1B2RK1";

test("statusStrip：连上时给「已连上」和「打开」按钮", () => {
  const html = statusStrip({ configured: true, reason: "" });
  assert.match(html, /已连上 En Croissant/);
  assert.match(html, /data-action="open-app"/);
  assert.match(html, /data-action="shutdown"/);
});

test("statusStrip：没连上时把原因写出来并给「重新检测」", () => {
  const html = statusStrip({ configured: false, reason: "enCroissantPath 指向的文件不存在" });
  assert.match(html, /未连上/);
  assert.match(html, /enCroissantPath/);
  assert.match(html, /data-action="refresh-health"/);
  assert.doesNotMatch(html, /data-action="open-app"/);
});

test("statusStrip：原因里的尖括号被转义，不会破坏 HTML", () => {
  const html = statusStrip({ configured: false, reason: "<script>x</script>" });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("noticeBlock：没有提示时是空串", () => {
  assert.equal(noticeBlock(null), "");
  const html = noticeBlock({ tone: "ok", text: "已送入" });
  assert.match(html, /notice-ok/);
  assert.match(html, /已送入/);
});

test("castlingControls：推断落在「有」里面，并写出字母", () => {
  const html = castlingControls({ placement: ITALIAN, castling: { w: "auto", b: "auto" }, highlights: [] });
  assert.equal((html.match(/data-action="castle-/g) ?? []).length, 4);
  assert.match(html, /有<span class="inferred-badge"[^>]*>推断<\/span>/);
  assert.match(html, /白方易位/);
  assert.match(html, /黑方易位/);
});

test("castlingControls：王不在原位时「有」被禁用，角标落到「无」", () => {
  const html = castlingControls({ placement: KINGS_OFF, castling: { w: "auto", b: "auto" }, highlights: [] });
  assert.ok((html.match(/disabled/g) ?? []).length >= 2);
  assert.match(html, /无<span class="inferred-badge"[^>]*>推断<\/span>/);
  assert.match(html, /王不在 e1/);
});

test("paletteHtml：12 个棋子加一个小的擦除按钮", () => {
  const urls = Object.fromEntries("KQRBNPkqrbnp".split("").map((c) => [c, `/p/${c}.svg`]));
  const html = paletteHtml({ activePiece: null, pieceUrls: urls, palette: "KQRBNPkqrbnp".split("") });
  assert.equal((html.match(/data-piece=/g) ?? []).length, 13);
  assert.match(html, /palette-btn small/);
  assert.match(html, /data-piece=""/);
});

test("paletteHtml：选中的那颗按钮带 on", () => {
  const urls = Object.fromEntries("KQRBNPkqrbnp".split("").map((c) => [c, `/p/${c}.svg`]));
  const html = paletteHtml({ activePiece: "q", pieceUrls: urls, palette: "KQRBNPkqrbnp".split("") });
  assert.match(html, /class="palette-btn on" data-piece="q"/);
});

test("actionsRow：撤销不放这里（它属于棋盘编辑器）", async () => {
  const { actionsRow } = await import("../src/view.mjs");
  assert.doesNotMatch(actionsRow({ configured: true, blocked: false }), /data-action="undo"/);
});

test("actionsRow：未配置时没有送入按钮，只提示复制 FEN", async () => {
  const { actionsRow } = await import("../src/view.mjs");
  const html = actionsRow({ canUndo: false, configured: false, blocked: false, reason: "路径不存在" });
  assert.doesNotMatch(html, /data-action="send"/);
  assert.match(html, /还不能送入/);
  assert.match(html, /路径不存在/);
});

test("actionsRow：局面不合法时送入按钮禁用", async () => {
  const { actionsRow } = await import("../src/view.mjs");
  const html = actionsRow({ canUndo: false, configured: true, blocked: true });
  assert.match(html, /data-action="send"[^>]*disabled/);
});

test("paletteHtml：撤销放在调色板那一行，紧跟擦除", async () => {
  const { paletteHtml } = await import("../src/view.mjs");
  const urls = Object.fromEntries("KQRBNPkqrbnp".split("").map((c) => [c, `/p/${c}.svg`]));

  const withHistory = paletteHtml({ activePiece: null, pieceUrls: urls, palette: "KQRBNPkqrbnp".split(""), canUndo: true });
  assert.match(withHistory, /data-action="undo"/);
  assert.doesNotMatch(withHistory, /data-action="undo"[^>]*disabled/);
  // 撤销和擦除在同一行（palette-erase 里）
  const eraseRow = withHistory.slice(withHistory.indexOf("palette-erase"));
  assert.match(eraseRow, /data-action="undo"/);

  const withoutHistory = paletteHtml({ activePiece: null, pieceUrls: urls, palette: "KQRBNPkqrbnp".split(""), canUndo: false });
  assert.match(withoutHistory, /data-action="undo"[^>]*disabled/);
});

test("dropzoneHtml：首页同时提示截图和 FEN 两种用法", async () => {
  const { dropzoneHtml } = await import("../src/view.mjs");
  const html = dropzoneHtml({ busy: false });
  assert.match(html, /FEN/, "提示里要提到能粘贴 FEN");
  assert.match(html, /Ctrl/);
  assert.match(html, /拖入图片/);
  assert.match(html, /type="file"/);
  assert.match(html, /data-zone="drop"/);
});

test("dropzoneHtml：识别中不允许再点开文件选择", async () => {
  const { dropzoneHtml } = await import("../src/view.mjs");
  const busy = dropzoneHtml({ busy: true });
  assert.match(busy, /正在识别/);
  assert.match(busy, /class="dropzone busy"/);
});

test("actionsRow：静态模式只留复制 FEN 和 lichess 分析", async () => {
  const { actionsRow } = await import("../src/view.mjs");
  const html = actionsRow({
    staticMode: true,
    canCopy: true,
    fen: "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1",
  });
  assert.doesNotMatch(html, /data-action="send"/);
  assert.doesNotMatch(html, /close-first/);
  assert.doesNotMatch(html, /还不能送入/);
  assert.match(html, /data-action="copy"/);
  assert.match(html, /lichess\.org\/analysis\/standard\//);
  // lichess 要的格式：摆位保留 /，字段之间用下划线
  assert.match(html, /analysis\/standard\/r1bqk1nr\/pppp1ppp\/2n5\/[^"]*w_KQkq/);
});

test("actionsRow：静态模式下没有局面时不给 lichess 链接", async () => {
  const { actionsRow } = await import("../src/view.mjs");
  const html = actionsRow({ staticMode: true, fen: null });
  assert.doesNotMatch(html, /lichess\.org/);
  assert.match(html, /再试一张/);
});

test("statusStrip：静态模式不渲染本地服务状态", async () => {
  const { statusStrip } = await import("../src/view.mjs");
  assert.equal(statusStrip({ configured: true, reason: "" }, { staticMode: true }), "");
});

test("actionsRow：lichess 入口带外链图标、且用主题色区分", async () => {
  const { actionsRow } = await import("../src/view.mjs");
  const fen = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1";
  const html = actionsRow({ staticMode: true, fen });
  assert.match(html, /class="btn accent"/);
  assert.match(html, /<svg class="ext-icon"/, "要有外链图标");
  assert.match(html, /target="_blank" rel="noreferrer"/, "外链要新开标签页");
  assert.match(html, /在 lichess 分析<svg/, "图标在文字后面");
});
