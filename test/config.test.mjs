import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { loadConfig, DEFAULT_CONFIG } from "../src/config.mjs";

function tempConfig(content) {
  const dir = mkdtempSync(join(tmpdir(), "mychess-config-"));
  const file = join(dir, "config.json");
  writeFileSync(file, content);
  return file;
}

test("config.json 不存在时返回默认值且不抛错", () => {
  const missing = join(tmpdir(), "mychess-does-not-exist", "config.json");
  const config = loadConfig(missing);
  assert.equal(config.port, DEFAULT_CONFIG.port);
  assert.equal(config.enCroissantPath, "");
});

test("JSON 损坏时抛错且错误信息含文件路径", () => {
  const file = tempConfig("{ not json");
  assert.throws(
    () => loadConfig(file),
    (err) => err instanceof Error && err.message.includes(file),
  );
});

test("port 缺失时回落到 8787", () => {
  const file = tempConfig(JSON.stringify({ enCroissantPath: "C:\\x.exe" }));
  assert.equal(loadConfig(file).port, 8787);
});

test("port 在文件里被保留", () => {
  const file = tempConfig(JSON.stringify({ port: 9001 }));
  assert.equal(loadConfig(file).port, 9001);
});

test("logPath 与 pgnTempDir 被解析成绝对路径", () => {
  const file = tempConfig(JSON.stringify({ logPath: "logs/x.jsonl", pgnTempDir: "tmp/pgn" }));
  const config = loadConfig(file);
  assert.ok(isAbsolute(config.logPath), config.logPath);
  assert.ok(isAbsolute(config.pgnTempDir), config.pgnTempDir);
});

test("pgnTempDir 为空时回落到系统临时目录下的子目录", () => {
  const file = tempConfig(JSON.stringify({ pgnTempDir: "" }));
  const config = loadConfig(file);
  assert.ok(isAbsolute(config.pgnTempDir), config.pgnTempDir);
  assert.ok(config.pgnTempDir.startsWith(tmpdir()), config.pgnTempDir);
  assert.match(config.pgnTempDir, /mychess/);
});

test("enCroissantPath 原样保留，不做路径解析", () => {
  const file = tempConfig(JSON.stringify({ enCroissantPath: "C:\\Program Files\\En Croissant\\en-croissant.exe" }));
  assert.equal(loadConfig(file).enCroissantPath, "C:\\Program Files\\En Croissant\\en-croissant.exe");
});

test("enCroissantPath 里出现换行/制表符时抛出可读错误", () => {
  const file = tempConfig(JSON.stringify({ enCroissantPath: "D:\Program Files\nodejs\node.exe" }));
  assert.throws(
    () => loadConfig(file),
    (err) => err instanceof Error && /正斜杠|反斜杠/.test(err.message),
  );
});
