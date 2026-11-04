// 构建"静态版"（Cloudflare Pages 那种没有后端的托管）。
//
// 为什么不写 `VITE_STATIC=1 vite build`：那在 Windows 的 cmd 里不成立。
// 这里直接给 vite 传环境变量，跨平台且不引入 cross-env。
import { build } from "vite";

process.env.VITE_STATIC = "1";
await build();
console.log("\n[build:static] 已按静态模式构建 —— dist/ 里没有任何本地服务依赖");
