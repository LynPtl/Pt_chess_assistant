import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeFixture } from "../src/fixtures.mjs";

const ITALIAN = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R";
const match = { fen: ITALIAN, expect: "match", orientation: "white" };
const good = { kind: "result", placement: ITALIAN, reliable: true, orientation: "white" };

test("match：摆位、朝准、置信度都对时通过", () => {
  assert.deepEqual(judgeFixture(match, good), { pass: true, reason: "ok" });
});

test("match：摆位不同则失败并指出差异", () => {
  const verdict = judgeFixture(match, { ...good, placement: "8/8/8/8/8/8/8/8" });
  assert.equal(verdict.pass, false);
  assert.match(verdict.reason, /摆位/);
});

test("match：低置信度即使摆位正确也算失败", () => {
  const verdict = judgeFixture(match, { ...good, reliable: false });
  assert.equal(verdict.pass, false);
  assert.match(verdict.reason, /置信度/);
});

test("match：朝向不符则失败", () => {
  const verdict = judgeFixture(match, { ...good, orientation: "black" });
  assert.equal(verdict.pass, false);
  assert.match(verdict.reason, /朝向/);
});

test("low-confidence-reject：被标为不可信才算通过", () => {
  assert.equal(judgeFixture({ fen: ITALIAN, expect: "low-confidence-reject" }, { ...good, reliable: false }).pass, true);
  assert.equal(judgeFixture({ fen: ITALIAN, expect: "low-confidence-reject" }, good).pass, false);
});

test("no-board：没找到棋盘才算通过", () => {
  assert.deepEqual(judgeFixture({ fen: null, expect: "no-board" }, { kind: "noboard" }), {
    pass: true,
    reason: "ok",
  });
  const verdict = judgeFixture({ fen: null, expect: "no-board" }, good);
  assert.equal(verdict.pass, false);
  assert.match(verdict.reason, /棋盘/);
});

test("未知的 expect 值直接判失败，而不是当成通过", () => {
  const verdict = judgeFixture({ fen: ITALIAN, expect: "whatever" }, good);
  assert.equal(verdict.pass, false);
  assert.match(verdict.reason, /whatever/);
});
