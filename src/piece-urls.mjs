// Vite turns each .svg import into a hashed asset URL, so the board can point
// at the Spatial pieces lichess ships (see ./pieces/NOTICE.md). MIT, like this repo.
import wK from "./pieces/spatial/wK.svg";
import wQ from "./pieces/spatial/wQ.svg";
import wR from "./pieces/spatial/wR.svg";
import wB from "./pieces/spatial/wB.svg";
import wN from "./pieces/spatial/wN.svg";
import wP from "./pieces/spatial/wP.svg";
import bK from "./pieces/spatial/bK.svg";
import bQ from "./pieces/spatial/bQ.svg";
import bR from "./pieces/spatial/bR.svg";
import bB from "./pieces/spatial/bB.svg";
import bN from "./pieces/spatial/bN.svg";
import bP from "./pieces/spatial/bP.svg";

/** FEN piece char → asset URL, for renderBoardSvg. */
export const PIECE_URLS = {
  K: wK, Q: wQ, R: wR, B: wB, N: wN, P: wP,
  k: bK, q: bQ, r: bR, b: bB, n: bN, p: bP,
};

/** Palette order: white heaviest first, then black — the order lichess uses. */
export const PALETTE = ["K", "Q", "R", "B", "N", "P", "k", "q", "r", "b", "n", "p"];
