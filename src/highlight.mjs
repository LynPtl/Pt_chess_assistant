/** Infer whose turn it is from the "last move" highlight every chess site draws.
 *
 *  A screenshot carries no side-to-move, but it does carry the tint on the two
 *  squares of the move just played. The tinted square that still holds a piece
 *  is the move's destination, so its colour tells us who just moved, and the
 *  side to move is the other one.
 *
 *  Everything here is a *suggestion*: ambiguous reads return null and the UI
 *  leaves the side-to-move toggle alone.
 */

/** How far green runs ahead of the red/blue average. Last-move tint is
 *  yellow-green on every theme checked (lichess brown, chess.com green):
 *  ~55/47 on a real screenshot against ≤7 everywhere else. */
export function greenExcess({ r, g, b }) {
  return g - (r + b) / 2;
}

/** Absolute floor, in case a theme's tint is faint. */
const MIN_EXCESS = 25;
/** At most one move is highlighted, so at most two squares — allow a couple
 *  extra for a "selected piece" square, but no more. */
const MAX_HIGHLIGHTS = 4;

/**
 * @param {{r:number,g:number,b:number}[]} samples 64 squares, a8..h1 order
 * @returns {number[]} indices of highlighted squares, strongest first
 */
export function findHighlights(samples) {
  if (!Array.isArray(samples) || samples.length !== 64) return [];

  const scored = samples.map((sample, index) => ({ index, excess: greenExcess(sample) }));
  const strongest = Math.max(...scored.map((s) => s.excess));
  // Relative threshold as well as absolute: a green-themed board has a high
  // baseline, so "the biggest" alone is not enough evidence of a highlight.
  const threshold = Math.max(MIN_EXCESS, strongest * 0.5);
  const hits = scored.filter((s) => s.excess >= threshold);
  if (hits.length === 0 || hits.length > MAX_HIGHLIGHTS) return [];
  return hits.sort((a, b) => b.excess - a.excess).map((s) => s.index);
}

function expand(placement) {
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
  return cells.length === 64 ? cells : null;
}

/**
 * @param {string} placement FEN board field
 * @param {number[]} highlightIndices from findHighlights
 * @returns {{turn:"w"|"b", mover:"w"|"b", square:number}|null}
 */
export function inferTurn(placement, highlightIndices) {
  const cells = expand(placement);
  if (!cells || !Array.isArray(highlightIndices) || highlightIndices.length === 0) return null;

  const occupied = highlightIndices.filter((i) => cells[i]);
  // Exactly one highlighted square holds a piece — the destination. Zero means
  // we only caught the origin; more than one means the read is not a last move.
  if (occupied.length !== 1) return null;

  const square = occupied[0];
  const piece = cells[square];
  const mover = piece === piece.toUpperCase() ? "w" : "b";
  return { turn: mover === "w" ? "b" : "w", mover, square };
}

/** Four points per square, inset from the corners so the piece in the middle
 *  does not pollute the sample. Returns 64 entries (a8..h1), 4 points each,
 *  in image pixel coordinates for a board whose box is (x0,y0)-(x0+w, y0+h). */
export function samplePoints(x0, y0, width, height) {
  const w = width / 8;
  const h = height / 8;
  const inset = 0.18;
  const points = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const sx = x0 + col * w;
      const sy = y0 + row * h;
      points.push([
        [sx + w * inset, sy + h * inset],
        [sx + w * (1 - inset), sy + h * inset],
        [sx + w * inset, sy + h * (1 - inset)],
        [sx + w * (1 - inset), sy + h * (1 - inset)],
      ]);
    }
  }
  return points;
}

/** 高亮格是在**图像空间**里找到的（左上角为 0），而摆位经过 resolveOrientation
 *  之后是**真实空间**（白方在下）。黑方视角的截图两者差一个 180°，不转就会拿
 *  错的格子去查棋子 —— 走子方和易位权都会因此判错。 */
export function rotateHighlights(indices) {
  if (!Array.isArray(indices)) return [];
  return indices.map((i) => 63 - i);
}
