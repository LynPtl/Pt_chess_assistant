import { Chess } from "chess.js";

/** Decide what the confirm step will let the user do with a position.
 *
 *  The rule the spec fixes: a wrong position must never reach the engine
 *  silently. So every doubt becomes a visible warning, and only a FEN the
 *  rules engine refuses is a hard stop — the two softer signals
 *  (low confidence, wrong king count) can still be right, and the user is
 *  looking at the board.
 *
 *  Returns { blocked, needsConfirm, warnings }:
 *   blocked      — the "送入" button is disabled
 *   needsConfirm — the button asks once more before sending
 */
export function evaluatePosition({ fen, reliable, minConfidence, plausible }) {
  const warnings = [];

  if (!reliable) {
    const percent = Math.round((minConfidence ?? 0) * 100);
    warnings.push(`识别置信度偏低（最差格子 ${percent}%），请对照截图核对棋子。`);
  }
  if (!plausible) {
    warnings.push("双方的王的数量不对，这可能不是合法局面。");
  }

  let blocked = false;
  try {
    new Chess(fen);
  } catch (err) {
    blocked = true;
    warnings.push(`局面不合法：${err.message}`);
  }

  return {
    blocked,
    needsConfirm: !blocked && (warnings.length > 0),
    warnings,
  };
}
