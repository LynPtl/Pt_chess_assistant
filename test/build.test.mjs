import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const DIST = resolve("dist");
const built = existsSync(join(DIST, "index.html"));
const skip = built ? false : "dist/ 不存在：先跑 npm run build（构建产物不进 git）";

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

test("dist/index.html 存在且引用了 js 资源", { skip }, () => {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  assert.match(html, /<script[^>]+src=/);
});

test("dist 中包含 ort wasm 与 onnx 模型文件", { skip }, () => {
  const files = walk(DIST);
  assert.ok(
    files.some((f) => f.endsWith(".wasm")),
    "dist 里没有 .wasm",
  );
  assert.ok(
    files.some((f) => f.endsWith(".onnx")),
    "dist 里没有 .onnx",
  );
});

test("dist 中的 wasm 与模型体积非零", { skip }, () => {
  const files = walk(DIST);
  const wasm = files.find((f) => f.endsWith(".wasm"));
  const onnx = files.find((f) => f.endsWith(".onnx"));
  assert.ok(statSync(wasm).size > 1_000_000, `wasm 太小: ${statSync(wasm).size}`);
  assert.ok(statSync(onnx).size > 1_000_000, `onnx 太小: ${statSync(onnx).size}`);
});

test("package.json 声明了 Node 版本下限（glob 与 import.meta.resolve 都需要）", () => {
  const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  assert.ok(pkg.engines?.node, "缺少 engines.node");
  assert.match(pkg.engines.node, /2[2-9]|3\d/);
  assert.equal(pkg.type, "module");
});
