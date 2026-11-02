import { test } from "node:test";
import assert from "node:assert/strict";
import { releaseResultUrl } from "../src/urls.mjs";

test("结果状态下释放图片 URL", () => {
  const revoked = [];
  releaseResultUrl({ kind: "result", imageUrl: "blob:x" }, (u) => revoked.push(u));
  assert.deepEqual(revoked, ["blob:x"]);
});

test("非结果状态下什么都不做", () => {
  const revoked = [];
  for (const state of [{ kind: "idle" }, { kind: "scanning" }, { kind: "noboard" }, null, undefined]) {
    releaseResultUrl(state, (u) => revoked.push(u));
  }
  assert.deepEqual(revoked, []);
});

test("同一个 URL 只释放一次也没关系（重复调用是安全的）", () => {
  const revoked = [];
  const revoke = (u) => revoked.push(u);
  releaseResultUrl({ kind: "result", imageUrl: "blob:y" }, revoke);
  releaseResultUrl({ kind: "result", imageUrl: "blob:y" }, revoke);
  assert.deepEqual(revoked, ["blob:y", "blob:y"]);
});
