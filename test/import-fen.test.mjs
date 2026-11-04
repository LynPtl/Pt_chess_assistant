import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFenInput } from "../src/import-fen.mjs";

const ITALIAN = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1";

test("完整 FEN：拆出摆位、走子方、每侧易位权", () => {
  const out = parseFenInput(ITALIAN);
  assert.equal(out.placement, "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R");
  assert.equal(out.turn, "w");
  assert.deepEqual(out.castling, { w: "KQ", b: "kq" });
});

test("黑方走、只剩单侧易位权", () => {
  const out = parseFenInput("r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b Qk - 0 1");
  assert.equal(out.turn, "b");
  assert.deepEqual(out.castling, { w: "Q", b: "k" });
});

test("没有易位权时给 -", () => {
  const out = parseFenInput("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
  assert.deepEqual(out.castling, { w: "-", b: "-" });
});

test("只有 4 段的 FEN 也接受（补上 0 1）", () => {
  const out = parseFenInput("r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -");
  assert.equal(out.placement.startsWith("r1bqk1nr/"), true);
  assert.equal(out.turn, "w");
});

test("前后空白、换行都能容忍", () => {
  assert.ok(parseFenInput(`  \n${ITALIAN}\n  `));
});

test("不是 FEN 的文本返回 null", () => {
  assert.equal(parseFenInput("hello world"), null);
  assert.equal(parseFenInput(""), null);
  assert.equal(parseFenInput("https://lichess.org/abcd1234"), null);
  assert.equal(parseFenInput("1. e4 e5 2. Nf3"), null);
});

test("棋子摆位非法（没有王）时返回 null", () => {
  assert.equal(parseFenInput("8/8/8/8/8/8/8/8 w - - 0 1"), null);
});

test("走子方非法时返回 null", () => {
  assert.equal(parseFenInput("4k3/8/8/8/8/8/8/4K3 x - - 0 1"), null);
});
