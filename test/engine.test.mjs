import { test } from "node:test";
import assert from "node:assert/strict";
import { formatScore, parseInfoLine, pvToSan } from "../src/engine.mjs";

const ITALIAN = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1";

test("parseInfoLine：抓出深度、名次、评分、主变", () => {
  const line = "info depth 12 seldepth 15 multipv 2 score cp -34 nodes 12345 pv c5b6 d2d4";
  assert.deepEqual(parseInfoLine(line), {
    depth: 12,
    multipv: 2,
    cp: -34,
    mate: null,
    pv: ["c5b6", "d2d4"],
  });
});

test("parseInfoLine：将杀分、以及没有 pv 的行", () => {
  assert.deepEqual(parseInfoLine("info depth 9 multipv 1 score mate 3 pv a1a8"), {
    depth: 9,
    multipv: 1,
    cp: null,
    mate: 3,
    pv: ["a1a8"],
  });
  assert.equal(parseInfoLine("info depth 9 nodes 1000 nps 5000"), null);
  assert.equal(parseInfoLine("bestmove e2e4"), null);
  assert.equal(parseInfoLine(""), null);
});

test("parseInfoLine：缺 multipv 时按 1 处理（有些引擎不发）", () => {
  assert.equal(parseInfoLine("info depth 3 score cp 10 pv e2e4").multipv, 1);
});

test("formatScore：白方视角的正负号", () => {
  assert.equal(formatScore({ cp: 42 }), "+0.42");
  assert.equal(formatScore({ cp: -120 }), "-1.20");
  assert.equal(formatScore({ cp: 0 }), "0.00");
  assert.equal(formatScore({ mate: 3 }), "#3");
  assert.equal(formatScore({ mate: -2 }), "#-2");
});

test("pvToSan：把 UCI 着法转成正规记谱", () => {
  assert.deepEqual(pvToSan(ITALIAN, ["f3g5", "d7d5"]), ["Ng5", "d5"]);
});

test("pvToSan：着法不合法时就停在最后一个合法的", () => {
  assert.deepEqual(pvToSan(ITALIAN, ["f3g5", "a1a2"]), ["Ng5"]);
});

test("pvToSan：空输入返回空", () => {
  assert.deepEqual(pvToSan(ITALIAN, []), []);
});
