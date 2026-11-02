import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the built bundle loads from any sub-path, and from the
  // plain static server in src/server.mjs.
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    headers: {
      // Lets onnxruntime-web's threaded wasm build use SharedArrayBuffer
      // during `npm run dev`; the production server serves single-threaded.
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
