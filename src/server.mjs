import { appendFileSync, createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { spawn } from "node:child_process";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { Chess } from "chess.js";
import { buildPositionPgn } from "./pgn.mjs";
import { isPlausible } from "./fen.mjs";

const MAX_BODY_BYTES = 8 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".onnx": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
};

function isConfigured(config) {
  return Boolean(config.enCroissantPath) && existsSync(config.enCroissantPath);
}

/** Map a URL path onto a file inside `root`, refusing anything that escapes it. */
function resolveInside(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const rel = normalize(decoded).replace(/^([/\\])+/, "");
  const full = resolve(root, rel);
  if (full !== root && !full.startsWith(root + sep)) return null;
  return full;
}

function sendFile(res, file, status = 200) {
  res.writeHead(status, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        rejectBody(Object.assign(new Error("请求体过大"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", rejectBody);
  });
}

function defaultLaunch(config) {
  return (pgnPath) => {
    spawn(config.enCroissantPath, [pgnPath], { detached: true, stdio: "ignore" }).unref();
  };
}

function appendLog(config, entry) {
  try {
    mkdirSync(dirname(config.logPath), { recursive: true });
    appendFileSync(config.logPath, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    /* 日志写不进去不该把已经成功的送入说成失败 */
  }
}

function handoffLogEntry({ fen, meta, handedOff }) {
  const fields = fen.split(" ");
  return {
    ts: new Date().toISOString(),
    fen,
    turn: fields[1] ?? null,
    castlingMode: meta.castlingMode ?? null,
    flipped: typeof meta.flipped === "boolean" ? meta.flipped : null,
    meanConfidence: typeof meta.meanConfidence === "number" ? meta.meanConfidence : null,
    minConfidence: typeof meta.minConfidence === "number" ? meta.minConfidence : null,
    reliable: typeof meta.reliable === "boolean" ? meta.reliable : null,
    plausible: isPlausible(fields[0] ?? ""),
    handedOff,
  };
}

async function handleHandoff(req, res, config, launch) {
  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    json(res, err.status ?? 400, { ok: false, error: err.message });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    json(res, 400, { ok: false, error: "请求体不是合法 JSON" });
    return;
  }
  if (payload === null || typeof payload !== "object") {
    json(res, 400, { ok: false, error: "请求体必须是对象" });
    return;
  }

  const fen = payload.fen;
  if (typeof fen !== "string" || fen.trim() === "") {
    json(res, 400, { ok: false, error: "缺少 fen 字段" });
    return;
  }
  try {
    new Chess(fen);
  } catch (err) {
    json(res, 400, { ok: false, error: `FEN 不合法: ${err.message}` });
    return;
  }

  if (!isConfigured(config)) {
    json(res, 400, { ok: false, error: "未配置 enCroissantPath，或该文件不存在" });
    return;
  }

  const pgnPath = join(config.pgnTempDir, "position.pgn");
  try {
    mkdirSync(config.pgnTempDir, { recursive: true });
    writeFileSync(pgnPath, buildPositionPgn(fen), "utf8");
  } catch (err) {
    appendLog(config, handoffLogEntry({ fen, meta: payload, handedOff: false }));
    json(res, 500, { ok: false, error: `写入 PGN 失败: ${err.message}` });
    return;
  }

  try {
    launch(pgnPath);
  } catch (err) {
    appendLog(config, handoffLogEntry({ fen, meta: payload, handedOff: false }));
    json(res, 500, { ok: false, error: `启动 En Croissant 失败: ${err.message}` });
    return;
  }

  appendLog(config, handoffLogEntry({ fen, meta: payload, handedOff: true }));
  json(res, 200, { ok: true, pgnPath });
}

export function createServer(config, deps = {}) {
  const staticRoot = resolve(deps.staticRoot ?? "dist");
  const fixtureRoot = resolve(deps.fixtureRoot ?? "test/fixtures");
  const launch = deps.launch ?? defaultLaunch(config);

  return createHttpServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname;

    if (pathname === "/healthz") {
      json(res, 200, { ok: true, configured: isConfigured(config) });
      return;
    }

    if (pathname === "/handoff") {
      if (req.method !== "POST") {
        json(res, 405, { ok: false, error: "只接受 POST" });
        return;
      }
      void handleHandoff(req, res, config, launch);
      return;
    }

    // /fixtures/* is served from the repo's fixture corpus; everything else
    // from the build output. The prefix has to come off before resolving.
    const isFixture = pathname.startsWith("/fixtures/");
    const root = isFixture ? fixtureRoot : staticRoot;
    const target = resolveInside(root, isFixture ? pathname.slice("/fixtures".length) : pathname);
    if (target === null) {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end("bad path");
      return;
    }

    const file = existsSync(target) && statSync(target).isDirectory() ? join(target, "index.html") : target;
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }

    sendFile(res, file);
  });
}

// `npm start` / start.bat entry point. Imported modules (tests) never trigger
// this, because only the main module satisfies the guard below.
const invokedAs = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedAs === import.meta.url) {
  const { loadConfig } = await import("./config.mjs");
  const config = loadConfig();
  const url = `http://127.0.0.1:${config.port}/`;
  createServer(config).listen(config.port, "127.0.0.1", () => {
    console.log(`mychess: ${url}`);
    console.log(
      `mychess: enCroissantPath = ${config.enCroissantPath || "(未配置)"} → ${
        isConfigured(config) ? "可用" : "不可用"
      }`,
    );
    // Opening the page from here (rather than from start.bat) means the
    // browser never races the server. MYCHESS_NO_OPEN=1 suppresses it.
    if (process.env.MYCHESS_NO_OPEN !== "1") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    }
  });
}
