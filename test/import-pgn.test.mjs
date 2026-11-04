import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePgnInput } from "../src/import-pgn.mjs";
import { splitCastling } from "../src/import-fen.mjs";

const PGN = `[Event "Casual game"]
[Site "lichess.org"]
[White "a"]
[Black "b"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0`;

test("载入一段 PGN：给最终局面、走子方、着数", () => {
  const out = parsePgnInput(PGN);
  assert.ok(out, "应该认出来");
  assert.equal(out.moveCount, 10);
  assert.equal(out.placement.split("/").length, 8);
  assert.ok(["w", "b"].includes(out.turn));
  // 白方已经 O-O（王到 g1）→ 白方两侧权利都没了；黑方一步没动 → kq 都在
  assert.equal(splitCastling(out.fen.split(" ")[2]).w, "-");
  assert.equal(splitCastling(out.fen.split(" ")[2]).b, "kq");
});

test("没有走法的 PGN 也能读（只给起始局面）", () => {
  const out = parsePgnInput(`[Event "x"]\n\n*`);
  assert.ok(out);
  assert.equal(out.moveCount, 0);
});

test("带 FEN 头的 PGN 从那个局面开始算", () => {
  const out = parsePgnInput(`[Event "x"]\n[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/8/R3K3 w - - 0 1"]\n\n1. Ra2 Kd7 *`);
  assert.ok(out);
  assert.ok(out.placement.includes("R6K") === false);
  assert.equal(out.moveCount, 2);
});

test("普通文本不会被当成 PGN", () => {
  assert.equal(parsePgnInput("hello world"), null);
  assert.equal(parsePgnInput("https://lichess.org/abcd1234"), null);
  assert.equal(parsePgnInput("随便一段中文"), null);
  assert.equal(parsePgnInput(""), null);
});

test("想冒充 PGN 但着法非法时返回 null", () => {
  assert.equal(parsePgnInput("1. e4 e5 2. Qxf7"), null);
});
