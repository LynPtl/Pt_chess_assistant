// 构建"静态版"（Cloudflare 那种没有后端的托管）。
//
// 输出到 dist-static/ 而不是 dist/：两种构建共用一个目录会导致两件真实的乌龙 ——
// 本地回归跑在静态产物上（`?selftest=` 那套钩子根本不存在），以及 `wrangler deploy`
// 把本地版推上线（线上冒出一个「送入 En Croissant」按钮）。分开就没这个问题。
//
// 为什么不写 `VITE_STATIC=1 vite build`：那在 Windows 的 cmd 里不成立。
// 这里直接给 vite 传环境变量，跨平台且不引入 cross-env。
import { build } from "vite";

process.env.VITE_STATIC = "1";
await build({ build: { outDir: "dist-static", emptyOutDir: true } });
console.log("\n[build:static] 产物在 dist-static/ —— 没有任何本地服务依赖");
