import { createRecognizer } from "@scoriiu/fenshot";

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

/** Load the wasm runtime and the classifier before the first paste, and
 *  report the outcome on <body data-status>. Recognizing a blank 8x8 image
 *  is the cheapest call that still forces both to load (fenshot loads ort and
 *  the model before it looks for a board). */
export const ready = (async () => {
  const body = document.body;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    canvas.getContext("2d").fillRect(0, 0, 8, 8);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    await recognizer.recognize(blob);
    body.dataset.status = "ready";
    return true;
  } catch (err) {
    console.error(err);
    body.dataset.status = "error";
    body.dataset.error = String(err);
    return false;
  }
})();
