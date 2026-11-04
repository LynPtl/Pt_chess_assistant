import { createRecognizer, resolveOrientation } from "@scoriiu/fenshot";
import { renderBoardSvg } from "./board.mjs";
import { pickImageFile } from "./paste.mjs";
import { composeFen, flipPlacement, isPlausible } from "./fen.mjs";
import { resolveRights } from "./castling.mjs";
import { inferEnPassant, moveSquare, pushHistory, stampSquare } from "./edit.mjs";
import { parseFenInput } from "./import-fen.mjs";
import { parsePgnInput } from "./import-pgn.mjs";
import { PALETTE, PIECE_URLS } from "./piece-urls.mjs";
import { createService } from "./service.mjs";
import { installDevHooks } from "./devhooks.mjs";
import { staticMode } from "./mode.mjs";
import { rotateHighlights } from "./highlight.mjs";
import { actionsRow, castlingControls, dropzoneHtml, escapeHtml, footerHtml, noticeBlock, paletteHtml, recentList, statusStrip, toggleButton } from "./view.mjs";
import { installBoardEditing } from "./board-editing.mjs";
import { highlightSquares } from "./sampling.mjs";
import { loadRecent, pushRecent } from "./history.mjs";
import { suspiciousSquares } from "./suspicious.mjs";
import { getLang, t } from "./i18n.mjs";
import { inferTurn } from "./highlight.mjs";
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
// <html lang> 跟着界面语言走：读屏和翻译工具都靠它
document.documentElement.lang = getLang() === "zh" ? "zh-CN" : "en";
const service = createService();

/** { kind: "idle" } | { kind: "scanning" } | { kind: "noboard", message? }
 *  | { kind: "result", scan, placement, orientation, imageUrl,
 *      turn: "w"|"b", castling: "inferred"|"none", flipped: boolean } */
export let state = { kind: "idle" };

/** Mirrors GET /healthz. Re-fetched on demand, because a user who just fixed
 *  config.json should not have to guess that the browser is showing a stale
 *  answer. */
let health = { configured: false, reason: t("notConnectedYet") };
let notice = null; // { tone: "ok" | "error", text }

async function refreshHealth() {
  health = await service.refreshHealth();
  render();
}

async function shutdown() {
  if (!window.confirm(t("confirmStop"))) return;
  await service.shutdown().catch(() => {});
  state = { kind: "idle" };
  notice = null;
  health = { configured: false, reason: t("serviceStopped") };
  render();
}

async function openEnCroissant() {
  try {
    const body = await service.open();
    notice = body.ok
      ? { tone: "ok", text: t("started") }
      : { tone: "error", text: body.error ?? t("startFailed") };
  } catch (err) {
    notice = { tone: "error", text: t("startFailedWith", { msg: err.message }) };
  }
  render();
}

/** 「用示例图试一下」：拉一张随包发布的图，走和生产完全一样的识别路径。 */
async function scanDemo() {
  try {
    const response = await fetch("demo.png");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await scanImage(await response.blob());
  } catch (err) {
    notice = { tone: "error", text: t("demoLoadFailed", { msg: err.message }) };
    render();
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
    // 高亮格来自图像坐标；黑方视角时摆位被纠正过，两者差 180°，必须先转正，
    // 然后再拿纠正后的摆位去查棋子 —— 顺序错了走子方就会反。
    const raw = await highlightSquares(blob, scan.corners);
    const highlights = orientation === "black" ? rotateHighlights(raw) : raw;
    const inferred = inferTurn(placement, highlights);
    state = {
      kind: "result",
      scan,
      placement,
      orientation,
      turnInferred: Boolean(inferred),
      inferredMover: inferred?.mover ?? null,
      highlights: highlights ?? [],
      // 逐格置信度只用来标"这几格要人看一眼"，不参与任何判定
      suspicious: suspiciousSquares(scan.confidences),
      imageUrl: URL.createObjectURL(blob),
      // Pixels cannot carry side to move or history, so these are the user's
      // to confirm: white to move, castling inferred from home squares.
      // 显示方向跟截图一致（黑方视角的截图就黑在下），但它**不参与 FEN**；
      // `resolveOrientation` 已经给出
      // corrected placement; flipping it is the override for a wrong call.
      turn: inferred?.turn ?? "w",
      // 每侧三态：auto = 按推断，on/off = 用户明确指定
      castling: { w: "auto", b: "auto" },
      flipped: orientation === "black",
      edited: false,
      activePiece: null,
      history: [],
    };
    pushRecent(undefined, { fen: currentFen(), source: "screenshot" });
    syncUrl();
  } catch (err) {
    state = { kind: "noboard", message: t("scanFailed", { msg: err.message }) };
  }
  render();
}

export function reset() {
  releaseResultUrl(state);
  notice = null;
  state = { kind: "idle" };
  render();
}

/** 棋盘上"看到的"摆位：`flipped` 现在只是**显示**方向，不再旋转局面本身。
 *  想看黑方视角就翻它，FEN 和易位权一个字都不会变。
 *  真认错了朝向，用编辑器里的「旋转局面」——那是改局面本身（可撤销）。 */
function displayPlacement() {
  return state.flipped ? flipPlacement(state.placement) : state.placement;
}

/** 每一侧的易位权：auto 用推断值，on 用位置上支持的全部，off 用无。 */
function resolvedRights() {
  return resolveRights(state.placement, state.highlights ?? [], state.castling ?? {});
}

function currentFen() {
  if (state.kind !== "result") return null;
  return composeFen(state.placement, {
    turn: state.turn,
    rights: resolvedRights(),
    // 注意：不传 flipped —— 「翻转视图」只影响怎么画，绝不改动 FEN。
    // 需要改局面本身时用编辑器里的「旋转局面」，那会真的旋转 placement。
    // 吃过路兵同样是历史：只有上一步是兵走两格时才成立，靠高亮格推。
    enPassant: inferEnPassant(state.placement, state.turn, state.highlights ?? []) ?? "-",
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
    ${recentList({ items: loadRecent() })}
  `;
  // 只有点在"空白处"才打开文件选择器：框里还有示例图按钮和可复制的 FEN 文本，
  // 点它们不该顺带弹出文件对话框（事件会冒泡到 .dropzone）。
  app.querySelector(".dropzone").addEventListener("click", (event) => {
    if (event.target.closest("[data-action], a, input, code, kbd")) return;
    app.querySelector("#file").click();
  });
  app.querySelector("#file").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) void scanImage(file);
    event.target.value = "";
  });
  bind({
    "refresh-health": refreshHealth,
    "open-app": openEnCroissant,
    shutdown,
    demo: () => void scanDemo(),
  });

  // 「最近识别过的局面」：点一条就把它重新摆出来（走子方/易位权直接从存下的 FEN 读）
  const recent = loadRecent();
  for (const row of app.querySelectorAll('[data-action="recent"]')) {
    row.addEventListener("click", () => {
      const item = recent[Number(row.dataset.index)];
      const parsed = item ? parseFenInput(item.fen) : null;
      if (parsed) loadFen({ ...parsed, source: item.source });
    });
  }
}

function renderNoBoard() {
  app.innerHTML = `
    <section class="dropzone">
      <h1>${t("noBoardTitle")}</h1>
      <p class="hint">${escapeHtml(
        state.message ?? t("noBoardHint"),
      )}</p>
      <button type="button" data-action="reset">${t("retry")}</button>
    </section>`;
  bind({ reset });
}

function renderResult() {
  const fen = currentFen();
  const verdict = verdictFor(fen);
  const boardPlacement = displayPlacement();
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
               <img src="${state.imageUrl}" alt="${t("yourScreenshotAlt")}" />
               <figcaption>${t("yourScreenshot")}</figcaption>
             </figure>`
          : ""
      }
      <figure class="board-figure">
        ${renderBoardSvg(boardPlacement, false, PIECE_URLS, { suspicious: state.suspicious ?? [] })}
        <figcaption>
          ${
            state.source === "fen"
              ? t("fromFen")
              : state.source === "pgn"
                ? t("fromPgn", { n: state.moveCount ?? 0 })
                : t("recognised", { n: confidence })
          }${state.edited ? t("edited") : ""}
          ${
            (state.suspicious ?? []).length
              ? `<br /><span class="suspect-hint">${t("suspectHint", { n: state.suspicious.length })}</span>`
              : ""
          }
          <br /><span class="edit-hint">${t("editHint")}</span>
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
          <span class="control-label">${t("turnLabel")}${
            state.turnInferred ? t("turnInferred", { who: state.inferredMover === "w" ? t("white") : t("black") }) : ""
          }</span>
          <div class="toggle">
            ${toggleButton(t("white"), state.turn === "w", "turn-w")}
            ${toggleButton(t("black"), state.turn === "b", "turn-b")}
          </div>
        </div>
        ${castlingControls({
              // 用真实摆位，不用"显示用"的翻转版：否则一翻转王就"离开 e1"，
              // 按钮会改口说没有易位权，和下面那行 FEN 自相矛盾。
              placement: state.placement,
              castling: state.castling,
              highlights: state.highlights,
            })}
        <div class="control">
          <span class="control-label">${t("board")}</span>
          <div class="toggle">${toggleButton(t("flip"), state.flipped, "flip")}</div>
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
    link: copyLink,
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
  if (verdict.needsConfirm && !window.confirm(t("confirmWarnings"))) return;

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
      ? { tone: "ok", text: t("sent") }
      : { tone: "error", text: body.error ?? t("sendFailed") };
  } catch (err) {
    notice = { tone: "error", text: t("sendFailedWith", { msg: err.message }) };
  }
  render();
}

/** 复制 FEN —— enCroissantPath 没配好时的唯一出路。 */
async function copyFen() {
  const fen = currentFen();
  if (!fen) return;
  try {
    await navigator.clipboard.writeText(fen);
    notice = { tone: "ok", text: t("fenCopied") };
  } catch (err) {
    notice = { tone: "error", text: t("copyFailed", { msg: err.message }) };
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

/** 把当前局面做成可分享的链接（`?fen=...`），复制到剪贴板。 */
async function copyLink() {
  const fen = currentFen();
  if (!fen) return;
  const url = `${location.origin}${location.pathname}?fen=${encodeURIComponent(fen)}`;
  try {
    await navigator.clipboard.writeText(url);
    notice = { tone: "ok", text: t("linkCopied") };
  } catch (err) {
    notice = { tone: "error", text: t("copyFailed", { msg: err.message }) };
  }
  render();
}

/** 把当前局面同步到地址栏，刷新/收藏后还是这个局面。
 *  开发钩子（?selftest / ?fixtures）模式下不动，免得把参数冲掉。 */
function syncUrl() {
  const params = new URLSearchParams(location.search);
  if (params.has("selftest") || params.has("fixtures")) return;
  const fen = currentFen();
  const next = fen
    ? `${location.pathname}?fen=${encodeURIComponent(fen)}`
    : location.pathname;
  if (`${location.pathname}${location.search}` === next) return;
  history.replaceState(null, "", next);
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
  if (state.kind === "idle" || state.kind === "scanning") renderIdleOrScanning();
  else if (state.kind === "noboard") renderNoBoard();
  else renderResult();
  // 页脚每次都重新追加：上面三个渲染函数都重写了 #app 的内容
  app.insertAdjacentHTML("beforeend", footerHtml({ staticMode }));
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
  // 没有图片就看看是不是一段 FEN 或 PGN —— 这条路径不用识别，
  // 走子方和易位权都由文本本身给出，不需要推断。
  const text = event.clipboardData?.getData("text") ?? "";
  const imported = parseFenInput(text);
  if (imported) {
    event.preventDefault();
    loadFen(imported);
    return;
  }
  const pgn = parsePgnInput(text);
  if (pgn) {
    event.preventDefault();
    loadFen({ ...pgn, source: "pgn" });
  }
});

/** 直接把一段 FEN 摆上棋盘：不经过识别，所以没有置信度，也不该显示"识别结果"。 */
function loadFen({ placement, turn, castling, source = "fen", moveCount = 0 }) {
  releaseResultUrl(state);
  notice = {
    tone: "ok",
    text: source === "pgn" ? t("pgnLoaded", { n: moveCount }) : t("fenLoaded"),
  };
  state = {
    kind: "result",
    source,
    moveCount,
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
  pushRecent(undefined, { fen: currentFen(), source });
  syncUrl();
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
  health = { configured: false, reason: t("staticNoService") };
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
  if (!scaled) throw new Error(t("testImageFailed", { w: canvas.width, h: canvas.height }));
  return scaled;
}

render();

// 链接里带着局面（?fen=...）就直接摆出来
{
  const shared = parseFenInput(new URLSearchParams(location.search).get("fen") ?? "");
  if (shared && !new URLSearchParams(location.search).has("selftest")) {
    loadFen(shared);
  }
}

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
