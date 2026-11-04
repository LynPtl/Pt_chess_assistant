/** Turning the screenshot's pixels into the two things the position needs:
 *  the last-move highlight (side to move) and, indirectly, nothing else.
 *
 *  Kept out of main.js because it needs a canvas and must never take the page
 *  down when it fails — every caller treats a null result as "no inference".
 */

import { findHighlights, samplePoints } from "./highlight.mjs";

/** fenshot downscales anything larger than this before detecting the board, so
 *  its corner coordinates live in that scaled space. */
export const MAX_DETECT_DIM = 1600;

/** Scale factor fenshot applies before detection (never upscales). */
export function imageScale(width, height) {
  return Math.min(1, MAX_DETECT_DIM / Math.max(width, height));
}

/** Average the colour around each of the 4 inset points of every square. */
export function sampleSquareColours(bitmap, corners) {
  const scale = imageScale(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);

  const points = samplePoints(
    corners.x0 / scale,
    corners.y0 / scale,
    (corners.x1 - corners.x0) / scale,
    (corners.y1 - corners.y0) / scale,
  );
  const patch = 6;
  return points.map((cell) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (const [px, py] of cell) {
      const d = ctx.getImageData(Math.round(px - patch / 2), Math.round(py - patch / 2), patch, patch).data;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
        n++;
      }
    }
    return { r: r / n, g: g / n, b: b / n };
  });
}

/** 找出"上一步"被染色的格子，返回**图像坐标**下的下标（左上角为 0）。
 *
 *  注意：这里的下标属于图像空间。调用方如果拿到的摆位已经被纠正过朝向
 *  （resolveOrientation 的结果），必须先用 rotateHighlights 转一下再拿去查棋子，
 *  否则会把走子方和易位权都判错。
 *
 *  永不抛错：canvas 或解码失败就当没找到。 */
export async function highlightSquares(blob, corners) {
  try {
    const bitmap = await createImageBitmap(blob);
    const colours = sampleSquareColours(bitmap, corners);
    bitmap.close?.();
    return findHighlights(colours);
  } catch (err) {
    console.debug("高亮格识别失败（不影响其它功能）", err);
    return [];
  }
}
