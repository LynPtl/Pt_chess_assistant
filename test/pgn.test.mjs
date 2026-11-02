import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPositionPgn } from "../src/pgn.mjs";

test("含 SetUp 与 FEN 头，正文为 *", () => {
  assert.equal(
    buildPositionPgn("8/8/8/8/8/8/8/K6k w - - 0 1"),
    '[Event "Pasted position"]\n[SetUp "1"]\n[FEN "8/8/8/8/8/8/8/K6k w - - 0 1"]\n\n*\n',
  );
});

test("FEN 里的双引号被转义成 \\\"", () => {
  assert.match(buildPositionPgn('8/8/8/8/8/8/8/K6k w " - 0 1'), /\[FEN "8\/8\/8\/8\/8\/8\/8\/K6k w \\" - 0 1"\]/);
});

test("Event 名可覆盖", () => {
  assert.match(buildPositionPgn("8/8/8/8/8/8/8/K6k w - - 0 1", "My event"), /^\[Event "My event"\]/);
});
