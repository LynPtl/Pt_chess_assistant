import { test } from "node:test";
import assert from "node:assert/strict";
import { composeFen, flipPlacement, inferCastling, isPlausible } from "../src/fen.mjs";

const ITALIAN = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R";

test("composeFen 推断出双方四个易位权", () => {
  assert.equal(
    composeFen(ITALIAN, { turn: "w", rights: { w: "KQ", b: "kq" }, flipped: false }),
    "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1",
  );
});

test("castling: none 时清空易位权", () => {
  assert.equal(
    composeFen(ITALIAN, { turn: "b", rights: { w: "-", b: "-" }, flipped: false }),
    "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b - - 0 1",
  );
});

test("flipped 时 180 度旋转摆位", () => {
  assert.equal(flipPlacement("R3K2R/8/8/8/8/8/8/8"), "8/8/8/8/8/8/8/R2K3R");
  assert.equal(
    flipPlacement("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"),
    "RNBKQBNR/PPPPPPPP/8/8/8/8/pppppppp/rnbkqbnr",
  );
});

test("flipped: true 时 composeFen 使用旋转后的摆位", () => {
  assert.equal(
    composeFen("8/8/8/8/8/8/8/R3K2R", { turn: "w", rights: { w: "KQ", b: "-" }, flipped: true }),
    "R2K3R/8/8/8/8/8/8/8 w KQ - 0 1",
  );
});

test("王离位则不给该侧易位权", () => {
  assert.equal(inferCastling("4k3/8/8/8/8/8/8/R2Q1K1R"), "-");
});

test("两侧都在原位时给出对应权利", () => {
  assert.equal(inferCastling("4k2r/8/8/8/8/8/8/R3K2R"), "KQk");
});

test("isPlausible 要求双方各恰好一个王", () => {
  assert.equal(isPlausible(ITALIAN), true);
  assert.equal(isPlausible("8/8/8/8/8/8/8/8"), false);
  assert.equal(isPlausible("4k3/8/8/8/8/8/8/4K2K"), false);
});

test("composeFen：吃过路兵字段能被写进去", async () => {
  const { composeFen } = await import("../src/fen.mjs");
  assert.equal(
    composeFen(ITALIAN, { turn: "b", rights: { w: "-", b: "-" }, flipped: false, enPassant: "e3" }),
    "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b - e3 0 1",
  );
  assert.equal(
    composeFen(ITALIAN, { turn: "w", rights: { w: "-", b: "-" }, flipped: false }),
    "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w - - 0 1",
  );
});
