/** 把 fenshot 的逐格置信度翻译成"棋盘上哪几个格子需要人看一眼"。
 *
 *  识别器给的是 64 个置信度，我们过去只用最差的那一个数字，等于把"具体哪里不确定"
 *  扔掉了。这里把它变成棋盘下标，让界面能直接标出来。
 *
 *  坐标差异容易搞错：fenshot 的 tile 顺序是 **a1 起**（rank*8+file，rank0=rank1），
 *  而棋盘的 data-square 是 **a8 起**（row*8+col，row0=rank8）。
 */

/** 与 fenshot 的 CONFIDENCE_FLOOR 保持一致：低于它才叫"不可信"。 */
export const CONFIDENCE_FLOOR = 0.7;

/** fenshot 的 tile 下标 → 棋盘下标。 */
export function tileToBoardIndex(tile) {
  const rank = Math.floor(tile / 8); // 0 = rank 1
  const file = tile % 8;
  return (7 - rank) * 8 + file;
}

/**
 * @param {number[]|undefined} confidences fenshot 的 per-tile 置信度（a1 起）
 * @returns {number[]} 棋盘下标（a8 起），升序
 */
export function suspiciousSquares(confidences) {
  if (!Array.isArray(confidences) || confidences.length !== 64) return [];
  const out = [];
  confidences.forEach((value, tile) => {
    if (typeof value === "number" && value < CONFIDENCE_FLOOR) {
      out.push(tileToBoardIndex(tile));
    }
  });
  return out.sort((a, b) => a - b);
}
