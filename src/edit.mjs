/** Hand-editing the recognized position.
 *
 *  A recognizer that is confidently wrong is worse than useless: without this,
 *  the only options are "send a wrong position" or "start over". Cycling a
 *  square through empty → P N B R Q K → p n b r q k → empty fixes a handful of
 *  misread pieces in a few clicks, and it is the same 13 states the FEN board
 *  field already holds.
 */

const CYCLE = ["", "P", "N", "B", "R", "Q", "K", "p", "n", "b", "r", "q", "k"];

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

/** Step the piece on `index` forward (+1) or backward (-1) through the cycle.
 *  A malformed placement comes back untouched rather than throwing: this runs
 *  on a click handler, and a crash there would strand the page. */
export function cycleSquare(placement, index, direction = 1) {
  const cells = expand(placement);
  if (!cells || index < 0 || index > 63) return placement;
  const current = CYCLE.indexOf(cells[index]);
  if (current === -1) return placement;
  const next = (current + direction + CYCLE.length) % CYCLE.length;
  cells[index] = CYCLE[next];
  return collapse(cells);
}
