/** Hand-editing the recognized position.
 *
 *  A recognizer that is confidently wrong is worse than useless: without this,
 *  the only options are "send a wrong position" or "start over".
 *
 *  The interaction is the one every board editor uses — pick a piece from the
 *  palette, then click the squares you want it on. `stampSquare` is the whole
 *  edit primitive; the cycling alternative was rejected because changing one
 *  square took up to twelve clicks and gave no preview of what came next.
 */

export const PIECE_CHARS = ["", "P", "N", "B", "R", "Q", "K", "p", "n", "b", "r", "q", "k"];

/** Linear index 0..63 with 0 = a8 and 63 = h1 — the same order the FEN board
 *  field is written in, and the order renderBoardSvg draws in. */
export function squareToIndex(col, row) {
  return row * 8 + col;
}

function expand(placement) {
  const rows = placement.split("/");
  if (rows.length !== 8) return null;
  const cells = [];
  for (const row of rows) {
    for (const ch of row) {
      if (ch >= "1" && ch <= "8") {
        for (let i = 0; i < Number(ch); i++) cells.push("");
      } else {
        cells.push(ch);
      }
    }
  }
  return cells.length === 64 ? cells : null;
}

function collapse(cells) {
  const rows = [];
  for (let row = 0; row < 8; row++) {
    let line = "";
    let run = 0;
    for (let col = 0; col < 8; col++) {
      const piece = cells[row * 8 + col];
      if (piece) {
        if (run) {
          line += String(run);
          run = 0;
        }
        line += piece;
      } else {
        run++;
      }
    }
    if (run) line += String(run);
    rows.push(line);
  }
  return rows.join("/");
}

/** Put `piece` (a FEN char, or "" to erase) on `index`.
 *  A malformed placement or unknown piece comes back untouched rather than
 *  throwing: this runs on a click handler, and a crash there strands the page. */
export function stampSquare(placement, index, piece) {
  if (!PIECE_CHARS.includes(piece)) return placement;
  if (!Number.isInteger(index) || index < 0 || index > 63) return placement;
  const cells = expand(placement);
  if (!cells) return placement;
  cells[index] = piece;
  return collapse(cells);
}

/** Move whatever stands on `from` to `to`, leaving `from` empty. Like setting
 *  up a position by hand: a piece already on `to` is simply replaced.
 *
 *  Same failure discipline as stampSquare — a bad index or a malformed
 *  placement comes back untouched, because this runs inside a pointer handler.
 */
export function moveSquare(placement, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return placement;
  if (from < 0 || from > 63 || to < 0 || to > 63) return placement;
  if (from === to) return placement;
  const cells = expand(placement);
  if (!cells) return placement;
  const piece = cells[from];
  if (!piece) return placement;
  cells[to] = piece;
  cells[from] = "";
  return collapse(cells);
}
