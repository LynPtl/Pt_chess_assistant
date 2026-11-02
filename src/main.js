import { createRecognizer, resolveOrientation } from "@scoriiu/fenshot";
import { renderBoardSvg } from "./board.mjs";
import { pickImageFile } from "./paste.mjs";
import { composeFen, flipPlacement, isPlausible } from "./fen.mjs";
import { castlingOptions, describeChoice, resolveRights } from "./castling.mjs";
import { stampSquare } from "./edit.mjs";
import { PALETTE, PIECE_URLS } from "./piece-urls.mjs";
import { findHighlights, inferTurn, samplePoints } from "./highlight.mjs";
import { evaluatePosition } from "./guards.mjs";
import { judgeFixture } from "./fixtures.mjs";
import { releaseResultUrl } from "./urls.mjs";
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

/** Mirrors GET /healthz. Re-fetched on demand, because a user who just fixed
 *  config.json should not have to guess that the browser is showing a stale
 *  answer. */
let health = { configured: false, reason: "还没连上本地服务" };
let notice = null; // { tone: "ok" | "error", text }

async function refreshHealth() {
  try {
    health = await (await fetch("/healthz")).json();
  } catch (err) {
    health = { configured: false, reason: `连不上本地服务：${err.message}` };
  }
  render();
}

async function shutdown() {
  if (!window.confirm("停止本地服务？停止后这个页面就不能再识别了，要用就重新运行 start.bat。")) return;
  try {
    await fetch("/shutdown", { method: "POST" });
  } catch {
    /* 进程已经没了也算停成功 */
  }
  state = { kind: "idle" };
  notice = null;
  health = { configured: false, reason: "服务已停止。重新运行 start.bat 就能再用。" };
  render();
}

async function openEnCroissant() {
  try {
    const response = await fetch("/open", { method: "POST" });
    const body = await response.json();
    notice = body.ok
      ? { tone: "ok", text: "已启动 En Croissant" }
      : { tone: "error", text: body.error ?? "启动失败" };
  } catch (err) {
    notice = { tone: "error", text: `启动失败：${err.message}` };
  }
  render();
}

/** fenshot downscales anything larger than this before detecting the board, so
 *  its corner coordinates live in that scaled space. */
const MAX_DETECT_DIM = 1600;

/** Average the colour around each of the 4 inset points of every square. */
function sampleSquareColours(bitmap, corners) {
  const scale = Math.min(1, MAX_DETECT_DIM / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);

  const points = samplePoints(
    corners.x0 / scale,
    corners.y0 / scale,
    (corners.x1 - corners.x0) / scale,
    (corners.y1 - corners.y0) / scale,
  );
  const patch = 6;
  return points.map((cell) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (const [px, py] of cell) {
      const d = ctx.getImageData(Math.round(px - patch / 2), Math.round(py - patch / 2), patch, patch).data;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
        n++;
      }
    }
    return { r: r / n, g: g / n, b: b / n };
  });
}

/** Chess sites tint the two squares of the move just played. If the tinted
 *  square that still holds a piece is white, White just moved, so it is
 *  Black's turn. Only ever a suggestion — the toggle stays user-controlled. */
async function inferTurnFromHighlights(blob, scan, placement) {
  try {
    const bitmap = await createImageBitmap(blob);
    const colours = sampleSquareColours(bitmap, scan.corners);
    bitmap.close?.();
    const highlights = findHighlights(colours);
    return { inferred: inferTurn(placement, highlights), highlights };
  } catch (err) {
    console.debug("高亮格推断失败（不影响其它功能）", err);
    return { inferred: null, highlights: [] };
  }
}

export async function scanImage(blob) {
  releaseResultUrl(state);
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
    const { inferred, highlights } = await inferTurnFromHighlights(blob, scan, placement);
    state = {
      kind: "result",
      scan,
      placement,
      orientation,
      turnInferred: Boolean(inferred),
      inferredMover: inferred?.mover ?? null,
      highlights: highlights ?? [],
      imageUrl: URL.createObjectURL(blob),
      // Pixels cannot carry side to move or history, so these are the user's
      // to confirm: white to move, castling inferred from home squares.
      // `flipped` starts false because resolveOrientation already returned the
      // corrected placement; flipping it is the override for a wrong call.
      turn: inferred?.turn ?? "w",
      // 每侧三态：auto = 按推断，on/off = 用户明确指定
      castling: { w: "auto", b: "auto" },
      flipped: false,
      edited: false,
      activePiece: null,
    };
  } catch (err) {
    state = { kind: "noboard", message: `识别出错：${err.message}` };
  }
  render();
}

export function reset() {
  releaseResultUrl(state);
  notice = null;
  state = { kind: "idle" };
  render();
}

/** 生效后的摆位：翻转只是显示层，但易位权要在"真实方向"上推。 */
function effectivePlacement() {
  return state.flipped ? flipPlacement(state.placement) : state.placement;
}

/** 每一侧的易位权：auto 用推断值，on 用位置上支持的全部，off 用无。 */
function resolvedRights() {
  return resolveRights(effectivePlacement(), state.highlights ?? [], state.castling ?? {});
}

function currentFen() {
  if (state.kind !== "result") return null;
  return composeFen(state.placement, {
    turn: state.turn,
    rights: resolvedRights(),
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
  if (!fen || !health.configured) return;
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

/** 每一侧一组「有 | 无」。推断结论写在被选中的那个按钮*里面*
 *  （如「有 KQ 推断」），而不是挂在组后面。 */
function castlingControls() {
  const placement = effectivePlacement();
  return ["w", "b"]
    .map((side) => {
      const options = castlingOptions(placement, side, state.highlights ?? []);
      const choice = state.castling?.[side] ?? "auto";
      const view = describeChoice(options, choice);
      const label = side === "w" ? "白方" : "黑方";
      const badge = (where) =>
        view.badge === where
          ? `<span class="inferred-badge" title="${escapeHtml(view.reason)}">推断</span>`
          : "";
      const onDisabled = view.canHave
        ? ""
        : `disabled title="${escapeHtml(view.reason)}"`;
      return `<div class="control">
        <span class="control-label">${label}易位</span>
        <div class="toggle">
          <button type="button" class="${view.onSelected ? (view.badge === "on" ? "auto-on" : "on") : ""}"
            data-action="castle-${side}-on" ${onDisabled}>有${
              view.onSelected && view.letters ? ` <span class="letters">${view.letters}</span>` : ""
            }${badge("on")}</button>
          <button type="button" class="${view.offSelected ? (view.badge === "off" ? "auto-on" : "on") : ""}"
            data-action="castle-${side}-off">无${badge("off")}</button>
        </div>
      </div>`;
    })
    .join("");
}

function toggleButton(label, active, action) {
  return `<button type="button" class="${active ? "on" : ""}" data-action="${action}">${label}</button>`;
}

/** Status strip: whether the handoff is wired, why not when it isn't, and the
 *  two things a user can do about it without leaving the page. */
function statusStrip() {
  const stop = `<button type="button" class="danger" data-action="shutdown">停止服务</button>`;
  if (health.configured) {
    return `<div class="service-status ok">
      <span>● 已连上 En Croissant</span>
      <button type="button" data-action="open-app">打开 En Croissant</button>
      ${stop}
    </div>`;
  }
  return `<div class="service-status bad">
    <span>● 未连上 En Croissant —— ${escapeHtml(health.reason ?? "")}</span>
    <button type="button" data-action="refresh-health">重新检测</button>
    ${stop}
  </div>`;
}

function noticeBlock() {
  return notice
    ? `<p class="notice notice-${notice.tone}" role="status">${escapeHtml(notice.text)}</p>`
    : "";
}

function renderIdleOrScanning() {
  const busy = state.kind === "scanning";
  app.innerHTML = `
    ${statusStrip()}
    ${noticeBlock()}
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
  bind({ "refresh-health": refreshHealth, "open-app": openEnCroissant, shutdown });
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
  const boardPlacement = effectivePlacement();
  const confidence = Math.round(state.scan.meanConfidence * 100);

  const banners = verdict.warnings
    .map((w) => `<p class="banner${verdict.blocked ? " banner-block" : ""}" role="alert">${escapeHtml(w)}</p>`)
    .join("");
  const noticeHtml = noticeBlock();

  app.innerHTML = `
    ${statusStrip()}
    <section class="result">
      <figure>
        <img src="${state.imageUrl}" alt="你粘贴的截图" />
        <figcaption>你的截图</figcaption>
      </figure>
      <figure class="board-figure">
        ${renderBoardSvg(boardPlacement, false, PIECE_URLS)}
        <figcaption>
          识别结果 · 平均置信度 ${confidence}%${state.edited ? " · 已手动修正" : ""}
          <br /><span class="edit-hint">先在下面选棋子，再点格子盖上去 · 右键擦掉</span>
        </figcaption>
        ${paletteHtml()}
      </figure>
    </section>

    <section class="under-board">
      ${banners}
      ${noticeHtml}
      <code class="placement">${escapeHtml(fen)}</code>

      <div class="controls">
        <div class="control">
          <span class="control-label">走子方${
            state.turnInferred ? `（高亮格推断：${state.inferredMover === "w" ? "白" : "黑"}刚走）` : ""
          }</span>
          <div class="toggle">
            ${toggleButton("白方", state.turn === "w", "turn-w")}
            ${toggleButton("黑方", state.turn === "b", "turn-b")}
          </div>
        </div>
        ${castlingControls()}
        <div class="control">
          <span class="control-label">棋盘</span>
          <div class="toggle">${toggleButton("翻转", state.flipped, "flip")}</div>
        </div>
      </div>

      <div class="actions">
        ${
          health.configured
            ? `<button type="button" class="primary" data-action="send" ${
                verdict.blocked ? "disabled" : ""
              }>送入 En Croissant</button>`
            : ""
        }
        <button type="button" data-action="copy">复制 FEN</button>
        <button type="button" data-action="reset">再试一张</button>
      </div>
      ${
        health.configured
          ? ""
          : `<p class="hint">还不能送入：${escapeHtml(health.reason ?? "")}。改好 <code>config.json</code>，再点上面的「重新检测」。</p>`
      }
    </section>`;

  bindBoardEditing();

  bind({
    reset,
    copy: copyFen,
    send: sendToEnCroissant,
    "refresh-health": refreshHealth,
    "open-app": openEnCroissant,
    shutdown,
    "turn-w": () => setOption({ turn: "w", turnInferred: false }),
    "turn-b": () => setOption({ turn: "b", turnInferred: false }),
    "castle-w-on": () => setCastling("w", "on"),
    "castle-w-off": () => setCastling("w", "off"),
    "castle-b-on": () => setCastling("b", "on"),
    "castle-b-off": () => setCastling("b", "off"),
    flip: () => setOption({ flipped: !state.flipped }),
  });
}

function paletteHtml() {
  const button = (piece) =>
    `<button type="button" class="palette-btn ${state.activePiece === piece ? "on" : ""}" ` +
    `data-piece="${piece}" title="${piece === "" ? "擦除" : piece}">` +
    (piece === "" ? "⌫" : `<img src="${PIECE_URLS[piece]}" alt="${piece}" />`) +
    `</button>`;
  const row = (pieces) => `<div class="palette-row">${pieces.map(button).join("")}</div>`;
  // 白子一行、黑子一行；擦除单独放一个小的工具按钮，免得和棋子一样大
  const white = PALETTE.filter((p) => p === p.toUpperCase());
  const black = PALETTE.filter((p) => p !== p.toUpperCase());
  const eraser =
    `<div class="palette-row palette-erase">` +
    `<button type="button" class="palette-btn small ${state.activePiece === "" ? "on" : ""}" ` +
    `data-piece="" title="擦除">⌫</button>` +
    `<span class="palette-label">擦除（右键点格子更快）</span>` +
    `</div>`;
  return `<div class="palette">${row(white)}${row(black)}${eraser}</div>`;
}

/** Same primitive for both buttons: stamp the selected piece (or erase). The
 *  board is re-rendered from state each time, so what you see and the FEN can
 *  never disagree. */
function editSquare(screenIndex, piece) {
  // The board is drawn from the effective (possibly flipped) placement and
  // numbered in that same orientation, so map back before touching state.
  const placementIndex = state.flipped ? 63 - screenIndex : screenIndex;
  const next = stampSquare(state.placement, placementIndex, piece);
  if (next === state.placement) return;
  notice = null;
  state = { ...state, placement: next, edited: true };
  render();
}

function bindBoardEditing() {
  for (const square of app.querySelectorAll("[data-square]")) {
    const index = Number(square.dataset.square);
    square.addEventListener("click", () => {
      if (state.activePiece === null) {
        notice = { tone: "error", text: "先在下面的调色板里选一个棋子，再点格子。" };
        render();
        return;
      }
      editSquare(index, state.activePiece);
    });
    square.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      editSquare(index, "");
    });
  }

  for (const button of app.querySelectorAll("[data-piece]")) {
    button.addEventListener("click", () => {
      const piece = button.dataset.piece;
      state = { ...state, activePiece: state.activePiece === piece ? null : piece };
      notice = null;
      render();
    });
  }
}

function setCastling(side, choice) {
  notice = null;
  state = { ...state, castling: { ...state.castling, [side]: choice } };
  render();
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

await refreshHealth();

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
          corners: state.scan.corners,
          turnInferred: state.turnInferred,
          inferredMover: state.inferredMover,
          verdict: verdictFor(currentFen()),
          handoffAvailable: health.configured,
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
