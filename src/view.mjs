/** HTML builders for the page.
 *
 *  Pulled out of main.js so the markup can be asserted as strings — these are
 *  exactly the bits that silently regress (a badge in the wrong button, a
 *  status line that stops naming the reason), and none of them need a DOM.
 *  Every function takes its data as arguments; none reads module state.
 */

import { castlingOptions, describeChoice } from "./castling.mjs";

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"]/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch],
  );
}

/** Whether the handoff is wired, why not when it isn't, and the two things a
 *  user can do about it without leaving the page. */
export function statusStrip(health) {
  const stop = `<button type="button" class="danger" data-action="shutdown">停止服务</button>`;
  if (health.configured) {
    return `<div class="service-status ok">
      <span>● 已连上 En Croissant</span>
      <button type="button" data-action="open-app">打开 En Croissant</button>
      ${stop}
    </div>`;
  }
  return `<div class="service-status bad">
    <span>● 未连上 En Croissant —— ${escapeHtml(health.reason ?? "")}</span>
    <button type="button" data-action="refresh-health">重新检测</button>
    ${stop}
  </div>`;
}

export function noticeBlock(notice) {
  return notice
    ? `<p class="notice notice-${notice.tone}" role="status">${escapeHtml(notice.text)}</p>`
    : "";
}

/** 每一侧一组「有 | 无」。推断结论写在被选中的那个按钮*里面*，
 *  而不是挂在组后面。 */
export function castlingControls({ placement, castling, highlights }) {
  return ["w", "b"]
    .map((side) => {
      const options = castlingOptions(placement, side, highlights ?? []);
      const choice = castling?.[side] ?? "auto";
      const view = describeChoice(options, choice);
      const label = side === "w" ? "白方" : "黑方";
      const badge = (where) =>
        view.badge === where
          ? `<span class="inferred-badge" title="${escapeHtml(view.reason)}">推断</span>`
          : "";
      const onDisabled = view.canHave ? "" : `disabled title="${escapeHtml(view.reason)}"`;
      return `<div class="control">
        <span class="control-label">${label}易位</span>
        <div class="toggle">
          <button type="button" class="${view.onSelected ? (view.badge === "on" ? "auto-on" : "on") : ""}"
            data-action="castle-${side}-on" ${onDisabled}>有${badge("on")}</button>
          <button type="button" class="${view.offSelected ? (view.badge === "off" ? "auto-on" : "on") : ""}"
            data-action="castle-${side}-off">无${badge("off")}</button>
        </div>
      </div>`;
    })
    .join("");
}

/** 白子一行、黑子一行；擦除单独放一个小的工具按钮，免得和棋子一样大。 */
export function paletteHtml({ activePiece, pieceUrls, palette }) {
  const button = (piece) =>
    `<button type="button" class="palette-btn ${activePiece === piece ? "on" : ""}" ` +
    `data-piece="${piece}" title="${piece === "" ? "擦除" : piece}">` +
    (piece === "" ? "⌫" : `<img src="${pieceUrls[piece]}" alt="${piece}" />`) +
    `</button>`;
  const row = (pieces) => `<div class="palette-row">${pieces.map(button).join("")}</div>`;
  const white = palette.filter((p) => p === p.toUpperCase());
  const black = palette.filter((p) => p !== p.toUpperCase());
  const eraser =
    `<div class="palette-row palette-erase">` +
    `<button type="button" class="palette-btn small ${activePiece === "" ? "on" : ""}" ` +
    `data-piece="" title="擦除">⌫</button>` +
    `<span class="palette-label">擦除（右键点格子更快）</span>` +
    `</div>`;
  return `<div class="palette">${row(white)}${row(black)}${eraser}</div>`;
}

export function toggleButton(label, active, action) {
  return `<button type="button" class="${active ? "on" : ""}" data-action="${action}">${label}</button>`;
}
