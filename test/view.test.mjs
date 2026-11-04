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

test("actionsRow：有历史时给「撤销」，没有时禁用", async () => {
  const { actionsRow } = await import("../src/view.mjs");
  const withHistory = actionsRow({ canUndo: true, configured: true, blocked: false });
  assert.match(withHistory, /data-action="undo"/);
  assert.doesNotMatch(withHistory, /data-action="undo" disabled/);

  const withoutHistory = actionsRow({ canUndo: false, configured: true, blocked: false });
  assert.match(withoutHistory, /data-action="undo"[^>]*disabled/);
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
