/** Grading for the ?fixtures=1 regression run.
 *
 *  Lives in its own module because "did the recognizer get this one right" is
 *  the only thing worth asserting about a recognition run, and it can be
 *  asserted without a browser.
 *
 *  `expected` is one entry of test/fixtures/expected.json; `outcome` is what
 *  the page ended up with:
 *    { kind: "result", placement, reliable, orientation } | { kind: "noboard" }
 */
export function judgeFixture(expected, outcome) {
  switch (expected.expect) {
    case "no-board":
      return outcome.kind === "noboard"
        ? { pass: true, reason: "ok" }
        : { pass: false, reason: "期望找不到棋盘，却识别出了一个局面" };

    case "low-confidence-reject":
      return outcome.kind === "result" && !outcome.reliable
        ? { pass: true, reason: "ok" }
        : { pass: false, reason: "期望被标为低置信度而拒绝，实际被当成了可信结果" };

    case "match": {
      if (outcome.kind !== "result") return { pass: false, reason: "期望识别出局面，实际没找到棋盘" };
      if (outcome.placement !== expected.fen) {
        return { pass: false, reason: `摆位不符：实际 ${outcome.placement}` };
      }
      if (!outcome.reliable) return { pass: false, reason: "摆位对但被标为低置信度" };
      if (expected.orientation && outcome.orientation !== expected.orientation) {
        return { pass: false, reason: `朝向不符：实际 ${outcome.orientation}` };
      }
      return { pass: true, reason: "ok" };
    }

    default:
      return { pass: false, reason: `未知的 expect 值：${expected.expect}` };
  }
}
