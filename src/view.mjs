/** HTML builders for the page.
 *
 *  Pulled out of main.js so the markup can be asserted as strings — these are
 *  exactly the bits that silently regress (a badge in the wrong button, a
 *  status line that stops naming the reason), and none of them need a DOM.
 *  Every function takes its data as arguments; none reads module state.
 */

import { castlingOptions, describeChoice } from "./castling.mjs";
import { getLang, t } from "./i18n.mjs";

export const REPO_URL = "https://github.com/LynPtl/Pt_chess_assistant";

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"]/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch],
  );
}

/** Whether the handoff is wired, why not when it isn't, and the two things a
 *  user can do about it without leaving the page. */
export function statusStrip(health, { staticMode = false } = {}) {
  // 静态托管没有本地服务，谈不上"连没连上"
  if (staticMode) return "";
  const stop = `<button type="button" class="danger" data-action="shutdown">${t("shutdown")}</button>`;
  if (health.configured) {
    return `<div class="service-status ok">
      <span>${t("connected")}</span>
      <button type="button" data-action="open-app">${t("openApp")}</button>
      ${stop}
    </div>`;
  }
  return `<div class="service-status bad">
    <span>${t("disconnected", { reason: escapeHtml(health.reason ?? "") })}</span>
    <button type="button" data-action="refresh-health">${t("recheck")}</button>
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
      const label = side === "w" ? t("castleWhite") : t("castleBlack");
      const badge = (where) =>
        view.badge === where
          ? `<span class="inferred-badge" title="${escapeHtml(view.reason)}">${t("inferred")}</span>`
          : "";
      const onDisabled = view.canHave ? "" : `disabled title="${escapeHtml(view.reason)}"`;
      return `<div class="control">
        <span class="control-label">${label}</span>
        <div class="toggle">
          <button type="button" class="${view.onSelected ? (view.badge === "on" ? "auto-on" : "on") : ""}"
            data-action="castle-${side}-on" ${onDisabled}>${t("castleStill")}${badge("on")}</button>
          <button type="button" class="${view.offSelected ? (view.badge === "off" ? "auto-on" : "on") : ""}"
            data-action="castle-${side}-off">${t("castleLost")}${badge("off")}</button>
        </div>
      </div>`;
    })
    .join("");
}

/** 白子一行、黑子一行；擦除单独放一个小的工具按钮，免得和棋子一样大。 */
export function paletteHtml({ activePiece, pieceUrls, palette, canUndo = false }) {
  const button = (piece) =>
    `<button type="button" class="palette-btn ${activePiece === piece ? "on" : ""}" ` +
    `data-piece="${piece}" title="${piece === "" ? t("erase") : piece}">` +
    (piece === "" ? "⌫" : `<img src="${pieceUrls[piece]}" alt="${piece}" />`) +
    `</button>`;
  const row = (pieces) => `<div class="palette-row">${pieces.map(button).join("")}</div>`;
  const white = palette.filter((p) => p === p.toUpperCase());
  const black = palette.filter((p) => p !== p.toUpperCase());
  const eraser =
    `<div class="palette-row palette-erase">` +
    `<button type="button" class="palette-btn small ${activePiece === "" ? "on" : ""}" ` +
    `data-piece="" title="${t("erase")}">⌫</button>` +
    `<span class="palette-label">${t("eraseHint")}</span>` +
    `<button type="button" class="undo-btn" data-action="undo" title="${t("undoTitle")}" ${canUndo ? "" : "disabled"}>${t("undo")}</button>` +
    `</div>`;
  return `<div class="palette">${row(white)}${row(black)}${eraser}</div>`;
}

export function toggleButton(label, active, action) {
  return `<button type="button" class="${active ? "on" : ""}" data-action="${action}">${label}</button>`;
}

/** 底部按钮区：撤销、送入、复制 FEN、再来一张，以及"还不能送入"的说明。 */
export function actionsRow({ configured, blocked, reason = "", closeFirst = false, staticMode = false, fen = null }) {
  // 一个局面除了"交给本地 GUI"，另一条常见出路是直接丢到 lichess 分析 ——
  // 静态版（没有后端）就只剩这一条。
  const icExternal =
    '<svg class="ext-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-8.5 8.5"/>' +
    '<path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>';
  const lichess = fen
    ? `<a class="btn accent" href="https://lichess.org/analysis/standard/${fen.replaceAll(" ", "_")}"
          target="_blank" rel="noreferrer" title="${t("lichessTitle")}"
        >${t("lichess")}${icExternal}</a>`
    : "";

  if (staticMode) {
    return `<div class="actions">
      <button type="button" data-action="copy">${t("copyFen")}</button>
      <button type="button" data-action="link" title="${t("copyLinkTitle")}">${t("copyLink")}</button>
      ${lichess}
      <button type="button" data-action="reset">${t("retry")}</button>
    </div>`;
  }

  const send = configured
    ? `<button type="button" class="primary" data-action="send" ${blocked ? "disabled" : ""}>${t("send")}</button>`
    : "";
  const hint = configured
    ? ""
    : `<p class="hint">${t("cannotSend", { reason: escapeHtml(reason) })}</p>`;
  return `<div class="actions">
      ${send}
      <label class="close-first" title="${t("closeFirstTitle")}">
        <input type="checkbox" data-action="close-first" ${closeFirst ? "checked" : ""} />
        ${t("closeFirst")}
      </label>
      <button type="button" data-action="copy">${t("copyFen")}</button>
      <button type="button" data-action="link" title="${t("copyLinkTitle")}">${t("copyLink")}</button>
      ${lichess}
      <button type="button" data-action="reset">${t("retry")}</button>
    </div>
    ${hint}`;
}

/** 首页的投放区。截图和 FEN 两条路都要写在上面——只在代码里支持、
 *  界面上不提，等于没有这个功能。 */
export function dropzoneHtml({ busy }) {
  return `<section class="dropzone ${busy ? "busy" : ""}" data-zone="drop">
      <h1>${t("dropTitle")}</h1>
      <p class="hint">
        <kbd>Ctrl</kbd>+<kbd>V</kbd> ${t("dropHint")}
      </p>
      <p class="hint hint-small">
        ${t("demoPrompt")}<button type="button" class="link-btn" data-action="demo">${t("demoButton")}</button>
      </p>
      <p class="hint hint-small">
        ${t("fenExample")}
        <code>r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b Qk - 0 1</code>
      </p>
      <div class="status">${busy ? t("scanning") : ""}</div>
      <input id="file" type="file" accept="image/*" hidden />
    </section>`;
}

/** 「最近识别过的局面」。点一条就能重新摆出来 —— 不用再找那张截图。 */
export function recentList({ items = [] } = {}) {
  if (!items.length) return "";
  const rows = items
    .map((item, index) => {
      const when = new Date(item.ts);
      const time = Number.isNaN(when.getTime())
        ? ""
        : `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
      const kind = item.source === "fen" ? "FEN" : item.source === "pgn" ? "PGN" : t("kindScreenshot");
      return `<li>
        <button type="button" class="recent-row" data-action="recent" data-index="${index}" title="${escapeHtml(item.fen)}">
          <span class="recent-kind">${kind}</span>
          <code class="recent-fen">${escapeHtml(item.fen)}</code>
          <span class="recent-time">${time}</span>
        </button>
      </li>`;
    })
    .join("");
  return `<section class="recent">
      <h2>${t("recentTitle")}</h2>
      <ul>${rows}</ul>
    </section>`;
}

/** 页脚：把线上访客引到 GitHub。
 *
 *  静态版能做的只有"摆好 + 复制 FEN / 去 lichess"，真正的分析要本地跑
 *  （Maia 3 / Stockfish 都是本地进程）—— 所以这里得说清楚去那边能得到什么，
 *  而不是干巴巴贴一个仓库地址。
 */
export function footerHtml({ staticMode = false } = {}) {
  const pitch = staticMode
    ? `<span class="footer-pitch">${t("footerPitchStatic")}</span>`
    : `<span class="footer-pitch">${t("footerPitchLocal")}</span>`;
  return `<footer class="site-footer">
      ${pitch}
      <a href="${REPO_URL}" target="_blank" rel="noreferrer">${
        staticMode ? t("footerLinkStatic") : t("footerLinkLocal")
      }</a>
      <span class="footer-lang">${
        getLang() === "zh"
          ? '<a href="?lang=en" data-action="lang">English</a>'
          : '<a href="?lang=zh" data-action="lang">中文</a>'
      }</span>
    </footer>`;
}
