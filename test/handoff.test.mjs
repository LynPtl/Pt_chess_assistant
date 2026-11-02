import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../src/server.mjs";

const FEN = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1";

const LOG_KEYS = [
  "castlingMode",
  "fen",
  "flipped",
  "handedOff",
  "meanConfidence",
  "minConfidence",
  "plausible",
  "reliable",
  "ts",
  "turn",
];

function makeWorkspace({ withExe = true, pgnDirName = "pgn" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "mychess-handoff-"));
  const exe = join(dir, "en-croissant.exe");
  if (withExe) writeFileSync(exe, "");
  const pgnTempDir = join(dir, pgnDirName);
  mkdirSync(pgnTempDir, { recursive: true });
  return { dir, exe, pgnTempDir, logPath: join(dir, "recognitions.jsonl") };
}

async function serve(t, config, launch) {
  const server = createServer(
    { enCroissantPath: "", port: 0, pgnTempDir: "", logPath: "", ...config },
    { staticRoot: mkdtempSync(join(tmpdir(), "mychess-static-")), launch },
  );
  server.listen(0, "127.0.0.1");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  await new Promise((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

function post(base, body) {
  return fetch(`${base}/handoff`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("合法 FEN：写入 PGN 并调用 launch，返回 200", async (t) => {
  const ws = makeWorkspace();
  const launched = [];
  const base = await serve(t, { enCroissantPath: ws.exe, pgnTempDir: ws.pgnTempDir, logPath: ws.logPath }, (p) =>
    launched.push(p),
  );

  const res = await post(base, { fen: FEN });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  const expectedPath = join(ws.pgnTempDir, "position.pgn");
  assert.equal(body.pgnPath, expectedPath);
  assert.deepEqual(launched, [expectedPath]);
  assert.ok(existsSync(expectedPath));
  const pgn = readFileSync(expectedPath, "utf8");
  assert.match(pgn, /\[SetUp "1"\]/);
  assert.ok(pgn.includes(`[FEN "${FEN}"]`), pgn);
});

test("FEN 不合法时返回 400 且不调用 launch", async (t) => {
  const ws = makeWorkspace();
  const launched = [];
  const base = await serve(t, { enCroissantPath: ws.exe, pgnTempDir: ws.pgnTempDir, logPath: ws.logPath }, (p) =>
    launched.push(p),
  );

  const res = await post(base, { fen: "not a fen" });

  assert.equal(res.status, 400);
  assert.equal((await res.json()).ok, false);
  assert.deepEqual(launched, []);
});

test("enCroissantPath 为空时返回 400 且提示未配置", async (t) => {
  const ws = makeWorkspace();
  const base = await serve(t, { enCroissantPath: "", pgnTempDir: ws.pgnTempDir, logPath: ws.logPath }, () => {});

  const res = await post(base, { fen: FEN });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.error, /enCroissantPath/);
});

test("enCroissantPath 指向不存在的文件时返回 400", async (t) => {
  const ws = makeWorkspace();
  const base = await serve(
    t,
    { enCroissantPath: join(ws.dir, "nope.exe"), pgnTempDir: ws.pgnTempDir, logPath: ws.logPath },
    () => {},
  );

  assert.equal((await post(base, { fen: FEN })).status, 400);
});

test("缺少 fen 字段时返回 400", async (t) => {
  const ws = makeWorkspace();
  const base = await serve(t, { enCroissantPath: ws.exe, pgnTempDir: ws.pgnTempDir, logPath: ws.logPath }, () => {});

  assert.equal((await post(base, {})).status, 400);
});

test("请求体不是 JSON 时返回 400", async (t) => {
  const ws = makeWorkspace();
  const base = await serve(t, { enCroissantPath: ws.exe, pgnTempDir: ws.pgnTempDir, logPath: ws.logPath }, () => {});

  assert.equal((await post(base, "{{{")).status, 400);
});

test("追加一行 JSONL 日志，字段恰为约定集合", async (t) => {
  const ws = makeWorkspace();
  const base = await serve(t, { enCroissantPath: ws.exe, pgnTempDir: ws.pgnTempDir, logPath: ws.logPath }, () => {});

  await post(base, { fen: FEN, meanConfidence: 0.97, minConfidence: 0.81, reliable: true, castlingMode: "inferred" });

  const lines = readFileSync(ws.logPath, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(entry).sort(), LOG_KEYS);
  assert.equal(entry.fen, FEN);
  assert.equal(entry.turn, "w");
  assert.equal(entry.plausible, true);
  assert.equal(entry.handedOff, true);
  assert.equal(entry.reliable, true);
  assert.equal(entry.castlingMode, "inferred");
  assert.ok(!Number.isNaN(Date.parse(entry.ts)), entry.ts);
});

test("临时目录路径含空格与中文时仍能正确写入", async (t) => {
  const ws = makeWorkspace({ pgnDirName: "中文 目录 名" });
  const launched = [];
  const base = await serve(t, { enCroissantPath: ws.exe, pgnTempDir: ws.pgnTempDir, logPath: ws.logPath }, (p) =>
    launched.push(p),
  );

  const res = await post(base, { fen: FEN });

  assert.equal(res.status, 200);
  const expectedPath = join(ws.pgnTempDir, "position.pgn");
  assert.deepEqual(launched, [expectedPath]);
  assert.ok(existsSync(expectedPath));
});

test("目标 PGN 路径不可写时返回 500 且 error 非空", async (t) => {
  const ws = makeWorkspace();
  mkdirSync(join(ws.pgnTempDir, "position.pgn"));
  const base = await serve(t, { enCroissantPath: ws.exe, pgnTempDir: ws.pgnTempDir, logPath: ws.logPath }, () => {});

  const res = await post(base, { fen: FEN });
  const body = await res.json();

  assert.equal(res.status, 500);
  assert.equal(body.ok, false);
  assert.ok(body.error.length > 0);
});
