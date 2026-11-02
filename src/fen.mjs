/** FEN composition from a bare placement.
 *
 *  A screenshot carries no game history, so three things cannot be recovered
 *  from pixels: side to move, castling rights, en passant / move counters.
 *  `composeFen` takes the first two as explicit choices and pins the rest to
 *  neutral defaults.
 *
 *  Mirrors the recognition contract of `@scoriiu/fenshot` (MIT):
 *  `flipPlacement` and `inferCastling` follow packages/fenshot/src/fen.ts and
 *  compose.ts. Kept dependency-free so Node tests and the browser share it.
 */

function expandRank(rank) {
  return rank.replace(/\d/g, (d) => ".".repeat(Number(d)));
}

/** Mirror a placement 180 degrees: reverse the rank order, and every rank's
 *  character order (which mirrors digits too, since a leading empty-run moves
 *  to the trailing end). */
export function flipPlacement(placement) {
  return placement
    .split("/")
    .reverse()
    .map((rank) => rank.split("").reverse().join(""))
    .join("/");
}

/** Castling rights implied by king/rook still standing on their home squares.
 *  Optimistic by nature: a screenshot cannot show that a right was already
 *  forfeited. */
export function inferCastling(placement) {
  const rows = placement.split("/");
  if (rows.length !== 8) return "-";

  const white = expandRank(rows[7]);
  const black = expandRank(rows[0]);
  let rights = "";

  if (white[4] === "K") {
    if (white[7] === "R") rights += "K";
    if (white[0] === "R") rights += "Q";
  }
  if (black[4] === "k") {
    if (black[7] === "r") rights += "k";
    if (black[0] === "r") rights += "q";
  }

  return rights || "-";
}

/** The one invariant every real position has: exactly one king per side.
 *  Detector false positives on board-free UI read as kingless scatters. */
export function isPlausible(placement) {
  let white = 0;
  let black = 0;
  for (const ch of placement) {
    if (ch === "K") white++;
    else if (ch === "k") black++;
  }
  return white === 1 && black === 1;
}

/** Build the FEN the app would send.
 *
 *  `rights` is per side, as letters: `{ w: "KQ", b: "kq" }`. The caller resolves
 *  it (see castling.mjs) because the side is chosen per side in the UI, and a
 *  single all-or-nothing flag cannot express "white may still castle, black
 *  may not". */
export function composeFen(placement, { turn, rights = { w: "-", b: "-" }, flipped }) {
  const p = flipped ? flipPlacement(placement) : placement;
  const letters = `${rights.w ?? ""}${rights.b ?? ""}`.replace(/-/g, "");
  return `${p} ${turn} ${letters || "-"} - 0 1`;
}
