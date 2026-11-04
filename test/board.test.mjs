import { test } from "node:test";
import assert from "node:assert/strict";
import { renderBoardSvg } from "../src/board.mjs";

// 测试里用假 URL，真实 URL 由 Vite 在构建时给
const PIECES = {
  K: "/p/wK.svg", Q: "/p/wQ.svg", R: "/p/wR.svg", B: "/p/wB.svg", N: "/p/wN.svg", P: "/p/wP.svg",
  k: "/p/bK.svg", q: "/p/bQ.svg", r: "/p/bR.svg", b: "/p/bB.svg", n: "/p/bN.svg", p: "/p/bP.svg",
};

// <image> 的 x/y 是左上角，所以换算成格子中心再断言
function draws(svg) {
  return [...svg.matchAll(/<image [^>]*href="([^"]+)" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map(
    (m) => ({
      href: m[1],
      x: Number(m[2]) + Number(m[4]) / 2,
      y: Number(m[3]) + Number(m[5]) / 2,
    }),
  );
}

test("画满 64 个格子", () => {
  const svg = renderBoardSvg("8/8/8/8/8/8/8/8", false, PIECES);
  assert.equal((svg.match(/<rect /g) ?? []).length, 64);
});

test("摆位里的棋子按 lichess 素材画在格子中心", () => {
  const cells = draws(renderBoardSvg("8/8/8/8/8/8/8/K6k", false, PIECES));
  assert.equal(cells.length, 2);
  const white = cells.find((c) => c.href === "/p/wK.svg");
  const black = cells.find((c) => c.href === "/p/bK.svg");
  // a1 是左下角：x≈0.5, y≈7.5
  assert.ok(Math.abs(white.x - 0.5) < 0.2, String(white.x));
  assert.ok(Math.abs(white.y - 7.5) < 0.2, String(white.y));
  assert.ok(Math.abs(black.x - 7.5) < 0.2, String(black.x));
});

test("大小写映射到不同素材", () => {
  const cells = draws(renderBoardSvg("rnbqkbnr/8/8/8/8/8/8/RNBQKBNR", false, PIECES));
  assert.equal(cells.filter((c) => c.href === "/p/wR.svg").length, 2);
  assert.equal(cells.filter((c) => c.href === "/p/bR.svg").length, 2);
  assert.equal(cells.filter((c) => c.href === "/p/wN.svg").length, 2);
  assert.equal(cells.filter((c) => c.href === "/p/bN.svg").length, 2);
});

test("flipped 时上下左右都镜像", () => {
  const cells = draws(renderBoardSvg("8/8/8/8/8/8/8/K6k", true, PIECES));
  const white = cells.find((c) => c.href === "/p/wK.svg");
  const black = cells.find((c) => c.href === "/p/bK.svg");
  assert.ok(Math.abs(white.x - 7.5) < 0.2);
  assert.ok(Math.abs(white.y - 0.5) < 0.2);
  assert.ok(Math.abs(black.x - 0.5) < 0.2);
});

test("run-length 数字被正确展开", () => {
  const cells = draws(renderBoardSvg("4k3/8/8/8/8/8/8/8", false, PIECES));
  assert.equal(cells.length, 1);
  assert.ok(Math.abs(cells[0].x - 4.5) < 0.2);
  assert.ok(Math.abs(cells[0].y - 0.5) < 0.2);
});

test("每个格子都带 data-square 下标，方便点击编辑", () => {
  const svg = renderBoardSvg("8/8/8/8/8/8/8/8", false, PIECES);
  const indices = [...svg.matchAll(/data-square="(\d+)"/g)].map((m) => Number(m[1]));
  assert.equal(indices.length, 64);
  assert.deepEqual(indices, Array.from({ length: 64 }, (_, i) => i));
});

test("翻转后 data-square 跟着格子走，不跟着数组位置走", () => {
  const svg = renderBoardSvg("8/8/8/8/8/8/8/8", true, PIECES);
  const first = svg.match(/data-square="(\d+)"/);
  assert.equal(Number(first[1]), 63);
});

test("棋子图片不吃鼠标事件，点击要能穿透到它下面的方块", () => {
  const svg = renderBoardSvg("r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R", false, PIECES);
  const images = [...svg.matchAll(/<image [^>]*>/g)].map((m) => m[0]);
  assert.equal(images.length, 32);
  for (const tag of images) {
    assert.match(tag, /pointer-events="none"/, `这个棋子会吞点击: ${tag}`);
  }
});

test("棋子图片带 data-at 下标，拖拽时能定位到它", () => {
  const svg = renderBoardSvg("8/8/8/8/8/8/8/K6k", false, PIECES);
  const at = [...svg.matchAll(/data-at="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(at.sort((a, b) => a - b), [56, 63]); // a1 / h1
});

test("可疑格子会画上虚线框，其余不受影响", () => {
  const svg = renderBoardSvg("8/8/8/8/8/8/8/K6k", false, PIECES, { suspicious: [56, 63] });
  const marks = [...svg.matchAll(/class="sq-suspect" data-square="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(marks.sort((a, b) => a - b), [56, 63]);
  // 格子本身还是 64 个
  assert.equal((svg.match(/class="sq"/g) ?? []).length, 64);
});

test("翻转时虚线框跟着格子走（位置对，不是数组下标）", () => {
  const svg = renderBoardSvg("8/8/8/8/8/8/8/8", true, PIECES, { suspicious: [56] });
  // 翻转后 a1 画在屏幕右上角
  const mark = svg.match(/class="sq-suspect" data-square="56" x="([\d.]+)" y="([\d.]+)"/);
  assert.ok(mark, "没找到标记");
  assert.equal(Math.floor(Number(mark[1])), 7);
  assert.equal(Math.floor(Number(mark[2])), 0);
});

test("没有可疑格子时不画任何虚线框", () => {
  const svg = renderBoardSvg("8/8/8/8/8/8/8/K6k", false, PIECES);
  assert.equal((svg.match(/sq-suspect/g) ?? []).length, 0);
});
