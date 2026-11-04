/** 粘贴一段 FEN 直接摆棋。
 *
 *  FEN 是棋界通用的交换格式：从 lichess、聊天记录、文章里复制一段就能用。
 *  和截图不同，这里的走子方和易位权**不用猜** —— FEN 本来就带着它们，所以导入
 *  的局面是"确定"的，不像识别结果那样需要用户核对推断值。
 */

import { Chess } from "chess.js";

const FIELDS = 6;

/** "KQkq" → { w: "KQ", b: "kq" }；没有就是 "-"。 */
export function splitCastling(field) {
  const white = [...field].filter((ch) => "KQ".includes(ch)).join("");
  const black = [...field].filter((ch) => "kq".includes(ch)).join("");
  return { w: white || "-", b: black || "-" };
}

/**
 * @param {string} text 剪贴板里的原文
 * @returns {{placement:string, turn:"w"|"b", castling:{w:string,b:string}, fen:string}|null}
 */
export function parseFenInput(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  let fields = trimmed.split(/\s+/);
  if (fields.length === 4) fields = [...fields, "0", "1"];
  if (fields.length !== FIELDS) return null;

  const candidate = fields.join(" ");

  // chess.js 顺带校验棋子摆位（王的数量等）和走子方。它拒了就当不是 FEN。
  try {
    const game = new Chess(candidate);
    return {
      placement: candidate.split(" ")[0],
      turn: game.turn(),
      castling: splitCastling(fields[2]),
      fen: candidate,
    };
  } catch {
    return null;
  }
}
