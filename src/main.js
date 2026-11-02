import { createRecognizer, resolveOrientation } from "@scoriiu/fenshot";
import { renderBoardSvg } from "./board.mjs";
import { pickImageFile } from "./paste.mjs";
import { composeFen, flipPlacement, isPlausible } from "./fen.mjs";
import { evaluatePosition } from "./guards.mjs";
import { judgeFixture } from "./fixtures.mjs";
import "./style.css";

// src/ort/ and src/model/ are synced from node_modules by
// scripts/sync-assets.mjs (prebuild / postinstall). ?url makes Vite emit
// them as hashed assets and hand us the built URLs.
import ortMjsUrl from "./ort/ort-wasm-simd-threaded.mjs?url";
import ortWasmUrl from "./ort/ort-wasm-simd-threaded.wasm?url";
import modelUrl from "./model/chess-tiles-v2.onnx?url";

export const recognizer = createRecognizer({
  modelUrl,
  wasmPaths: { mjs: ortMjsUrl, wasm: ortWasmUrl },
});

const app = document.getElementById("app");

/** { kind: "idle" } | { kind: "scanning" } | { kind: "noboard", message? }
 *  | { kind: "result", scan, placement, orientation, imageUrl,
 *      turn: "w"|"b", castling: "inferred"|"none", flipped: boolean } */
export let state = { kind: "idle" };

let handoffAvailable = false;
let notice = null; // { tone: "ok" | "error", text }

export async function scanImage(blob) {
  state = { kind: "scanning" };
  notice = null;
  render();
  try {
    const scan = await recognizer.recognize(blob);
    if (!scan) {
      state = { kind: "noboard" };
      render();
      return;
    }
    const { placement, orientation } = resolveOrientation(scan.placement);
    state = {
      kind: "result",
      scan,
      placement,
      orientation,
      imageUrl: URL.createObjectURL(blob),
      // Pixels cannot carry side to move or history, so these are the user's
      // to confirm: white to move, castling inferred from home squares.
      // `flipped` starts false because resolveOrientation already returned the
      // corrected placement; flipping it is the override for a wrong call.
      turn: "w",
      castling: "inferred",
      flipped: false,
    };
  } catch (err) {
    state = { kind: "noboard", message: `识别出错：${err.message}` };
  }
  render();
}

export function reset() {
  if (state.kind === "result") URL.revokeObjectURL(state.imageUrl);
  notice = null;
  state = { kind: "idle" };
  render();
}

function currentFen() {
  if (state.kind !== "result") return null;
  return composeFen(state.placement, {
    turn: state.turn,
    castling: state.castling,
    flipped: state.flipped,
  });
}

function verdictFor(fen) {
  if (state.kind !== "result") return { blocked: true, needsConfirm: false, warnings: [] };
  return evaluatePosition({
    fen,
    reliable: state.scan.reliable,
    minConfidence: state.scan.minConfidence,
    plausible: isPlausible(state.placement),
  });
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"]/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch],
  );
}

async function sendToEnCroissant() {
  const fen = currentFen();
  if (!fen || !handoffAvailable) return;
  const verdict = verdictFor(fen);
  if (verdict.blocked) return;
  if (verdict.needsConfirm && !window.confirm("识别结果有警告，仍然送入 En Croissant？")) return;

  try {
    const response = await fetch("/handoff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fen,
        turn: state.turn,
        castlingMode: state.castling,
        flipped: state.flipped,
        meanConfidence: state.scan.meanConfidence,
        minConfidence: state.scan.minConfidence,
        reliable: state.scan.reliable,
      }),
    });
    const body = await response.json();
    notice = body.ok
      ? { tone: "ok", text: "已送入 En Croissant" }
      : { tone: "error", text: body.error ?? "送入失败" };
  } catch (err) {
    notice = { tone: "error", text: `送入失败：${err.message}` };
  }
  render();
}

async function copyFen() {
  const fen = currentFen();
  if (!fen) return;
  try {
    await navigator.clipboard.writeText(fen);
    notice = { tone: "ok", text: "FEN 已复制" };
  } catch (err) {
    notice = { tone: "error", text: `复制失败：${err.message}` };
  }
  render();
}

function toggleButton(label, active, action) {
  return `<button type="button" class="${active ? "on" : ""}" data-action="${action}">${label}</button>`;
}

function renderIdleOrScanning() {
  const busy = state.kind === "scanning";
  app.innerHTML = `
    <section class="dropzone ${busy ? "busy" : ""}">
      <h1>粘贴棋盘截图</h1>
      <p class="hint"><kbd>Ctrl</kbd>+<kbd>V</kbd> 任意位置粘贴 · 拖入图片 · 或点这里选择文件</p>
      <div class="status">${busy ? "正在识别…" : ""}</div>
      <input id="file" type="file" accept="image/*" hidden />
    </section>`;
  app.querySelector(".dropzone").addEventListener("click", () => app.querySelector("#file").click());
  app.querySelector("#file").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) void scanImage(file);
    event.target.value = "";
  });
}

function renderNoBoard() {
  app.innerHTML = `
    <section class="dropzone">
      <h1>没找到棋盘</h1>
      <p class="hint">${escapeHtml(
        state.message ?? "图片里没有可识别的棋盘，试试裁紧一点或换一张截图。",
      )}</p>
      <button type="button" data-action="reset">再试一张</button>
    </section>`;
  bind({ reset });
}

function renderResult() {
  const fen = currentFen();
  const verdict = verdictFor(fen);
  // Read the rights straight out of the FEN we would actually send, so the
  // label can never disagree with the payload.
  const rights = fen.split(" ")[2];
  const effectivePlacement = state.flipped ? flipPlacement(state.placement) : state.placement;
  const confidence = Math.round(state.scan.meanConfidence * 100);

  const banners = verdict.warnings
    .map((w) => `<p class="banner${verdict.blocked ? " banner-block" : ""}" role="alert">${escapeHtml(w)}</p>`)
    .join("");
  const noticeHtml = notice
    ? `<p class="notice notice-${notice.tone}" role="status">${escapeHtml(notice.text)}</p>`
    : "";

  app.innerHTML = `
    <section class="result">
      <figure>
        <img src="${state.imageUrl}" alt="你粘贴的截图" />
        <figcaption>你的截图</figcaption>
      </figure>
      <figure class="board-figure">
        ${renderBoardSvg(effectivePlacement, false)}
        <figcaption>识别结果 · 平均置信度 ${confidence}%</figcaption>
      </figure>
    </section>

    <section class="under-board">
      ${banners}
      ${noticeHtml}
      <code class="placement">${escapeHtml(fen)}</code>

      <div class="controls">
        <div class="control">
          <span class="control-label">走子方</span>
          <div class="toggle">
            ${toggleButton("白方", state.turn === "w", "turn-w")}
            ${toggleButton("黑方", state.turn === "b", "turn-b")}
          </div>
        </div>
        <div class="control">
          <span class="control-label">易位权</span>
          <div class="toggle">
            ${toggleButton(`推断 (${rights})`, state.castling === "inferred", "castle-inferred")}
            ${toggleButton("无", state.castling === "none", "castle-none")}
          </div>
        </div>
        <div class="control">
          <span class="control-label">棋盘</span>
          <div class="toggle">${toggleButton("翻转", state.flipped, "flip")}</div>
        </div>
      </div>

      <div class="actions">
        ${
          handoffAvailable
            ? `<button type="button" class="primary" data-action="send" ${
                verdict.blocked ? "disabled" : ""
              }>送入 En Croissant</button>`
            : ""
        }
        <button type="button" data-action="copy">复制 FEN</button>
        <button type="button" data-action="reset">再试一张</button>
      </div>
      ${
        handoffAvailable
          ? ""
          : `<p class="hint">未配置 enCroissantPath，只能复制 FEN。见 README。</p>`
      }
    </section>`;

  bind({
    reset,
    copy: copyFen,
    send: sendToEnCroissant,
    "turn-w": () => setOption({ turn: "w" }),
    "turn-b": () => setOption({ turn: "b" }),
    "castle-inferred": () => setOption({ castling: "inferred" }),
    "castle-none": () => setOption({ castling: "none" }),
    flip: () => setOption({ flipped: !state.flipped }),
  });
}

function setOption(patch) {
  notice = null;
  state = { ...state, ...patch };
  render();
}

function bind(actions) {
  for (const button of app.querySelectorAll("[data-action]")) {
    const action = actions[button.dataset.action];
    if (action) button.addEventListener("click", action);
  }
}

function render() {
  if (state.kind === "idle" || state.kind === "scanning") return renderIdleOrScanning();
  if (state.kind === "noboard") return renderNoBoard();
  return renderResult();
}

window.addEventListener("paste", (event) => {
  const file = pickImageFile(event.clipboardData?.items);
  if (!file) return;
  event.preventDefault();
  void scanImage(file);
});

app.addEventListener("dragover", (event) => {
  const zone = app.querySelector(".dropzone");
  if (!zone) return;
  event.preventDefault();
  zone.classList.add("dragging");
});

app.addEventListener("dragleave", () => app.querySelector(".dropzone")?.classList.remove("dragging"));

app.addEventListener("drop", (event) => {
  const zone = app.querySelector(".dropzone");
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove("dragging");
  const file = Array.from(event.dataTransfer?.files ?? []).find((f) => f.type.startsWith("image/"));
  if (file) void scanImage(file);
});

// Load the wasm runtime and the classifier before the first paste.
try {
  await recognizer.recognize(await blankPng());
  document.body.dataset.status = "ready";
} catch (err) {
  console.error(err);
  document.body.dataset.status = "error";
  document.body.dataset.error = String(err);
}

try {
  const health = await (await fetch("/healthz")).json();
  handoffAvailable = Boolean(health.configured);
} catch {
  handoffAvailable = false;
}

async function blankPng() {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  canvas.getContext("2d").fillRect(0, 0, 8, 8);
  return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

async function castCrop(blob, spec) {
  if (!spec) return blob;
  const [x, y, w, h] = spec.split(",").map(Number);
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, x, y, w, h, 0, 0, w, h);
  return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

async function upscaleToWidth(blob, targetWidth) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = Math.round(bitmap.height * (targetWidth / bitmap.width));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const scaled = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!scaled) throw new Error(`无法生成 ${canvas.width}x${canvas.height} 的测试图`);
  return scaled;
}

render();

// Dev hooks for regression runs. Both drive the exact production path
// (scanImage -> resolveOrientation -> composeFen) and then publish their
// outcome on window.__done, so scripts/browser-check.mjs can assert on it.
const params = new URLSearchParams(location.search);
const fixtureRun = params.get("fixtures") === "1";
const selfTest = params.get("selftest");

function outcomeOf() {
  return state.kind === "result"
    ? {
        kind: "result",
        placement: state.placement,
        reliable: state.scan.reliable,
        orientation: state.orientation,
      }
    : { kind: state.kind };
}

async function runFixtureSuite() {
  const expected = await (await fetch("/fixtures/expected.json")).json();
  const rows = [];
  for (const [name, want] of Object.entries(expected)) {
    const blob = await (await fetch(`/fixtures/${name}`)).blob();
    await scanImage(blob);
    const { pass, reason } = judgeFixture(want, outcomeOf());
    rows.push({ name, expect: want.expect, pass, reason, actual: state.kind === "result" ? state.placement : "—" });
  }
  const failed = rows.filter((r) => !r.pass);
  app.innerHTML = `
    <h1>回归：${rows.length - failed.length}/${rows.length} 通过</h1>
    <table class="fixtures">
      <thead><tr><th>fixture</th><th>期望</th><th>结果</th><th>说明</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr class="${r.pass ? "pass" : "fail"}">
              <td>${r.name}</td><td>${r.expect}</td><td>${r.pass ? "PASS" : "FAIL"}</td>
              <td>${r.pass ? r.actual : r.reason}</td></tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
  return rows;
}

async function runSelfTest() {
  const response = await fetch(`/fixtures/${selfTest}`);
  const blob = await response.blob();
  // ?w=3840 blows the fixture up to a 4K-wide frame, which is how the
  // full-screen input class gets exercised without shipping a 4K png.
  const targetWidth = Number(params.get("w") ?? "0");
  // ?crop=x,y,w,h carves a partial board out, which is the "board was cut
  // off / partly covered" input class.
  let input = castCrop(blob, params.get("crop"));
  input = targetWidth > 0 ? await upscaleToWidth(await input, targetWidth) : await input;
  await scanImage(input);

  const payload =
    state.kind === "result"
      ? {
          kind: "result",
          placement: state.placement,
          orientation: state.orientation,
          reliable: state.scan.reliable,
          plausible: isPlausible(state.placement),
          meanConfidence: state.scan.meanConfidence,
          minConfidence: state.scan.minConfidence,
          fen: currentFen(),
          castling: state.castling,
          turn: state.turn,
          flipped: state.flipped,
          verdict: verdictFor(currentFen()),
          handoffAvailable,
          dom: {
            image: Boolean(app.querySelector(".result img")),
            board: Boolean(app.querySelector("svg.board")),
            confidenceShown: /置信度 \d+%/.test(app.textContent ?? ""),
            sendButton: Boolean(app.querySelector('[data-action="send"]')),
            sendDisabled: Boolean(app.querySelector('[data-action="send"]')?.disabled),
          },
        }
      : { kind: state.kind, message: state.message ?? null };

  document.body.dataset.result = JSON.stringify(payload);
  const pre = document.createElement("pre");
  pre.id = "selftest";
  pre.textContent = JSON.stringify(payload);
  document.body.append(pre);
  return payload;
}

if (fixtureRun) {
  window.__done = runFixtureSuite();
} else if (selfTest) {
  window.__done = runSelfTest();
} else {
  window.__done = true;
}
