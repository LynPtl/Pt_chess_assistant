/** 粘贴一段 PGN 直接摆棋。
 *
 *  和 FEN 一样，走子方、易位权都不用猜 —— 它们由 PGN 的着法推出来（chess.js 负责）。
 *  这里取的是**最终局面**：想逐步复盘应该用专门的 PGN 阅读器，本工具的定位是
 *  "把局面摆出来，然后送去分析"。
 */

import { Chess } from "chess.js";
import { splitCastling } from "./import-fen.mjs";

/** 先做个便宜的"像不像 PGN"判断，免得把普通文本丢进解析器。 */
function looksLikePgn(text) {
  if (/\[(Event|Site|White|Black|Result|FEN)\s/.test(text)) return true;
  // 有编号的着法："1. e4" / "1.e4" / "12... Nf6"
  return /(^|\s)\d{1,3}\s*\.{1,3}\s*[a-hKQRBNO]/.test(text);
}

/**
 * @param {string} text
 * @returns {{placement:string, turn:"w"|"b", castling:{w:string,b:string}, fen:string, moveCount:number}|null}
 */
export function parsePgnInput(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed || !looksLikePgn(trimmed)) return null;

  try {
    const game = new Chess();
    game.loadPgn(trimmed);
    const fen = game.fen();
    const fields = fen.split(" ");
    return {
      placement: fields[0],
      turn: game.turn(),
      castling: splitCastling(fields[2]),
      fen,
      moveCount: game.history().length,
    };
  } catch {
    return null;
  }
}
