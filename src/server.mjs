import { appendFileSync, createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { describeListenError, launchProcess, openInBrowser } from "./spawn-helpers.mjs";
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

/** Why the handoff button is or isn't available. The page shows `reason`
 *  verbatim, so a user who mistyped the path is told which path it looked for
 *  instead of a dead end. */
function configStatus(config) {
  if (config.configError) {
    return { configured: false, reason: config.configError };
  }
  if (!config.enCroissantPath) {
    return { configured: false, reason: "config.json 里没有填 enCroissantPath" };
  }
  if (!existsSync(config.enCroissantPath)) {
    return {
      configured: false,
      reason: `enCroissantPath 指向的文件不存在：${config.enCroissantPath}`,
    };
  }
  return { configured: true, reason: "" };
}

function isConfigured(config) {
  return configStatus(config).configured;
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
    launchProcess(config.enCroissantPath, pgnPath ? [pgnPath] : []);
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

async function handleHandoff(req, res, ctx) {
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

  const live = ctx.currentConfig();
  const status = configStatus(live);
  if (!status.configured) {
    json(res, 400, { ok: false, error: status.reason });
    return;
  }

  const pgnPath = join(live.pgnTempDir, "position.pgn");
  try {
    mkdirSync(live.pgnTempDir, { recursive: true });
    writeFileSync(pgnPath, buildPositionPgn(fen), "utf8");
  } catch (err) {
    appendLog(live, handoffLogEntry({ fen, meta: payload, handedOff: false }));
    json(res, 500, { ok: false, error: `写入 PGN 失败: ${err.message}` });
    return;
  }

  try {
    (ctx.deps.launch ?? defaultLaunch(live))(pgnPath);
  } catch (err) {
    appendLog(live, handoffLogEntry({ fen, meta: payload, handedOff: false }));
    json(res, 500, { ok: false, error: `启动 En Croissant 失败: ${err.message}` });
    return;
  }

  appendLog(live, handoffLogEntry({ fen, meta: payload, handedOff: true }));
  json(res, 200, { ok: true, pgnPath });
}

export function createServer(config, deps = {}) {
  const staticRoot = resolve(deps.staticRoot ?? "dist");
  const fixtureRoot = resolve(deps.fixtureRoot ?? "test/fixtures");
  // When the entry point supplies reloadConfig, config.json is re-read per
  // request, so fixing a typo is a click on 「重新检测」 rather than a restart.
  // A broken config.json must not take a request down: report it the same way
  // as any other unusable config.
  const currentConfig = () => {
    try {
      return deps.reloadConfig ? deps.reloadConfig() : config;
    } catch (err) {
      return { ...config, enCroissantPath: "" , configError: err.message };
    }
  };

  return createHttpServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname;

    if (pathname === "/healthz") {
      json(res, 200, { ok: true, ...configStatus(currentConfig()) });
      return;
    }

    if (pathname === "/open") {
      if (req.method !== "POST") {
        json(res, 405, { ok: false, error: "只接受 POST" });
        return;
      }
      const live = currentConfig();
      const status = configStatus(live);
      if (!status.configured) {
        json(res, 400, { ok: false, error: status.reason });
        return;
      }
      try {
        (deps.launch ?? defaultLaunch(live))(null); // no position: just bring the app up
      } catch (err) {
        json(res, 500, { ok: false, error: `启动 En Croissant 失败: ${err.message}` });
        return;
      }
      json(res, 200, { ok: true });
      return;
    }

    if (pathname === "/handoff") {
      if (req.method !== "POST") {
        json(res, 405, { ok: false, error: "只接受 POST" });
        return;
      }
      void handleHandoff(req, res, { currentConfig, deps });
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
  const server = createServer(config, { reloadConfig: () => loadConfig() });
  server.on("error", (err) => {
    console.error(describeListenError(err, config.port));
    process.exit(1);
  });
  server.listen(config.port, "127.0.0.1", () => {
    console.log("------------------------------------------------------------");
    console.log(`  已经启动了：${url}`);
    console.log("  这个黑色窗口就是服务本身，别关它（最小化就好）。");
    console.log("  浏览器没自动打开的话，手动复制上面这个地址。");
    console.log("------------------------------------------------------------");
    console.log(
      `  En Croissant：${isConfigured(config) ? "已连上" : "未连上"} —— ${
        configStatus(config).reason || config.enCroissantPath
      }`,
    );
    console.log("");
    // Opening the page from here (rather than from start.bat) means the
    // browser never races the server. MYCHESS_NO_OPEN=1 suppresses it.
    if (process.env.MYCHESS_NO_OPEN !== "1") openInBrowser(url);
  });
}
