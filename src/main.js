import { createRecognizer, resolveOrientation } from "@scoriiu/fenshot";
import { renderBoardSvg } from "./board.mjs";
import { pickImageFile } from "./paste.mjs";
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

/** { kind: "idle" }
 *  { kind: "scanning" }
 *  { kind: "noboard", message? }
 *  { kind: "result", scan, placement, orientation, imageUrl } */
export let state = { kind: "idle" };

export async function scanImage(blob) {
  state = { kind: "scanning" };
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
    };
  } catch (err) {
    state = { kind: "noboard", message: `识别出错：${err.message}` };
  }
  render();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
}

function render() {
  if (state.kind === "idle" || state.kind === "scanning") {
    const busy = state.kind === "scanning";
    app.innerHTML = `
      <section class="dropzone ${busy ? "busy" : ""}">
        <h1>粘贴棋盘截图</h1>
        <p class="hint"><kbd>Ctrl</kbd>+<kbd>V</kbd> 任意位置粘贴 · 拖入图片 · 或点这里选择文件</p>
        <div class="status">${busy ? "正在识别…" : ""}</div>
        <input id="file" type="file" accept="image/*" hidden />
      </section>`;
    app.querySelector(".dropzone").addEventListener("click", () => app.querySelector("#file").click());
    app.querySelector("#file").addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) void scanImage(file);
      e.target.value = "";
    });
    return;
  }

  if (state.kind === "noboard") {
    app.innerHTML = `
      <section class="dropzone">
        <h1>没找到棋盘</h1>
        <p class="hint">${escapeHtml(state.message ?? "图片里没有可识别的棋盘，试试裁紧一点或换一张截图。")}</p>
        <button id="reset" type="button">再试一张</button>
      </section>`;
    app.querySelector("#reset").addEventListener("click", reset);
    return;
  }

  const { scan, placement, imageUrl } = state;
  const confidence = Math.round(scan.meanConfidence * 100);
  app.innerHTML = `
    <section class="result">
      <figure>
        <img src="${imageUrl}" alt="你粘贴的截图" />
        <figcaption>你的截图</figcaption>
      </figure>
      <figure class="board-figure">
        ${renderBoardSvg(placement, state.orientation === "black")}
        <figcaption>识别结果 · 平均置信度 ${confidence}%</figcaption>
      </figure>
    </section>
    <section class="under-board">
      <code class="placement">${escapeHtml(placement)}</code>
      <button id="reset" type="button">再试一张</button>
    </section>`;
  app.querySelector("#reset").addEventListener("click", reset);
}

export function reset() {
  if (state.kind === "result") URL.revokeObjectURL(state.imageUrl);
  state = { kind: "idle" };
  render();
}

// Paste: find an image among the clipboard items, and nothing else.
// Pasting text (say, a FEN) must leave the page exactly as it was.
window.addEventListener("paste", (event) => {
  const file = pickImageFile(event.clipboardData?.items);
  if (!file) return;
  event.preventDefault();
  void scanImage(file);
});

const dropzone = () => app.querySelector(".dropzone");

app.addEventListener("dragover", (event) => {
  if (!dropzone()) return;
  event.preventDefault();
  dropzone().classList.add("dragging");
});

app.addEventListener("dragleave", () => dropzone()?.classList.remove("dragging"));

app.addEventListener("drop", (event) => {
  if (!dropzone()) return;
  event.preventDefault();
  dropzone().classList.remove("dragging");
  const file = Array.from(event.dataTransfer?.files ?? []).find((f) => f.type.startsWith("image/"));
  if (!file) return;
  void scanImage(file);
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

async function upscaleToWidth(blob, targetWidth) {
  const bitmap = await createImageBitmap(blob);
  const factor = targetWidth / bitmap.width;
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = Math.round(bitmap.height * factor);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const scaled = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!scaled) throw new Error(`无法生成 ${canvas.width}x${canvas.height} 的测试图`);
  return scaled;
}

async function blankPng() {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  canvas.getContext("2d").fillRect(0, 0, 8, 8);
  return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

render();

// Dev hook for regression runs: ?selftest=<fixture file name> recognizes one
// image through the exact production path and writes the outcome into the
// DOM, so `chrome --headless --dump-dom` can assert on it. Task 7's
// ?fixtures=1 builds on this.
const selfTest = new URLSearchParams(location.search).get("selftest");
if (selfTest) {
  // window.__done lets scripts/browser-check.mjs await the outcome instead of
  // guessing how long the wasm takes.
  window.__done = (async () => {
    const params = new URLSearchParams(location.search);
    const response = await fetch(`/fixtures/${selfTest}`);
    const blob = await response.blob();
    // ?w=3840 blows the fixture up to a 4K-wide frame, which is how the
    // full-screen input class gets exercised without shipping a 4K png.
    const targetWidth = Number(params.get("w") ?? "0");
    await scanImage(targetWidth > 0 ? await upscaleToWidth(blob, targetWidth) : blob);
    const payload =
      state.kind === "result"
        ? {
            kind: "result",
            placement: state.placement,
            orientation: state.orientation,
            reliable: state.scan.reliable,
            plausible: state.scan.plausible,
            meanConfidence: state.scan.meanConfidence,
            minConfidence: state.scan.minConfidence,
            dom: {
              image: Boolean(document.querySelector(".result img")),
              board: Boolean(document.querySelector("svg.board")),
              confidenceShown: /置信度 \d+%/.test(app.textContent ?? ""),
            },
          }
        : { kind: state.kind, message: state.message ?? null };
    document.body.dataset.result = JSON.stringify(payload);
    const pre = document.createElement("pre");
    pre.id = "selftest";
    pre.textContent = JSON.stringify(payload);
    document.body.append(pre);
    return payload;
  })();
} else {
  window.__done = true;
}
