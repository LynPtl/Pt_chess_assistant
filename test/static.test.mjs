import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../src/server.mjs";

const CONFIG = { enCroissantPath: "", port: 0, pgnTempDir: "", logPath: "" };

function makeStaticRoot() {
  const root = mkdtempSync(join(tmpdir(), "mychess-static-"));
  writeFileSync(join(root, "index.html"), "<!doctype html><title>t</title>");
  writeFileSync(join(root, "a.wasm"), Buffer.from([0x00, 0x61, 0x73, 0x6d]));
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "assets", "app.js"), "export {};");
  return root;
}

async function serve(t, deps = {}) {
  const staticRoot = deps.staticRoot ?? makeStaticRoot();
  const server = createServer(CONFIG, { ...deps, staticRoot });
  server.listen(0, "127.0.0.1");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}`, staticRoot };
}

test("GET / 返回 index.html", async (t) => {
  const { base } = await serve(t);
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  assert.match(await res.text(), /<title>t<\/title>/);
});

test(".wasm 的 content-type 是 application/wasm", async (t) => {
  const { base } = await serve(t);
  const res = await fetch(`${base}/a.wasm`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/wasm");
});

test("assets 下的 .js 以 text/javascript 返回", async (t) => {
  const { base } = await serve(t);
  const res = await fetch(`${base}/assets/app.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/javascript/);
});

test("未知路径返回 404", async (t) => {
  const { base } = await serve(t);
  const res = await fetch(`${base}/nope.txt`);
  assert.equal(res.status, 404);
});

test("拒绝路径穿越，返回 400 或 404", async (t) => {
  const { base } = await serve(t);
  const res = await fetch(`${base}/assets/../../../etc/passwd`);
  assert.ok([400, 404].includes(res.status), `unexpected status ${res.status}`);
});

test("GET /healthz 返回 ok 与 configured 两个布尔字段", async (t) => {
  const { base } = await serve(t);
  const body = await (await fetch(`${base}/healthz`)).json();
  assert.equal(body.ok, true);
  assert.equal(body.configured, false);
});

test("/healthz 在 enCroissantPath 指向真实文件时 configured 为 true", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mychess-exe-"));
  const exe = join(dir, "en-croissant.exe");
  writeFileSync(exe, "");
  const server = createServer({ ...CONFIG, enCroissantPath: exe }, { staticRoot: makeStaticRoot() });
  server.listen(0, "127.0.0.1");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  const body = await (await fetch(`http://127.0.0.1:${port}/healthz`)).json();
  assert.equal(body.configured, true);
});

test("GET /fixtures/<name> 从 fixtureRoot 提供文件", async (t) => {
  const fixtures = mkdtempSync(join(tmpdir(), "mychess-fixtures-"));
  writeFileSync(join(fixtures, "board.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const { base } = await serve(t, { fixtureRoot: fixtures });
  const res = await fetch(`${base}/fixtures/board.png`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
});

test("/healthz 在路径为空时给出原因", async (t) => {
  const { base } = await serve(t);
  const body = await (await fetch(`${base}/healthz`)).json();
  assert.equal(body.configured, false);
  assert.match(body.reason, /enCroissantPath/);
});

test("/healthz 在路径不存在时给出该路径", async (t) => {
  const server = createServer(
    { ...CONFIG, enCroissantPath: "C:/nope/en-croissant.exe" },
    { staticRoot: makeStaticRoot() },
  );
  server.listen(0, "127.0.0.1");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  await new Promise((r) => server.once("listening", r));
  const body = await (await fetch(`http://127.0.0.1:${server.address().port}/healthz`)).json();
  assert.equal(body.configured, false);
  assert.ok(body.reason.includes("C:/nope/en-croissant.exe"), body.reason);
});

test("/healthz 在配置完好时 reason 为空", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mychess-exe2-"));
  const exe = join(dir, "en-croissant.exe");
  writeFileSync(exe, "");
  const server = createServer({ ...CONFIG, enCroissantPath: exe }, { staticRoot: makeStaticRoot() });
  server.listen(0, "127.0.0.1");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  await new Promise((r) => server.once("listening", r));
  const body = await (await fetch(`http://127.0.0.1:${server.address().port}/healthz`)).json();
  assert.equal(body.configured, true);
  assert.equal(body.reason, "");
});

test("/healthz 在提供 reloadConfig 时使用最新的配置（改配置不用重启）", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mychess-reload-"));
  const exe = join(dir, "en-croissant.exe");
  let path = "";
  const server = createServer(CONFIG, {
    staticRoot: makeStaticRoot(),
    reloadConfig: () => ({ ...CONFIG, enCroissantPath: path }),
  });
  server.listen(0, "127.0.0.1");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  await new Promise((r) => server.once("listening", r));
  const url = `http://127.0.0.1:${server.address().port}/healthz`;

  assert.equal((await (await fetch(url)).json()).configured, false);
  writeFileSync(exe, "");
  path = exe;
  const after = await (await fetch(url)).json();
  assert.equal(after.configured, true);
  assert.equal(after.reason, "");
});

test("reloadConfig 抛错（例如 config.json 写坏了）时 /healthz 仍返回 200 并给出原因", async (t) => {
  const server = createServer(CONFIG, {
    staticRoot: makeStaticRoot(),
    reloadConfig: () => {
      throw new Error("无法解析配置文件 D:\mychess\config.json: Unexpected token");
    },
  });
  server.listen(0, "127.0.0.1");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  await new Promise((r) => server.once("listening", r));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/healthz`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.configured, false);
  assert.match(body.reason, /无法解析配置文件/);
});
