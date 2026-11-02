// Headless-browser check without Playwright: launch Chrome with a DevTools
// endpoint, wait for the page's own completion promise, and print the value.
//
// Why this exists: the recognition pipeline only exists in a browser (canvas
// + createImageBitmap + wasm). Node can test everything else, but "does a real
// screenshot become the right FEN" can only be answered by a browser, and
// `chrome --dump-dom` returns at load time, before the async work finishes.
//
// Usage: node scripts/browser-check.mjs "<url>" [--timeout=60000]
// Prints JSON: {"ok":true,"value":...} or {"ok":false,"error":...}
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean);

const url = process.argv[2];
const timeoutArg = process.argv.find((a) => a.startsWith("--timeout="));
const timeoutMs = timeoutArg ? Number(timeoutArg.split("=")[1]) : 60_000;
if (!url) {
  console.error("usage: node scripts/browser-check.mjs <url> [--timeout=ms]");
  process.exit(2);
}

const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chromePath) {
  console.error(JSON.stringify({ ok: false, error: "找不到 Chrome/Edge，设置 CHROME_PATH" }));
  process.exit(2);
}

const profile = mkdtempSync(join(tmpdir(), "mychess-chrome-"));
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    url,
  ],
  { stdio: "ignore" },
);

const deadline = Date.now() + timeoutMs;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForEndpoint() {
  const portFile = join(profile, "DevToolsActivePort");
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      const [port] = readFileSync(portFile, "utf8").split("\n");
      if (port) return Number(port);
    }
    await sleep(100);
  }
  throw new Error("Chrome 没有打开 DevTools 端口");
}

async function waitForPage(port) {
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* endpoint not up yet */
    }
    await sleep(100);
  }
  throw new Error("没有找到页面 target");
}

const EXPRESSION = `(async () => {
  while (!window.__done) await new Promise((r) => setTimeout(r, 50));
  return await window.__done;
})()`;

function evaluate(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => reject(new Error("求值超时")), Math.max(1000, deadline - Date.now()));
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression: EXPRESSION, awaitPromise: true, returnByValue: true },
        }),
      );
    });
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      if (msg.error) return reject(new Error(msg.error.message));
      const { result, exceptionDetails } = msg.result;
      if (exceptionDetails) {
        return reject(new Error(exceptionDetails.exception?.description ?? exceptionDetails.text));
      }
      resolve(result.value);
    });
    ws.addEventListener("error", () => reject(new Error("WebSocket 连接失败")));
  });
}

/** Chrome hands us the target before the initial navigation swaps the
 *  execution context, so the first evaluate can lose its context. Retry. */
async function evaluateWithRetry(wsUrl) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await evaluate(wsUrl);
    } catch (err) {
      lastError = err;
      if (!/context was destroyed|Cannot find context|求值超时/i.test(String(err))) throw err;
      await sleep(400);
    }
  }
  throw lastError;
}

try {
  const port = await waitForEndpoint();
  const wsUrl = await waitForPage(port);
  const value = await evaluateWithRetry(wsUrl);
  console.log(JSON.stringify({ ok: true, value }));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err) }));
  process.exitCode = 1;
} finally {
  chrome.kill("SIGKILL");
}
