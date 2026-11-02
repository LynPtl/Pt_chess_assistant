/** Read-only board for the confirm step, drawn as SVG.
 *
 *  Pieces are the cburnett set from lichess (see ./pieces/NOTICE.md) so white
 *  and black read apart at a glance; Unicode glyphs looked nearly identical at
 *  this size. The caller supplies the URLs because Vite hashes assets.
 *
 *  Editing lives outside this module: every square carries `data-square` with
 *  the FEN index it shows, and piece images are pointer-events:none so a click
 *  always lands on the square underneath.
 */

const LIGHT = "#eeeed2";
const DARK = "#769656";

/** Expand a FEN board field into 64 cells, index 0 = a8, index 63 = h1. */
function expandPlacement(placement) {
  const cells = [];
  for (const rank of placement.split("/")) {
    for (const ch of rank) {
      if (ch >= "1" && ch <= "8") {
        for (let i = 0; i < Number(ch); i++) cells.push("");
      } else {
        cells.push(ch);
      }
    }
  }
  return cells;
}

export function renderBoardSvg(placement, flipped, pieces) {
  const cells = expandPlacement(placement);
  const parts = [];
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" class="board" role="img">');

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      // data-square is the FEN index of the square shown at this screen cell,
      // so the caller can map a click back to the placement regardless of flip.
      const sourceRow = flipped ? 7 - row : row;
      const sourceCol = flipped ? 7 - col : col;
      const index = sourceRow * 8 + sourceCol;
      const light = (row + col) % 2 === 0;
      parts.push(
        `<rect class="sq" data-square="${index}" x="${col}" y="${row}" ` +
          `width="1" height="1" fill="${light ? LIGHT : DARK}"/>`,
      );
    }
  }

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const sourceRow = flipped ? 7 - row : row;
      const sourceCol = flipped ? 7 - col : col;
      const piece = cells[sourceRow * 8 + sourceCol];
      const href = piece ? pieces[piece] : null;
      if (!href) continue;
      parts.push(
        `<image href="${href}" x="${col + 0.05}" y="${row + 0.05}" width="0.9" height="0.9" ` +
          `pointer-events="none"/>`,
      );
    }
  }

  parts.push("</svg>");
  return parts.join("");
}
