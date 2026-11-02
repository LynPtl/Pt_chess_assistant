import { test } from "node:test";
import assert from "node:assert/strict";
import { castlingOptions } from "../src/castling.mjs";

// 意大利开局：王在 e1/e8，四个车都在角上
const ITALIAN = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R";
// 王都出了宫（下面的 a1 车还在，但王不在 e1 → 白方没有权利）
const KINGS_OFF = "r2q1rk1/pp2ppbp/2P3p1/2n1n3/2P5/P1N4P/1PB1QPP1/R1B2RK1";

const E1 = 60, A1 = 56, H1 = 63, E8 = 4, A8 = 0, H8 = 7;

test("王和两车都在原位时两侧都能有权利", () => {
  const white = castlingOptions(ITALIAN, "w", []);
  assert.equal(white.letters, "KQ");
  assert.equal(white.canHave, true);
  assert.equal(white.defaultLetters, "KQ");
  assert.match(white.reason, /原位/);
  assert.equal(castlingOptions(ITALIAN, "b", []).letters, "kq");
});

test("王不在原位时该侧没有权利，也不允许声称有", () => {
  const white = castlingOptions(KINGS_OFF, "w", []);
  assert.equal(white.letters, "-");
  assert.equal(white.canHave, false);
  assert.equal(white.defaultLetters, "-");
  assert.match(white.reason, /王不在 e1/);
});

test("上一步动过王 → 该侧默认无权利，但用户仍可声称有", () => {
  const white = castlingOptions(ITALIAN, "w", [E1, 52]); // e1 → f1 之类
  assert.equal(white.letters, "KQ", "位置上仍然支持");
  assert.equal(white.canHave, true, "用户还能手动改回有");
  assert.equal(white.defaultLetters, "-", "但默认应该是无");
  assert.match(white.reason, /动过王/);
});

test("上一步动过 h1 的车 → 默认只剩长易位", () => {
  const white = castlingOptions(ITALIAN, "w", [H1]);
  assert.equal(white.letters, "KQ");
  assert.equal(white.defaultLetters, "Q");
  assert.match(white.reason, /h1/);
});

test("上一步动过 a1 的车 → 默认只剩短易位", () => {
  const white = castlingOptions(ITALIAN, "w", [A1]);
  assert.equal(white.defaultLetters, "K");
  assert.match(white.reason, /a1/);
});

test("黑方的原位格用黑方的", () => {
  const black = castlingOptions(ITALIAN, "b", [E8]);
  assert.equal(black.letters, "kq");
  assert.equal(black.defaultLetters, "-");
  assert.match(black.reason, /动过王/);
});

test("王在原位但两个车都不在角上 → 没有可给的权利", () => {
  const white = castlingOptions("4k3/8/8/8/8/8/8/4K3", "w", []);
  assert.equal(white.letters, "-");
  assert.equal(white.canHave, false);
  assert.match(white.reason, /车/);
});

test("高亮格与易位无关时不影响判断", () => {
  const white = castlingOptions(ITALIAN, "w", [36, 28]); // e4 / e5
  assert.equal(white.defaultLetters, "KQ");
  assert.match(white.reason, /原位/);
});

test("resolveRights：auto 用推断值，on 用位置上支持的全部，off 用无", async () => {
  const { resolveRights } = await import("../src/castling.mjs");
  // 高亮动了 e1 → 推断两侧白方都无，但用户仍可强制「有」
  assert.deepEqual(
    resolveRights(ITALIAN, [E1], { w: "auto", b: "auto" }),
    { w: "-", b: "kq" },
  );
  assert.deepEqual(
    resolveRights(ITALIAN, [E1], { w: "on", b: "auto" }),
    { w: "KQ", b: "kq" },
  );
  assert.deepEqual(
    resolveRights(ITALIAN, [], { w: "auto", b: "off" }),
    { w: "KQ", b: "-" },
  );
});

test("resolveRights：位置上做不到时 on 也拿不到权利", async () => {
  const { resolveRights } = await import("../src/castling.mjs");
  assert.deepEqual(resolveRights(KINGS_OFF, [], { w: "on", b: "on" }), { w: "-", b: "-" });
});

test("resolveRights：摆位坏了也不抛错", async () => {
  const { resolveRights } = await import("../src/castling.mjs");
  assert.deepEqual(resolveRights("nonsense", [], { w: "auto", b: "auto" }), { w: "-", b: "-" });
});

test("describeChoice：推断落在哪个按钮上，就标在那个按钮里", async () => {
  const { castlingOptions, describeChoice } = await import("../src/castling.mjs");
  const options = castlingOptions(ITALIAN, "w", []); // 推断 KQ

  const auto = describeChoice(options, "auto");
  assert.equal(auto.onSelected, true);
  assert.equal(auto.badge, "on", "角标要在「有」里面");
  assert.equal(auto.reason, options.reason);

  const userOff = describeChoice(options, "off");
  assert.equal(userOff.onSelected, false);
  assert.equal(userOff.badge, null, "用户明确选过之后不再标推断");
});

test("describeChoice：推断是没有时，角标落在「无」里", async () => {
  const { castlingOptions, describeChoice } = await import("../src/castling.mjs");
  const options = castlingOptions(KINGS_OFF, "w", []); // 王不在 e1
  const auto = describeChoice(options, "auto");
  assert.equal(auto.onSelected, false);
  assert.equal(auto.badge, "off");
  assert.equal(auto.canHave, false);
});

test("describeChoice：推断被高亮削掉一半时仍然算「有」", async () => {
  const { castlingOptions, describeChoice } = await import("../src/castling.mjs");
  const options = castlingOptions(ITALIAN, "w", [H1]); // 动过 h1 → 只剩长易位
  const auto = describeChoice(options, "auto");
  assert.equal(auto.onSelected, true, "还剩一项权利，就该选「有」");
  assert.match(auto.reason, /h1/);
});
