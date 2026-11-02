import { test } from "node:test";
import assert from "node:assert/strict";
import { cycleSquare, squareToIndex } from "../src/edit.mjs";

// 索引与棋盘渲染一致：0 = a8，63 = h1（即 FEN 摆位从左到右、从上到下）。
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

test("squareToIndex 把 a8/h1/e4 映射到正确的线性下标", () => {
  assert.equal(squareToIndex(0, 0), 0); // a8
  assert.equal(squareToIndex(7, 7), 63); // h1
  assert.equal(squareToIndex(4, 4), 36); // e4
});

test("空格子点一下变成白兵，再右键退回空格", () => {
  const empty = "8/8/8/8/8/8/8/8";
  const withPawn = cycleSquare(empty, squareToIndex(4, 4), 1); // e4
  // 第 5 行是 rank 4，所以 e4 的兵写成 8/8/8/8/4P3/8/8/8
  assert.equal(withPawn, "8/8/8/8/4P3/8/8/8");
  assert.equal(cycleSquare(withPawn, squareToIndex(4, 4), -1), empty);
});

test("白兵点一下变白马，白王点一下变黑兵", () => {
  assert.equal(cycleSquare("8/8/8/8/8/8/8/P7", 56, 1), "8/8/8/8/8/8/8/N7");
  assert.equal(cycleSquare("8/8/8/8/8/8/8/K7", 56, 1), "8/8/8/8/8/8/8/p7");
});

test("黑王点一下变回空格", () => {
  assert.equal(cycleSquare("k7/8/8/8/8/8/8/8", 0, 1), "8/8/8/8/8/8/8/8");
});

test("反向循环是正向的逆操作", () => {
  const once = cycleSquare("8/8/8/8/8/8/8/P7", 56, 1);
  assert.equal(cycleSquare(once, 56, -1), "8/8/8/8/8/8/8/P7");
});

test("连点 13 下回到原样", () => {
  let placement = "8/8/8/8/8/8/8/N7";
  for (let i = 0; i < 13; i++) placement = cycleSquare(placement, 56, 1);
  assert.equal(placement, "8/8/8/8/8/8/8/N7");
});

test("改一格不动别的格子", () => {
  const after = cycleSquare(START, squareToIndex(4, 0), 1); // e8 上的黑王
  assert.equal(after, "rnbq1bnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
});

test("摆位格式不对时原样返回，不抛错", () => {
  assert.equal(cycleSquare("nonsense", 0, 1), "nonsense");
  assert.equal(cycleSquare("8/8/8", 0, 1), "8/8/8");
});
