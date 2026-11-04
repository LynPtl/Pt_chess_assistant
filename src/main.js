import { createRecognizer, resolveOrientation } from "@scoriiu/fenshot";
import { renderBoardSvg } from "./board.mjs";
import { pickImageFile } from "./paste.mjs";
import { composeFen, flipPlacement, isPlausible } from "./fen.mjs";
import { resolveRights } from "./castling.mjs";
import { inferEnPassant, moveSquare, pushHistory, stampSquare } from "./edit.mjs";
import { parseFenInput } from "./import-fen.mjs";
import { PALETTE, PIECE_URLS } from "./piece-urls.mjs";
import { createService } from "./service.mjs";
import { installDevHooks } from "./devhooks.mjs";
import { staticMode } from "./mode.mjs";
import { actionsRow, castlingControls, dropzoneHtml, escapeHtml, noticeBlock, paletteHtml, statusStrip, toggleButton } from "./view.mjs";
import { installBoardEditing } from "./board-editing.mjs";
import { inferFromHighlights } from "./sampling.mjs";
import { evaluatePosition } from "./guards.mjs";
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
const service = createService();

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
  health = await service.refreshHealth();
  render();
}

async function shutdown() {
  if (!window.confirm("停止本地服务？停止后这个页面就不能再识别了，要用就重新运行 start.bat。")) return;
  await service.shutdown().catch(() => {});
  state = { kind: "idle" };
  notice = null;
  health = { configured: false, reason: "服务已停止。重新运行 start.bat 就能再用。" };
  render();
}

async function openEnCroissant() {
  try {
    const body = await service.open();
    notice = body.ok
      ? { tone: "ok", text: "已启动 En Croissant" }
      : { tone: "error", text: body.error ?? "启动失败" };
  } catch (err) {
    notice = { tone: "error", text: `启动失败：${err.message}` };
  }
  render();
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
    const { inferred, highlights } = await inferFromHighlights(blob, scan.corners, placement);
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
      history: [],
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
    // 吃过路兵同样是历史：只有上一步是兵走两格时才成立，靠高亮格推。
    enPassant: inferEnPassant(effectivePlacement(), state.turn, state.highlights ?? []) ?? "-",
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

function renderIdleOrScanning() {
  const busy = state.kind === "scanning";
  app.innerHTML = `
    ${staticMode ? "" : statusStrip(health)}
    ${noticeBlock(notice)}
    ${dropzoneHtml({ busy })}
  `;
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
  const noticeHtml = noticeBlock(notice);

  app.innerHTML = `
    ${staticMode ? "" : statusStrip(health)}
    <section class="result ${state.imageUrl ? "" : "no-shot"}">
      ${
        state.imageUrl
          ? `<figure>
               <img src="${state.imageUrl}" alt="你粘贴的截图" />
               <figcaption>你的截图</figcaption>
             </figure>`
          : ""
      }
      <figure class="board-figure">
        ${renderBoardSvg(boardPlacement, false, PIECE_URLS)}
        <figcaption>
          ${state.source === "fen" ? "从 FEN 导入（未经识别，无需核对棋子）" : `识别结果 · 平均置信度 ${confidence}%`}${
            state.edited ? " · 已手动修正" : ""
          }
          <br /><span class="edit-hint">点格子盖章 · 拖动棋子换位 · 右键擦掉</span>
        </figcaption>
        ${paletteHtml({
              activePiece: state.activePiece,
              pieceUrls: PIECE_URLS,
              palette: PALETTE,
            canUndo: (state.history ?? []).length > 0,
            })}
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
        ${castlingControls({
              placement: boardPlacement,
              castling: state.castling,
              highlights: state.highlights,
            })}
        <div class="control">
          <span class="control-label">棋盘</span>
          <div class="toggle">${toggleButton("翻转", state.flipped, "flip")}</div>
        </div>
      </div>

      ${actionsRow({
        staticMode,
        // fen 现在两种形态都要传：本地版也给了 lichess 入口
        fen,
        configured: health.configured,
        blocked: verdict.blocked,
        reason: health.reason ?? "",
        closeFirst: service.closeFirst(),
      })}
    </section>`;

  bindBoardEditing();

  bind({
    reset,
    copy: copyFen,
    send: sendToEnCroissant,
    "refresh-health": refreshHealth,
    "open-app": openEnCroissant,
    shutdown,
    undo,
    "turn-w": () => setOption({ turn: "w", turnInferred: false }),
    "turn-b": () => setOption({ turn: "b", turnInferred: false }),
    "castle-w-on": () => setCastling("w", "on"),
    "castle-w-off": () => setCastling("w", "off"),
    "castle-b-on": () => setCastling("b", "on"),
    "castle-b-off": () => setCastling("b", "off"),
    flip: () => setOption({ flipped: !state.flipped }),
  });

  // 复选框用的是 change 而不是 click：bind() 只挂 click
  if (!staticMode) {
    app.querySelector('[data-action="close-first"]')?.addEventListener("change", (event) => {
      service.setCloseFirst(event.currentTarget.checked);
    });
  }
}

function editSquare(screenIndex, piece) {
  // The board is drawn from the effective (possibly flipped) placement and
  // numbered in that same orientation, so map back before touching state.
  const placementIndex = state.flipped ? 63 - screenIndex : screenIndex;
  const next = stampSquare(state.placement, placementIndex, piece);
  if (next === state.placement) return;
  notice = null;
  state = {
    ...state,
    placement: next,
    edited: true,
    history: pushHistory(state.history, state.placement),
  };
  render();
}

function bindBoardEditing() {
  installBoardEditing({
    app,
    getState: () => state,
    update: (patch) => {
      state = { ...state, ...patch };
      render();
    },
    edit: ({ screenIndex, piece, to }) => {
      if (to === undefined) editSquare(screenIndex, piece);
      else movePieceTo(screenIndex, to);
    },
    notify: (next) => {
      notice = next;
      render();
    },
    render,
  });
}

/** 拖拽的结果：把棋子从一格挪到另一格。屏幕下标要先映射回真实摆位的下标
 *  （翻转时两者相反）。 */
function movePieceTo(screenIndex, to) {
  const from = state.flipped ? 63 - screenIndex : screenIndex;
  const target = state.flipped ? 63 - to : to;
  const next = moveSquare(state.placement, from, target);
  if (next === state.placement) return;
  notice = null;
  state = {
    ...state,
    placement: next,
    edited: true,
    history: pushHistory(state.history, state.placement),
  };
  render();
}

/** 送入 En Croissant：先过三道闸（合法性 / 需要二次确认 / 是否已连上），
 *  再交给 service。这一层只管"要不要送"，不管怎么送。 */
async function sendToEnCroissant() {
  const fen = currentFen();
  if (!fen || !health.configured) return;
  const verdict = verdictFor(fen);
  if (verdict.blocked) return;
  if (verdict.needsConfirm && !window.confirm("识别结果有警告，仍然送入 En Croissant？")) return;

  try {
    const body = await service.handoff({
      fen,
      turn: state.turn,
      castlingMode: state.castling,
      flipped: state.flipped,
      meanConfidence: state.scan.meanConfidence,
      minConfidence: state.scan.minConfidence,
      reliable: state.scan.reliable,
    });
    notice = body.ok
      ? { tone: "ok", text: "已送入 En Croissant" }
      : { tone: "error", text: body.error ?? "送入失败" };
  } catch (err) {
    notice = { tone: "error", text: `送入失败：${err.message}` };
  }
  render();
}

/** 复制 FEN —— enCroissantPath 没配好时的唯一出路。 */
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

/** 撤销一步编辑（盖章 / 擦除 / 拖动都算）。历史只在本次识别内有效——
 *  重新贴一张图就是新局面，旧的撤销没有意义。 */
function undo() {
  const history = state.history ?? [];
  if (history.length === 0) return;
  const previous = history[history.length - 1];
  notice = null;
  state = { ...state, placement: previous, history: history.slice(0, -1), edited: true };
  render();
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

// Ctrl+Z / Cmd+Z 撤销一步编辑。只在结果页生效，且不要在输入框里抢键。
window.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
  if (state.kind !== "result") return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  event.preventDefault();
  undo();
});

window.addEventListener("paste", (event) => {
  const file = pickImageFile(event.clipboardData?.items);
  if (file) {
    event.preventDefault();
    void scanImage(file);
    return;
  }
  // 没有图片就看看是不是一段 FEN —— 这条路径不用识别，走子方和易位权都是确定的。
  const text = event.clipboardData?.getData("text") ?? "";
  const imported = parseFenInput(text);
  if (!imported) return;
  event.preventDefault();
  loadFen(imported);
});

/** 直接把一段 FEN 摆上棋盘：不经过识别，所以没有置信度，也不该显示"识别结果"。 */
function loadFen({ placement, turn, castling }) {
  releaseResultUrl(state);
  notice = { tone: "ok", text: "已从剪贴板导入 FEN" };
  state = {
    kind: "result",
    source: "fen",
    scan: {
      placement,
      reliable: true,
      plausible: isPlausible(placement),
      meanConfidence: 1,
      minConfidence: 1,
      corners: null,
    },
    placement,
    orientation: "white",
    turnInferred: false,
    inferredMover: null,
    highlights: [],
    imageUrl: null,
    turn,
    castling,
    flipped: false,
    edited: false,
    activePiece: null,
    history: [],
    analysis: { running: false, lines: [] },
  };
  render();
}

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

if (staticMode) {
  // 静态托管没有本地服务，连探测都不做
  health = { configured: false, reason: "静态版：没有本地服务" };
  render();
} else {
  await refreshHealth();
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

// Dev hooks live in their own module; installed only when the query string asks.
// 静态版没有 /fixtures/* 路由，装了也只会 404。
window.__done = staticMode ? true : installDevHooks({
  params: new URLSearchParams(location.search),
  app,
  scanImage,
  getState: () => state,
  currentFen,
  verdictFor,
  handoffConfigured: health.configured,
  castCrop,
  upscaleToWidth,
});
