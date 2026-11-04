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
export function statusStrip(health, { staticMode = false } = {}) {
  // 静态托管没有本地服务，谈不上"连没连上"
  if (staticMode) return "";
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
export function paletteHtml({ activePiece, pieceUrls, palette, canUndo = false }) {
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
    `<button type="button" class="undo-btn" data-action="undo" title="撤销上一步（Ctrl+Z）" ${canUndo ? "" : "disabled"}>↶ 撤销</button>` +
    `<button type="button" class="undo-btn" data-action="rotate" title="识别出的朝向反了就转 180°（这会改局面本身，易位权随之重算）">⟳ 旋转局面</button>` +
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
          target="_blank" rel="noreferrer" title="把这个局面发到 lichess 分析（会在新标签页打开）"
        >在 lichess 分析${icExternal}</a>`
    : "";

  if (staticMode) {
    return `<div class="actions">
      <button type="button" data-action="copy">复制 FEN</button>
      ${lichess}
      <button type="button" data-action="reset">再试一张</button>
    </div>`;
  }

  const send = configured
    ? `<button type="button" class="primary" data-action="send" ${blocked ? "disabled" : ""}>送入 En Croissant</button>`
    : "";
  const hint = configured
    ? ""
    : `<p class="hint">还不能送入：${escapeHtml(reason)}。改好 <code>config.json</code>，再点上面的「重新检测」。</p>`;
  return `<div class="actions">
      ${send}
      <label class="close-first" title="En Croissant 每次送入都会新开一个窗口；勾上就先把已开的关掉">
        <input type="checkbox" data-action="close-first" ${closeFirst ? "checked" : ""} />
        先关掉旧窗口
      </label>
      <button type="button" data-action="copy">复制 FEN</button>
      ${lichess}
      <button type="button" data-action="reset">再试一张</button>
    </div>
    ${hint}`;
}

/** 首页的投放区。截图和 FEN 两条路都要写在上面——只在代码里支持、
 *  界面上不提，等于没有这个功能。 */
export function dropzoneHtml({ busy }) {
  return `<section class="dropzone ${busy ? "busy" : ""}" data-zone="drop">
      <h1>粘贴棋盘截图，或者一段 FEN</h1>
      <p class="hint">
        <kbd>Ctrl</kbd>+<kbd>V</kbd> 任意位置粘贴 · 拖入图片 · 或点这里选择文件
      </p>
      <p class="hint hint-small">
        手边没有截图？<button type="button" class="link-btn" data-action="demo">用这张示例图试一下</button>
      </p>
      <p class="hint hint-small">
        也可以直接粘贴一段 FEN，例如
        <code>r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b Qk - 0 1</code>
      </p>
      <div class="status">${busy ? "正在识别…" : ""}</div>
      <input id="file" type="file" accept="image/*" hidden />
    </section>`;
}
