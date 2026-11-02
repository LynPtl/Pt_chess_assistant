import { test } from "node:test";
import assert from "node:assert/strict";
import { renderBoardSvg } from "../src/board.mjs";

const GLYPH = { P: "♙", N: "♘", B: "♗", R: "♖", Q: "♕", K: "♔" };

function pieceCells(svg) {
  return [...svg.matchAll(/<text x="(\d)" y="(\d)"[^>]*>([^<]+)<\/text>/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
    glyph: m[3],
  }));
}

test("画满 64 个格子", () => {
  const svg = renderBoardSvg("8/8/8/8/8/8/8/8", false);
  assert.equal((svg.match(/<rect /g) ?? []).length, 64);
});

test("摆位里的棋子落在正确的行列", () => {
  const cells = pieceCells(renderBoardSvg("8/8/8/8/8/8/8/K6k", false));
  assert.equal(cells.length, 2);
  const white = cells.find((c) => c.glyph === GLYPH.K);
  const black = cells.find((c) => c.glyph === "♚");
  // rank 1 是底行 → y = 7；a1 是左列 → x = 0
  assert.deepEqual({ x: white.x, y: white.y }, { x: 0, y: 7 });
  // h1 → x = 7
  assert.deepEqual({ x: black.x, y: black.y }, { x: 7, y: 7 });
});

test("大写字母渲染成白子字形，小写渲染成黑子字形", () => {
  const cells = pieceCells(renderBoardSvg("rnbqkbnr/8/8/8/8/8/8/RNBQKBNR", false));
  assert.equal(cells.filter((c) => c.glyph === "♜").length, 2); // a8, h8
  assert.equal(cells.filter((c) => c.glyph === "♖").length, 2); // a1, h1
  assert.equal(cells.filter((c) => c.glyph === "♞").length, 2); // b8, g8
  assert.equal(cells.filter((c) => c.glyph === "♘").length, 2); // b1, g1
});

test("flipped 时上下左右都镜像", () => {
  const cells = pieceCells(renderBoardSvg("8/8/8/8/8/8/8/K6k", true));
  const white = cells.find((c) => c.glyph === GLYPH.K);
  const black = cells.find((c) => c.glyph === "♚");
  assert.deepEqual({ x: white.x, y: white.y }, { x: 7, y: 0 });
  assert.deepEqual({ x: black.x, y: black.y }, { x: 0, y: 0 });
});

test("run-length 数字被正确展开", () => {
  const cells = pieceCells(renderBoardSvg("4k3/8/8/8/8/8/8/8", false));
  assert.deepEqual(cells.map((c) => ({ x: c.x, y: c.y })), [{ x: 4, y: 0 }]);
});
