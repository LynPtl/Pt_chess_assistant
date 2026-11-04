// 验收「静态版」：把 dist/ 用任何静态服务器托管起来，验证它真的不依赖后端。
//
//   npm run build:static
//   npx serve dist        （或 python -m http.server，或推到 Cloudflare Pages）
//   node scripts/verify-static.mjs http://127.0.0.1:3000/
//
// 检查的是：没有本地服务状态条、识别照常、按钮只剩「复制 FEN / 在 lichess 分析 /
// 再试一张」、编辑仍然可用，以及**整个流程没有一次请求打到 /healthz 之类**。
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:3000/";
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "static-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--window-size=1200,1000",
  "--remote-debugging-port=0", `--user-data-dir=${profile}`, base,
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
  console.error("没有页面 target（静态服务起来了吗？）");
  process.exit(2);
}

const sock = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const requests = [];
const pageErrors = [];
sock.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === "Runtime.exceptionThrown") {
    pageErrors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
  }
  if (msg.method === "Network.requestWillBeSent") {
    try {
      requests.push(new URL(msg.params.request.url).pathname);
    } catch {}
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
await call("Network.enable");
// 线上 CDN 冷启动可能慢，等到 dropzone 真的出现为止
for (let i = 0; i < 100; i++) {
  if (await ev('Boolean(document.querySelector(".dropzone, .result"))')) break;
  await sleep(200);
}

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

check("静态版不渲染本地服务状态条", (await ev('document.querySelectorAll(".service-status").length')) === 0);

// 首页那个「用这张示例图试一下」：点它只会加载示例图，
// 绝不能顺带弹出文件选择器（事件冒泡到 .dropzone 的老 bug）。
await ev(`(() => {
  window.__fileClicks = 0;
  document.querySelector("#file")?.addEventListener("click", (e) => { e.preventDefault(); window.__fileClicks++; });
  document.querySelector('[data-action="demo"]')?.click();
  return true;
})()`);
for (let i = 0; i < 60; i++) {
  if (await ev('Boolean(document.querySelector(".placement"))')) break;
  await sleep(250);
}
check("点「示例图」能出局面", Boolean(await ev('document.querySelector(".placement")?.textContent')), "没有 FEN");
check("点「示例图」不会顺带弹出文件选择器", (await ev("window.__fileClicks")) === 0, `触发了 ${await ev("window.__fileClicks")} 次`);
await ev(`document.querySelector('[data-action="reset"]')?.click()`);
for (let i = 0; i < 40; i++) {
  if (await ev('Boolean(document.querySelector(".dropzone"))')) break;
  await sleep(100);
}

// 用一张相对路径的图当"用户的截图"，走真实的 paste → 识别 路径
const sample = await ev(`(async () => {
  const img = "demo.png";
  if (!img) return "no-dropzone";
  const res = await fetch(img);
  if (!res.ok) return "no-sample:" + res.status;
  window.__file = new File([await res.blob()], "sample.png", { type: "image/png" });
  return "ok";
})()`);
check("随包发布的示例图 demo.png 可读", sample === "ok", sample);

if (sample === "ok") {
  await ev(`(() => {
    const dt = new DataTransfer();
    dt.items.add(window.__file);
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    return true;
  })()`);
  for (let i = 0; i < 80; i++) {
    if (await ev('Boolean(document.querySelector(".placement"))')) break;
    await sleep(250);
  }
  const fen = await ev('document.querySelector(".placement")?.textContent ?? null');
  check("静态版能完成识别", Boolean(fen) && fen.includes("/"), fen ?? "没有 FEN");
  check("棋盘棋子都画出来了", ((await ev('document.querySelectorAll("svg.board image").length')) ?? 0) >= 30);
  check("没有「送入 En Croissant」按钮", (await ev('document.querySelectorAll(\'[data-action="send"]\').length')) === 0);
  check(
    "给了 lichess 分析入口",
    (await ev('Boolean(document.querySelector(\'.actions a[href*="lichess.org/analysis"]\'))')) === true,
  );

  // 编辑仍然可用
  await ev('document.querySelector(\'[data-piece="q"]\').click()');
  await sleep(200);
  const before = await ev('document.querySelector(".placement").textContent');
  const box = await ev(`(() => {
    const r = document.querySelector('[data-square="27"]').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await call("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
  }
  await sleep(400);
  check("静态版仍然可以编辑棋盘", (await ev('document.querySelector(".placement").textContent')) !== before);
}

// 浏览器内引擎暂未接入（见 README 已知限制）：稳定性问题解决后再把这两条加回来。

// 页脚要把访客引到 GitHub（静态版能做的有限，完整分析在本地）
const footer = await ev(`(() => {
  const a = document.querySelector(".site-footer a");
  return a ? { href: a.getAttribute("href"), target: a.getAttribute("target"), text: a.textContent.trim() } : null;
})()`);
check("页脚有 GitHub 链接", Boolean(footer?.href?.includes("github.com/LynPtl/Pt_chess_assistant")), JSON.stringify(footer));
check("GitHub 链接新开标签页", footer?.target === "_blank", footer?.target ?? "(无)");

const apiHits = requests.filter((p) => /healthz|handoff|^\/open$|^\/shutdown$|fixtures\/expected/.test(p));
check("整个流程没有请求任何本地接口", apiHits.length === 0, apiHits.join(", "));
check("页面没有未捕获异常", pageErrors.length === 0, pageErrors[0]?.split("\n")[0]);

chrome.kill("SIGKILL");
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.detail ? "" : `  → ${r.detail}`}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length === 0 ? 0 : 1);
