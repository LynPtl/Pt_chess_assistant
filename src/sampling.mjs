/** Turning the screenshot's pixels into the two things the position needs:
 *  the last-move highlight (side to move) and, indirectly, nothing else.
 *
 *  Kept out of main.js because it needs a canvas and must never take the page
 *  down when it fails — every caller treats a null result as "no inference".
 */

import { findHighlights, inferTurn, samplePoints } from "./highlight.mjs";

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

/** Chess sites tint the two squares of the move just played. If the tinted
 *  square that still holds a piece is white, White just moved, so it is
 *  Black's turn. Only ever a suggestion — the toggle stays user-controlled.
 *
 *  Never throws: a canvas or decode failure simply means "no inference". */
export async function inferFromHighlights(blob, corners, placement) {
  try {
    const bitmap = await createImageBitmap(blob);
    const colours = sampleSquareColours(bitmap, corners);
    bitmap.close?.();
    const highlights = findHighlights(colours);
    return { inferred: inferTurn(placement, highlights), highlights };
  } catch (err) {
    console.debug("高亮格推断失败（不影响其它功能）", err);
    return { inferred: null, highlights: [] };
  }
}
