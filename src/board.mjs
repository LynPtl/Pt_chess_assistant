/** Read-only board for the confirm step. Deliberately dumb: no drag, no
 *  legal-move highlighting, no engine arrows — En Croissant is where the
 *  position gets played. This only has to make "did it read the right
 *  pieces?" answerable at a glance. Unicode glyphs keep it dependency-free. */

const WHITE = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙" };
const BLACK = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

const LIGHT = "#eeeed2";
const DARK = "#769656";

function glyphFor(piece) {
  return WHITE[piece] ?? BLACK[piece] ?? "";
}

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

export function renderBoardSvg(placement, flipped) {
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
      // Non-flipped: row 0 is rank 8, col 0 is file a.
      const sourceRow = flipped ? 7 - row : row;
      const sourceCol = flipped ? 7 - col : col;
      const piece = cells[sourceRow * 8 + sourceCol];
      if (!piece) continue;
      const white = piece === piece.toUpperCase();
      parts.push(
        // pointer-events="none" so a click on a piece reaches the square rect
        // underneath: without it, clicking a piece does nothing at all and the
        // board feels like a picture.
        `<text x="${col + 0.5}" y="${row + 0.5}" font-size="0.86" text-anchor="middle" ` +
          `pointer-events="none" ` +
          `dominant-baseline="central" fill="${white ? "#fff" : "#111"}" ` +
          `stroke="${white ? "#111" : "#fff"}" stroke-width="0.035">${glyphFor(piece)}</text>`,
      );
    }
  }

  parts.push("</svg>");
  return parts.join("");
}
