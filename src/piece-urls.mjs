// Vite turns each .svg import into a hashed asset URL, so the board can point
// at the cburnett pieces lichess ships (see ./pieces/NOTICE.md).
import wK from "./pieces/cburnett/wK.svg";
import wQ from "./pieces/cburnett/wQ.svg";
import wR from "./pieces/cburnett/wR.svg";
import wB from "./pieces/cburnett/wB.svg";
import wN from "./pieces/cburnett/wN.svg";
import wP from "./pieces/cburnett/wP.svg";
import bK from "./pieces/cburnett/bK.svg";
import bQ from "./pieces/cburnett/bQ.svg";
import bR from "./pieces/cburnett/bR.svg";
import bB from "./pieces/cburnett/bB.svg";
import bN from "./pieces/cburnett/bN.svg";
import bP from "./pieces/cburnett/bP.svg";

/** FEN piece char → asset URL, for renderBoardSvg. */
export const PIECE_URLS = {
  K: wK, Q: wQ, R: wR, B: wB, N: wN, P: wP,
  k: bK, q: bQ, r: bR, b: bB, n: bN, p: bP,
};

/** Palette order: white heaviest first, then black — the order lichess uses. */
export const PALETTE = ["K", "Q", "R", "B", "N", "P", "k", "q", "r", "b", "n", "p"];
