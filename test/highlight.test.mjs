import { test } from "node:test";
import assert from "node:assert/strict";
import { findHighlights, greenExcess, inferTurn } from "../src/highlight.mjs";

// 真实数据：用户那张 lichess 截图上采的 64 格（a8..h1），取自
// test/fixtures/lichess-user-1816.png。45=f3 55、52=e2 47，其余 ≤7。
function samplesFrom(overrides = {}) {
  const base = Array.from({ length: 64 }, () => ({ r: 240, g: 217, b: 181 })); // 浅格 ~7
  for (const [index, rgb] of Object.entries(overrides)) base[Number(index)] = rgb;
  return base;
}

const REAL = samplesFrom({
  45: { r: 205, g: 210, b: 106 }, // f3 高亮（起点，空）
  52: { r: 178, g: 182, b: 92 }, // e2 高亮（终点，白后）
});

const PLACEMENT = "r2q1rk1/pp2ppbp/2P3p1/2n1n3/2P5/P1N4P/1PB1QPP1/R1B2RK1";

test("greenExcess 只量绿色超出红蓝均值的部分", () => {
  assert.equal(greenExcess({ r: 205, g: 210, b: 106 }), 54.5); // f3 高亮
  assert.equal(greenExcess({ r: 240, g: 217, b: 181 }), 6.5); // 普通浅格
});

test("真实截图里找出 f3 与 e2 两个高亮格", () => {
  assert.deepEqual(findHighlights(REAL), [45, 52]);
});

test("没有高亮的棋盘返回空数组", () => {
  assert.deepEqual(findHighlights(samplesFrom()), []);
});

test("只有一个格子发绿也算高亮（有的平台只染终点）", () => {
  const only = samplesFrom({ 52: { r: 178, g: 182, b: 92 } });
  assert.deepEqual(findHighlights(only), [52]);
});

test("绿色主题的棋盘不会把整盘当高亮", () => {
  const greenBoard = Array.from({ length: 64 }, (_, i) => ({
    r: 130,
    g: 165 + (i % 3),
    b: 110,
  }));
  const found = findHighlights(greenBoard);
  assert.ok(found.length <= 4, `找到太多: ${found.length}`);
  assert.deepEqual(found, []);
});

test("高亮格上站的是白子 → 轮到黑方", () => {
  const verdict = inferTurn(PLACEMENT, [45, 52]);
  assert.equal(verdict.turn, "b");
  assert.equal(verdict.mover, "w");
  assert.equal(verdict.square, 52); // e2
});

test("高亮格上站的是黑子 → 轮到白方", () => {
  // 把 e2 换成黑后，模拟黑方刚走完
  const blackJustMoved = "r2q1rk1/pp2ppbp/2P3p1/2n1n3/2P5/P1N4P/1PB1qPP1/R1B2RK1";
  assert.equal(inferTurn(blackJustMoved, [45, 52]).turn, "w");
});

test("只有起点被高亮（格子上没子）时判不出来", () => {
  assert.equal(inferTurn(PLACEMENT, [45]), null);
});

test("两个高亮格都有子时判不出来，不猜", () => {
  assert.equal(inferTurn(PLACEMENT, [52, 54]), null); // e2 白后 / g2 白兵，两个都有子
});

test("没有高亮时返回 null", () => {
  assert.equal(inferTurn(PLACEMENT, []), null);
});

test("samplePoints 给 64 个格子各 4 个取样点，且都落在格子内", async () => {
  const { samplePoints } = await import("../src/highlight.mjs");
  const points = samplePoints(0, 0, 800, 800);
  assert.equal(points.length, 64);
  for (const cell of points) {
    assert.equal(cell.length, 4);
    for (const [x, y] of cell) {
      assert.ok(x > 0 && x < 800 && y > 0 && y < 800, `${x},${y}`);
    }
  }
  // a8 的左上点应落在第一格内
  const [first] = points[0];
  assert.ok(first[0] > 0 && first[0] < 100, String(first[0]));
});

test("rotateHighlights：黑方视角的截图要把高亮格转 180° 才能和纠正后的摆位对齐", async () => {
  const { rotateHighlights } = await import("../src/highlight.mjs");
  assert.deepEqual(rotateHighlights([45, 52]), [18, 11]);
  assert.deepEqual(rotateHighlights([]), []);
});
