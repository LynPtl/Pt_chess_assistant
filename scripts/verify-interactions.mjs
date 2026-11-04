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
const pageErrors = [];
sock.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  // 未捕获异常几乎总是"某个处理函数被删了"——顺手抓下来，别只靠某次点击暴露
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
  new Promise((res, reject) => {
    const i = ++id;
    const timer = setTimeout(() => {
      pending.delete(i);
      reject(new Error(`${method} 超时（页面可能崩了）`));
    }, 15000);
    pending.set(i, (result) => {
      clearTimeout(timer);
      res(result);
    });
    sock.send(JSON.stringify({ id: i, method, params }));
  });
const ev = async (expr) =>
  (await call("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

await call("Runtime.enable");
// 无头页面上 window.confirm 会真的把渲染进程卡住，凡是需要确认的路径一律自动同意
await call("Runtime.evaluate", { expression: "window.confirm = () => true" });

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
check("一开始撤销是禁用的", (await ev('document.querySelector("[data-action=undo]").disabled')) === true);
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

// 撤销：按钮和 Ctrl+Z 都要能把局面退回去
await ev('document.querySelector("[data-piece=\\"q\\"]").click()');
await sleep(150);
await clickSquare(27);
const beforeUndo = await fen();
check("编辑后撤销可用", (await ev('document.querySelector("[data-action=undo]").disabled')) === false);
await ev('document.querySelector("[data-action=undo]").click()');
await sleep(300);
check("点撤销能退回上一步", (await fen()) === begun, beforeUndo);

await clickSquare(27);
await sleep(150);
await call("Input.dispatchKeyEvent", { type: "keyDown", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
await call("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
await sleep(300);
check("Ctrl+Z 能撤销", (await fen()) === begun);

// 「翻转视图」只是看的方向，绝不能改动 FEN（曾把易位权一起改掉）
const beforeFlip = await fen();
await ev(`document.querySelector('[data-action="flip"]').click()`);
await sleep(300);
check("翻转视图不改 FEN", (await fen()) === beforeFlip, await fen());
await ev(`document.querySelector('[data-action="flip"]').click()`);
await sleep(200);
check("翻转回来还是原样", (await fen()) === beforeFlip);

// 翻转视图时，易位权按钮也必须一字不变（曾出现"FEN 说有、按钮说没有"）
const castleState = () =>
  ev(`[...document.querySelectorAll('[data-action^=castle]')].map(b => b.className + '|' + b.disabled).join(',')`);
const castlesBefore = await castleState();
await ev(`document.querySelector('[data-action="flip"]').click()`);
await sleep(300);
check("翻转视图不改易位权按钮", (await castleState()) === castlesBefore, await castleState());
await ev(`document.querySelector('[data-action="flip"]').click()`);
await sleep(200);

check(
  "编辑器里没有重复的「旋转局面」按钮",
  (await ev(`document.querySelectorAll('[data-action="rotate"]').length`)) === 0,
);

// 提示条：送入 / 复制 FEN 之后必须能看见反馈。这条曾经因为
// noticeBlock() 少传参数而静默失效——按钮点了，页面毫无反应。
const configured = (await ev('document.querySelector(".service-status")?.classList.contains("ok")')) === true;
await ev('document.querySelector("[data-action=copy]")?.click()');
await sleep(600);
const copyNotice = await ev('document.querySelector(".notice")?.textContent ?? null');
check("点「复制 FEN」会给出提示", Boolean(copyNotice), copyNotice ?? "没有提示");

if (configured) {
  await ev('document.querySelector("[data-action=send]").click()');
  let sendNotice = null;
  for (let i = 0; i < 40 && !sendNotice; i++) {
    await sleep(150);
    sendNotice = await ev('document.querySelector(".notice")?.textContent ?? null');
  }
  check("点「送入」会给出提示（未捕获异常或提示条丢失）", Boolean(sendNotice), sendNotice ?? "没有提示");
} else {
  const hint = await ev('document.querySelector(".hint")?.textContent ?? ""');
  check("未配置时只提示复制 FEN", /还不能送入/.test(hint), hint);
}

chrome.kill("SIGKILL");

// FEN 粘贴单独用 scripts/verify-fen-paste.mjs 验（在识别结果页上做会被
// 之前那一串交互拖累，实测会让渲染进程卡住，与功能本身无关）。

check("页面没有未捕获异常", pageErrors.length === 0, pageErrors[0]?.split("\n")[0]);

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.detail ? "" : `  → ${r.detail}`}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length === 0 ? 0 : 1);
