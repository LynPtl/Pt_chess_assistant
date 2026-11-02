import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePosition } from "../src/guards.mjs";

const ITALIAN = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1";

const clean = { fen: ITALIAN, reliable: true, minConfidence: 0.93, plausible: true };

test("置信度高且合法时不拦截、不需要二次确认", () => {
  const verdict = evaluatePosition(clean);
  assert.equal(verdict.blocked, false);
  assert.equal(verdict.needsConfirm, false);
  assert.deepEqual(verdict.warnings, []);
});

test("低置信度给出警告并要求二次确认，但不拦截", () => {
  const verdict = evaluatePosition({ ...clean, reliable: false, minConfidence: 0.46 });
  assert.equal(verdict.blocked, false);
  assert.equal(verdict.needsConfirm, true);
  assert.equal(verdict.warnings.length, 1);
  assert.match(verdict.warnings[0], /46%/);
});

// chess.js 自己就拒绝"缺王/多王"的 FEN，所以 plausible:false 永远走不到
// "只需要二次确认"那一档；它仍然值得存在，因为它给出的解释比
// "Invalid FEN: too many white kings" 更容易让人看懂。
test("王数不对时给出王数警告，并被合法性检查拦截", () => {
  const verdict = evaluatePosition({ ...clean, fen: "4k3/8/8/8/8/8/8/4K2K w - - 0 1", plausible: false });
  assert.equal(verdict.blocked, true);
  assert.ok(verdict.warnings.some((w) => /王/.test(w)), verdict.warnings.join(" | "));
});

test("不合法 FEN 直接拦截", () => {
  const verdict = evaluatePosition({ ...clean, fen: "not a fen" });
  assert.equal(verdict.blocked, true);
  assert.ok(verdict.warnings.length > 0);
});

test("多个问题同时出现时警告都保留，拦截优先于确认", () => {
  const verdict = evaluatePosition({ ...clean, reliable: false, plausible: false, fen: "junk" });
  assert.equal(verdict.blocked, true);
  assert.equal(verdict.warnings.length, 3);
});
