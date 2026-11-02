/** Minimal PGN for "here is a position, open it" — En Croissant reads the
 *  `[FEN]` header (src/utils/chess.ts parsePGN) and starts the tree there,
 *  so a bare position with no moves is a complete handoff. */

function escapeTag(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function buildPositionPgn(fen, event = "Pasted position") {
  return `[Event "${escapeTag(event)}"]\n[SetUp "1"]\n[FEN "${escapeTag(fen)}"]\n\n*\n`;
}
