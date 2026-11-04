import { test } from "node:test";
import assert from "node:assert/strict";
import { readStaticMode } from "../src/mode.mjs";

test("VITE_STATIC=1 才算静态模式", () => {
  assert.equal(readStaticMode({ VITE_STATIC: "1" }), true);
});

test("没设、设成 0 或其他值都不算", () => {
  assert.equal(readStaticMode({}), false);
  assert.equal(readStaticMode({ VITE_STATIC: "0" }), false);
  assert.equal(readStaticMode({ VITE_STATIC: "" }), false);
  assert.equal(readStaticMode(undefined), false);
});
