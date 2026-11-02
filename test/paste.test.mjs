import { test } from "node:test";
import assert from "node:assert/strict";
import { pickImageFile } from "../src/paste.mjs";

const file = { name: "shot.png", type: "image/png" };

test("剪贴板里只有文字时返回 null", () => {
  assert.equal(pickImageFile([{ type: "text/plain" }]), null);
  assert.equal(pickImageFile([{ type: "text/plain" }, { type: "text/html" }]), null);
});

test("剪贴板为空或缺失时返回 null", () => {
  assert.equal(pickImageFile([]), null);
  assert.equal(pickImageFile(undefined), null);
  assert.equal(pickImageFile(null), null);
});

test("剪贴板里有图片时返回该图片的 File", () => {
  const items = [{ type: "text/plain" }, { type: "image/png", getAsFile: () => file }];
  assert.equal(pickImageFile(items), file);
});

test("图片元素拿不到文件时返回 null", () => {
  assert.equal(pickImageFile([{ type: "image/png", getAsFile: () => null }]), null);
});
