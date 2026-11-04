/** Development-only hooks: `?fixtures=1` and `?selftest=<file>`.
 *
 *  Both drive the exact production path (`scanImage` → `resolveOrientation` →
 *  `composeFen`) and publish their outcome on `window.__done`, so
 *  `scripts/browser-check.mjs` can await real browser work instead of guessing
 *  how long wasm takes.
 *
 *  They live in their own module so the product code in main.js stays about the
 *  product, and so nothing here can be called by accident: the caller decides
 *  to install them only when the query string asks for it.
 */

import { judgeFixture } from "./fixtures.mjs";
import { isPlausible } from "./fen.mjs";

/**
 * @param {object} ctx
 * @param {URLSearchParams} ctx.params
 * @param {HTMLElement} ctx.app
 * @param {(blob: Blob) => Promise<void>} ctx.scanImage
 * @param {() => object} ctx.getState
 * @param {() => string|null} ctx.currentFen
 * @param {(fen: string) => object} ctx.verdictFor
 * @param {boolean} ctx.handoffConfigured
 * @param {(blob: Blob, spec: string|null) => Promise<Blob>} ctx.castCrop
 * @param {(blob: Blob, width: number) => Promise<Blob>} ctx.upscaleToWidth
 * @returns {Promise<unknown>|true} the promise to publish on window.__done
 */
export function installDevHooks(ctx) {
  const { params, app, scanImage, getState } = ctx;
  const fixtureRun = params.get("fixtures") === "1";
  const selfTest = params.get("selftest");

  function outcomeOf() {
    const state = getState();
    return state.kind === "result"
      ? {
          kind: "result",
          placement: state.placement,
          reliable: state.scan.reliable,
          orientation: state.orientation,
        }
      : { kind: state.kind };
  }

  async function runFixtureSuite() {
    const expected = await (await fetch("/fixtures/expected.json")).json();
    const rows = [];
    for (const [name, want] of Object.entries(expected)) {
      const blob = await (await fetch(`/fixtures/${name}`)).blob();
      await scanImage(blob);
      const state = getState();
      const { pass, reason } = judgeFixture(want, outcomeOf());
      rows.push({
        name,
        expect: want.expect,
        pass,
        reason,
        actual: state.kind === "result" ? state.placement : "—",
      });
    }
    const failed = rows.filter((r) => !r.pass);
    app.innerHTML = `
      <h1>回归：${rows.length - failed.length}/${rows.length} 通过</h1>
      <table class="fixtures">
        <thead><tr><th>fixture</th><th>期望</th><th>结果</th><th>说明</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr class="${r.pass ? "pass" : "fail"}">
                <td>${r.name}</td><td>${r.expect}</td><td>${r.pass ? "PASS" : "FAIL"}</td>
                <td>${r.pass ? r.actual : r.reason}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>`;
    return rows;
  }

  async function runSelfTest() {
    const response = await fetch(`/fixtures/${selfTest}`);
    const blob = await response.blob();
    // ?w=3840 blows the fixture up to a 4K-wide frame, which is how the
    // full-screen input class gets exercised without shipping a 4K png.
    const targetWidth = Number(params.get("w") ?? "0");
    // ?crop=x,y,w,h carves a partial board out, which is the "board was cut
    // off / partly covered" input class.
    let input = ctx.castCrop(blob, params.get("crop"));
    input = targetWidth > 0 ? await ctx.upscaleToWidth(await input, targetWidth) : await input;
    await scanImage(input);

    const state = getState();
    const fen = ctx.currentFen();
    const payload =
      state.kind === "result"
        ? {
            kind: "result",
            placement: state.placement,
            orientation: state.orientation,
            reliable: state.scan.reliable,
            plausible: isPlausible(state.placement),
            meanConfidence: state.scan.meanConfidence,
            minConfidence: state.scan.minConfidence,
            fen,
            castling: state.castling,
            turn: state.turn,
            flipped: state.flipped,
            corners: state.scan.corners,
            turnInferred: state.turnInferred,
            inferredMover: state.inferredMover,
            verdict: ctx.verdictFor(fen),
            handoffAvailable: ctx.handoffConfigured,
            dom: {
              image: Boolean(app.querySelector(".result img")),
              board: Boolean(app.querySelector("svg.board")),
              confidenceShown: /置信度 \d+%/.test(app.textContent ?? ""),
              sendButton: Boolean(app.querySelector('[data-action="send"]')),
              sendDisabled: Boolean(app.querySelector('[data-action="send"]')?.disabled),
            },
          }
        : { kind: state.kind, message: state.message ?? null };

    document.body.dataset.result = JSON.stringify(payload);
    const pre = document.createElement("pre");
    pre.id = "selftest";
    pre.textContent = JSON.stringify(payload);
    document.body.append(pre);
    return payload;
  }

  if (fixtureRun) return runFixtureSuite();
  if (selfTest) return runSelfTest();
  return true;
}
