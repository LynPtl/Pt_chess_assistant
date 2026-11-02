import { test } from "node:test";
import assert from "node:assert/strict";
import { renderBoardSvg } from "../src/board.mjs";

const GLYPH = { P: "♙", N: "♘", B: "♗", R: "♖", Q: "♕", K: "♔" };

function pieceCells(svg) {
  return [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*>([^<]+)<\/text>/g)].map((m) => ({
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
  // 棋子要画在格子中心：rank 1 是底行 → y = 7.5；a1 是左列 → x = 0.5
  assert.deepEqual({ x: white.x, y: white.y }, { x: 0.5, y: 7.5 });
  // h1 → x = 7.5
  assert.deepEqual({ x: black.x, y: black.y }, { x: 7.5, y: 7.5 });
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
  assert.deepEqual({ x: white.x, y: white.y }, { x: 7.5, y: 0.5 });
  assert.deepEqual({ x: black.x, y: black.y }, { x: 0.5, y: 0.5 });
});

test("run-length 数字被正确展开", () => {
  const cells = pieceCells(renderBoardSvg("4k3/8/8/8/8/8/8/8", false));
  assert.deepEqual(cells.map((c) => ({ x: c.x, y: c.y })), [{ x: 4.5, y: 0.5 }]);
});

test("每个格子都带 data-square 下标，方便点击编辑", () => {
  const svg = renderBoardSvg("8/8/8/8/8/8/8/8", false);
  const indices = [...svg.matchAll(/data-square="(\d+)"/g)].map((m) => Number(m[1]));
  assert.equal(indices.length, 64);
  assert.deepEqual(indices, Array.from({ length: 64 }, (_, i) => i));
});

test("翻转后 data-square 跟着格子走，不跟着数组位置走", () => {
  const svg = renderBoardSvg("8/8/8/8/8/8/8/8", true);
  const first = svg.match(/data-square="(\d+)"/);
  // 翻转时屏幕左上角是 h1，即下标 63
  assert.equal(Number(first[1]), 63);
});

test("棋子字形不吃鼠标事件，点击要能穿透到它下面的方块", () => {
  const svg = renderBoardSvg("r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R", false);
  const texts = [...svg.matchAll(/<text [^>]*>/g)].map((m) => m[0]);
  assert.equal(texts.length, 32);
  for (const tag of texts) {
    assert.match(tag, /pointer-events="none"/, `这个字形会吞点击: ${tag}`);
  }
});
