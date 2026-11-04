// 验收「粘贴一段 FEN 直接摆棋」这条路径。
//
// 单独一个脚本，因为它需要一个干净的页面：在识别结果页上做这件事会被前面那一串
// 交互（拖拽捕获、撤销等）拖累，实测会让无头渲染进程不再响应 CDP 命令。
// 走子方与易位权必须原样照抄 FEN，而不是像截图那样靠推断。
//
// Usage: node scripts/verify-fen-paste.mjs [baseUrl]
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:8787";
const CHROME = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean).find((p) => existsSync(p));
if (!CHROME) {
  console.error("找不到 Chrome/Edge，设置 CHROME_PATH");
  process.exit(2);
}

const FEN = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b Qk - 0 1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "fenpaste-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--window-size=1200,1000",
  "--remote-debugging-port=0", `--user-data-dir=${profile}`, `${base}/`,
], { stdio: "ignore" });

let port;
for (let i = 0; i < 150 && !port; i++) {
  try {
    const file = join(profile, "DevToolsActivePort");
    if (existsSync(file)) port = Number(readFileSync(file, "utf8").split("\n")[0]);
  } catch {}
  if (!port) await sleep(100);
}
let target;
for (let i = 0; i < 100 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
  } catch {}
  if (!target) await sleep(150);
}
if (!target) {
  console.error("没有页面 target（服务起来了吗？）");
  process.exit(2);
}

const sock = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const pageErrors = [];
sock.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === "Runtime.exceptionThrown") {
    pageErrors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
  }
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
});
await new Promise((r) => sock.addEventListener("open", r));
const call = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    sock.send(JSON.stringify({ id: i, method, params }));
  });
const ev = async (expr) =>
  (await call("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

await call("Runtime.enable");
for (let i = 0; i < 200; i++) {
  if ((await ev("String(!!window.__done)")) === "true") break;
  await sleep(100);
}

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

// 非 FEN 文本不该有任何反应
await ev(`(() => { const dt = new DataTransfer(); dt.setData("text/plain", "随便一段文字"); window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); return true; })()`);
await sleep(300);
check("粘贴非 FEN 文本无反应", (await ev('document.querySelector(".placement")')) === null);

// 真正的 FEN
await ev(`(() => {
  const dt = new DataTransfer();
  dt.setData("text/plain", ${JSON.stringify(FEN)});
  window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  return true;
})()`);
await sleep(800);

const fen = await ev('document.querySelector(".placement")?.textContent ?? null');
check("FEN 原样摆出（走子方 b、易位权 Qk 都照抄）", fen === FEN, fen);
check("不显示截图", (await ev(`document.querySelectorAll('img[alt="你粘贴的截图"]').length`)) === 0);
const caption = await ev('document.querySelector(".board-figure figcaption")?.textContent ?? ""');
check(
  "标题说明这是导入的 FEN、不是识别结果",
  /FEN/i.test(caption) && !/confidence/i.test(caption),
  caption.replace(/\s+/g, " ").slice(0, 60),
);
check(
  "走子方选的是黑方",
  /(^|\s)on(\s|$)/.test(await ev('document.querySelector("[data-action=turn-b]")?.className ?? ""')),
  await ev('document.querySelector("[data-action=turn-b]")?.className ?? "(没找到按钮)"'),
);
check("有提示告知已导入", /FEN/.test(await ev('document.querySelector(".notice")?.textContent ?? ""')));
check("页面没有未捕获异常", pageErrors.length === 0, pageErrors[0]?.split("\n")[0]);

chrome.kill("SIGKILL");
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.detail ? "" : `  → ${r.detail}`}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length === 0 ? 0 : 1);
