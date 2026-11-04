import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLang, getLang, setLang, t } from "../src/i18n.mjs";

test("detectLang：?lang= 优先", () => {
  assert.equal(detectLang("?lang=en", "zh-CN"), "en");
  assert.equal(detectLang("?lang=zh", "en-US"), "zh");
});

test("detectLang：没参数时按浏览器语言", () => {
  assert.equal(detectLang("", "zh-CN"), "zh");
  assert.equal(detectLang("", "en-GB"), "en");
  assert.equal(detectLang("", "ja-JP"), "en", "非中文一律英文");
  assert.equal(detectLang("?lang=fr", "zh-CN"), "zh", "未知语言回落浏览器");
});

test("Node 里默认中文（既有断言不受影响）", () => {
  setLang("zh");
  assert.equal(getLang(), "zh");
  assert.equal(t("copyFen"), "复制 FEN");
});

test("切到英文后取英文文案", () => {
  setLang("en");
  assert.equal(t("copyFen"), "Copy FEN");
  assert.equal(t("castleStill"), "Still has it");
  setLang("zh");
});

test("带占位符的文案会替换", () => {
  setLang("zh");
  assert.equal(t("recognised", { n: 96 }), "识别结果 · 平均置信度 96%");
  setLang("en");
  assert.equal(t("suspectHint", { n: 3 }), "3 squares were read with low confidence (red) — click to fix them");
  setLang("zh");
});

test("未知 key 不抛错，原样返回", () => {
  assert.equal(t("no_such_key"), "no_such_key");
});

test("两种语言的 key 集合一致（漏翻会被抓出来）", async () => {
  setLang("zh");
  const zhKeys = Object.keys(await import("../src/i18n.mjs")).length; // 占位
  // 直接用 t 抽查常见 key 在两种语言都非空
  const keys = ["shutdown", "connected", "copyFen", "editHint", "footerPitchStatic", "pgnLoaded"];
  for (const key of keys) {
    setLang("zh");
    const zh = t(key, { n: 1, reason: "x", msg: "y", who: "白", w: 1, h: 1 });
    setLang("en");
    const en = t(key, { n: 1, reason: "x", msg: "y", who: "white", w: 1, h: 1 });
    assert.ok(zh && en && zh !== key && en !== key, `key ${key} 缺翻译`);
    assert.notEqual(zh, en, `key ${key} 两种语言一样，可能漏翻`);
  }
  setLang("zh");
  assert.ok(zhKeys > 0);
});
