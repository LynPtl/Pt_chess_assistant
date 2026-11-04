// Interaction-level regression: drives the real page with real mouse events.
//
// Why this exists: the unit tests cover pure functions, but a refactor can still
// delete a function that a DOM handler calls — the page then fails silently and
// only a click reveals it. That happened once (drag-to-move), so it is checked
// here with pointer events that go through the browser's own hit testing.
//
// Usage: node scripts/verify-interactions.mjs [baseUrl]
// Exit code 0 = all interactions behaved, 1 = something regressed.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:8787";
const url = `${base}/?selftest=chesscom-italian-white.png`;
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
const profile = mkdtempSync(join(tmpdir(), "verify-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--window-size=1200,1000",
  "--remote-debugging-port=0", `--user-data-dir=${profile}`, url,
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
sock.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
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

for (let i = 0; i < 200; i++) {
  const done = await ev("String(!!window.__done)");
  if (done === "true") break;
  await sleep(100);
}
await call("Runtime.evaluate", { expression: "window.__done", awaitPromise: true, returnByValue: true });

const centre = (index) =>
  ev(`(() => { const r = document.querySelector('[data-square="${index}"]').getBoundingClientRect();
       return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const fen = () => ev('document.querySelector(".placement").textContent');

async function clickSquare(index, button = "left") {
  const p = await centre(index);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await call("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button, clickCount: 1 });
  }
  await sleep(250);
}

async function dragSquare(from, to) {
  const a = await centre(from);
  const b = await centre(to);
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", clickCount: 1 });
  for (let k = 1; k <= 5; k++) {
    await call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: a.x + ((b.x - a.x) * k) / 5,
      y: a.y + ((b.y - a.y) * k) / 5,
      button: "left",
    });
  }
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", clickCount: 1 });
  await sleep(300);
}

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

const begun = await fen();
check("页面渲染出 FEN", Boolean(begun), begun);
check("调色板 13 项", (await ev('document.querySelectorAll("[data-piece]").length')) === 13);
check("两侧易位按钮共 4 个", (await ev('document.querySelectorAll("[data-action^=castle]").length')) === 4);
check("棋盘棋子都带 data-at", (await ev('document.querySelectorAll("svg.board image[data-at]").length')) > 0);

// 盖章
await ev('document.querySelector("[data-piece=\\"q\\"]").click()');
await sleep(200);
await clickSquare(27); // d5
const stamped = await fen();
check("选子后点格子能盖章", stamped !== begun && stamped.includes("2bqp3"), stamped);

// 右键擦除
await clickSquare(27, "right");
const erased = await fen();
check("右键能擦掉", erased === begun, erased);

// 拖拽换位（先取消选中）
await ev('document.querySelector("[data-piece=\\"q\\"]").click()');
await sleep(150);
await dragSquare(36, 20); // e4 兵 → e6
const dragged = await fen();
check("拖动棋子能换位", dragged !== begun && dragged.includes("2n1P3"), dragged);

// 撤销？没有；再拖回去，确认可逆
await dragSquare(20, 36);
check("再拖回来能复原", (await fen()) === begun);

chrome.kill("SIGKILL");

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.detail ? "" : `  → ${r.detail}`}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length === 0 ? 0 : 1);
