import { test } from "node:test";
import assert from "node:assert/strict";
import { squareAtPoint } from "../src/board-editing.mjs";
import { imageScale } from "../src/sampling.mjs";

const RECT = { left: 100, top: 50, width: 400, height: 400 }; // 每格 50px

test("squareAtPoint：左上角是 a8(0)，右下角是 h1(63)", () => {
  assert.equal(squareAtPoint(RECT, 110, 60), 0);
  assert.equal(squareAtPoint(RECT, 490, 440), 63);
});

test("squareAtPoint：格子中心映射正确", () => {
  assert.equal(squareAtPoint(RECT, 125, 75), 0); // a8 中心
  assert.equal(squareAtPoint(RECT, 475, 425), 63); // h1 中心
  assert.equal(squareAtPoint(RECT, 325, 275), 36); // e4 中心（e 列起点 300，d 列是 275）
});

test("squareAtPoint：落在棋盘外返回 null", () => {
  assert.equal(squareAtPoint(RECT, 99, 60), null); // 左边界外
  assert.equal(squareAtPoint(RECT, 110, 49), null); // 上边界外
  assert.equal(squareAtPoint(RECT, 501, 60), null); // 右边界外
  assert.equal(squareAtPoint(RECT, 110, 451), null); // 下边界外
});

test("imageScale：小图不放大，大图按 1600 长边缩", () => {
  assert.equal(imageScale(528, 525), 1);
  assert.equal(imageScale(3200, 1600), 0.5);
  assert.equal(imageScale(1600, 900), 1);
});
