// Copies the onnxruntime wasm runtime and the fenshot tile-classifier model
// into src/ort/ and src/model/ (both gitignored), so Vite can emit them as
// hashed assets via `?url` imports.
//
// Why resolve-then-copy instead of importing the package paths directly:
// onnxruntime-web's exports map hides dist/*, and the physical location
// depends on npm hoisting. fenshot does the same (apps/web/scripts/sync-ort.mjs).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const ortDist = dirname(require.resolve("onnxruntime-web"));
// Its exports map hides package.json and has no `require` condition, so
// resolve the ESM entry (dist/index.js) and walk up to the package root.
const fenshotPkg = dirname(dirname(fileURLToPath(import.meta.resolve("@scoriiu/fenshot"))));

const ORT_FILES = ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"];

mkdirSync(join(root, "src", "ort"), { recursive: true });
mkdirSync(join(root, "src", "model"), { recursive: true });

for (const file of ORT_FILES) {
  const from = join(ortDist, file);
  if (!existsSync(from)) throw new Error(`缺少 onnxruntime 资产: ${from}`);
  copyFileSync(from, join(root, "src", "ort", file));
}
console.log(`[sync-assets] onnxruntime wasm ← ${ortDist}`);

const modelFrom = join(fenshotPkg, "model", "chess-tiles-v2.onnx");
if (!existsSync(modelFrom)) throw new Error(`缺少 fenshot 模型: ${modelFrom}`);
copyFileSync(modelFrom, join(root, "src", "model", "chess-tiles-v2.onnx"));
console.log(`[sync-assets] tile classifier ← ${modelFrom}`);
