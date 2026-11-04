import { test } from "node:test";
import assert from "node:assert/strict";
import { suspiciousSquares, CONFIDENCE_FLOOR } from "../src/suspicious.mjs";

const high = () => Array.from({ length: 64 }, () => 0.95);

test("全部高置信度时没有可疑格子", () => {
  assert.deepEqual(suspiciousSquares(high()), []);
});

test("低置信度的格子按棋盘下标返回（0=a8, 63=h1）", () => {
  const conf = high();
  // fenshot 的下标是 a1 起的：k=0 是 a1 → 棋盘下标 56
  conf[0] = 0.2;
  assert.deepEqual(suspiciousSquares(conf), [56]);
  // k=63 是 h8 → 棋盘下标 7
  const conf2 = high();
  conf2[63] = 0.2;
  assert.deepEqual(suspiciousSquares(conf2), [7]);
});

test("阈值就是 fenshot 的可靠线（0.7），等于阈值不算可疑", () => {
  const conf = high();
  conf[8] = CONFIDENCE_FLOOR;
  assert.deepEqual(suspiciousSquares(conf), []);
  conf[8] = CONFIDENCE_FLOOR - 0.01;
  assert.deepEqual(suspiciousSquares(conf), [48]); // tile 8 = a2
});

test("接近阈值时按比例缩小阈值（差一点点不该标红）", () => {
  const conf = high().map(() => 0.78);
  conf[0] = 0.75; // 绝对看低于 0.7 才算，0.75 不该标
  assert.deepEqual(suspiciousSquares(conf), []);
});

test("没有置信度数据（FEN/PGN 导入）时返回空", () => {
  assert.deepEqual(suspiciousSquares(undefined), []);
  assert.deepEqual(suspiciousSquares([]), []);
  assert.deepEqual(suspiciousSquares(new Array(10).fill(0.1)), []);
});
