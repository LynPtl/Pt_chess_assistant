/** 两种形态，一份代码。
 *
 *  本地版（默认）：有 Node 服务，能探测 En Croissant、能命令它打开局面。
 *  静态版（VITE_STATIC=1）：纯静态托管（Cloudflare Pages 之类），没有后端 ——
 *    识别、摆棋、编辑、撤销全在浏览器里照旧，只是所有"送到本地 GUI"的东西都不渲染。
 *
 *  抽成函数是为了能在 node:test 里断言，而不是靠改环境变量去试。
 */
export function readStaticMode(env) {
  return env?.VITE_STATIC === "1";
}

export const staticMode = readStaticMode(import.meta.env ?? {});
