/** 「最近识别过的局面」——存在 localStorage 里。
 *
 *  为什么不放服务端：静态版（Cloudflare）根本没有后端，而这份历史对两种形态同样有用。
 *  存整条 FEN 而不是索引，是因为"能直接重新摆出来"才是这个列表的用途。
 */

export const RECENT_LIMIT = 12;
const KEY = "mychess-recent";

function read(storage) {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(storage, list) {
  try {
    storage?.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 隐私模式写不进去：历史功能失效，不该影响识别本身 */
  }
}

/** @returns {{fen:string, ts:string, source?:string}[]} 最新的在最前 */
export function loadRecent(storage = globalThis.localStorage) {
  return read(storage)
    .filter((item) => item && typeof item.fen === "string" && item.fen.length > 0)
    .slice(0, RECENT_LIMIT);
}

/** 记一条。同一个 FEN 已存在就提到最前面，而不是堆重复项。 */
export function pushRecent(storage = globalThis.localStorage, { fen, source = "screenshot" } = {}) {
  if (typeof fen !== "string" || !fen) return loadRecent(storage);
  const rest = read(storage).filter((item) => item?.fen !== fen);
  const next = [{ fen, source, ts: new Date().toISOString() }, ...rest].slice(0, RECENT_LIMIT);
  write(storage, next);
  return next;
}
