import { test } from "node:test";
import assert from "node:assert/strict";
import { stampSquare, squareToIndex, PIECE_CHARS } from "../src/edit.mjs";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

test("squareToIndex 把 a8/h1/e4 映射到正确的线性下标", () => {
  assert.equal(squareToIndex(0, 0), 0); // a8
  assert.equal(squareToIndex(7, 7), 63); // h1
  assert.equal(squareToIndex(4, 4), 36); // e4
});

test("PIECE_CHARS 是 12 个棋子加空串", () => {
  assert.equal(PIECE_CHARS.length, 13);
  assert.deepEqual(
    [...PIECE_CHARS].sort(),
    ["", "B", "K", "N", "P", "Q", "R", "b", "k", "n", "p", "q", "r"].sort(),
  );
});

test("往空格子盖一个白兵", () => {
  assert.equal(stampSquare("8/8/8/8/8/8/8/8", 36, "P"), "8/8/8/8/4P3/8/8/8"); // e4
});

test("盖子会替换原有棋子", () => {
  assert.equal(stampSquare(START, 36, "q"), "rnbqkbnr/pppppppp/8/8/4q3/8/PPPPPPPP/RNBQKBNR");
});

test("盖空串等于擦掉", () => {
  assert.equal(stampSquare(START, 4, ""), "rnbq1bnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"); // e8
});

test("首格和末格都能改", () => {
  assert.equal(stampSquare("8/8/8/8/8/8/8/8", 0, "r"), "r7/8/8/8/8/8/8/8");
  assert.equal(stampSquare("8/8/8/8/8/8/8/8", 63, "Q"), "8/8/8/8/8/8/8/7Q");
});

test("盖完的 run-length 仍然合法", () => {
  const out = stampSquare("8/8/8/8/8/8/8/8", 4, "N"); // index 4 = e8
  assert.equal(out, "4N3/8/8/8/8/8/8/8");
  assert.equal(out.split("/").length, 8);
  for (const rank of out.split("/")) {
    const width = [...rank].reduce((n, ch) => n + (ch >= "1" && ch <= "8" ? Number(ch) : 1), 0);
    assert.equal(width, 8, rank);
  }
});

test("未知棋子字符原样返回", () => {
  assert.equal(stampSquare(START, 36, "X"), START);
});

test("摆位格式不对或下标越界时原样返回，不抛错", () => {
  assert.equal(stampSquare("nonsense", 0, "P"), "nonsense");
  assert.equal(stampSquare("8/8/8", 0, "P"), "8/8/8");
  assert.equal(stampSquare(START, 64, "P"), START);
  assert.equal(stampSquare(START, -1, "P"), START);
});
