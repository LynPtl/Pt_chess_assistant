/** Editable board: stamp, erase, drag-to-move.
 *
 *  Lifted out of main.js so the coordinate mapping (the part that silently
 *  moves the wrong piece when it is off by a square) is a pure function with
 *  tests, and so the drag state machine has one home.
 *
 *  The caller owns state; this module only asks it to change through the
 *  callbacks it is given.
 */

/** Pointer position → board square index, using the SVG's own 8×8 viewBox.
 *  @param {{left:number, top:number, width:number, height:number}} rect
 *  @returns {number|null} 0 = a8 … 63 = h1, null when outside the board */
export function squareAtPoint(rect, clientX, clientY) {
  const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
  const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  return row * 8 + col;
}

/**
 * Wire clicks, right-clicks and drags on the rendered board.
 *
 * @param {object} deps
 * @param {HTMLElement} deps.app            container holding the rendered board
 * @param {() => object} deps.getState      current page state
 * @param {(patch: object) => void} deps.update   merge a patch into state
 * @param {(patch: object) => void} deps.edit     stamp/erase/move a square
 * @param {(notice: object) => void} deps.notify  show a message
 * @param {() => void} deps.render          re-render after a UI-only change
 */
export function installBoardEditing({ app, getState, update, edit, notify, render }) {
  const board = app.querySelector("svg.board");
  let drag = null;
  let clickSuppressedUntil = 0;

  const suppressClick = () => Date.now() < clickSuppressedUntil;

  for (const square of app.querySelectorAll("[data-square]")) {
    const index = Number(square.dataset.square);
    square.addEventListener("click", () => {
      if (suppressClick()) return;
      const piece = getState().activePiece;
      if (piece === null) {
        notify({ tone: "error", text: "先在下面的调色板里选一个棋子；或者直接把棋子拖到目标格子。" });
        return;
      }
      edit({ screenIndex: index, piece });
    });
    square.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      edit({ screenIndex: index, piece: "" });
    });
    square.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || getState().activePiece !== null) return;
      startDrag(event, index);
    });
  }

  for (const button of app.querySelectorAll("[data-piece]")) {
    button.addEventListener("click", () => {
      const piece = button.dataset.piece;
      update({ activePiece: getState().activePiece === piece ? null : piece });
      notify(null);
    });
  }

  function startDrag(event, index) {
    const pieceImage = board?.querySelector(`[data-at="${index}"]`);
    if (!board || !pieceImage) return;
    event.preventDefault();
    const ghost = pieceImage.cloneNode(true);
    ghost.setAttribute("class", "drag-ghost");
    ghost.removeAttribute("data-at");
    board.append(ghost);
    pieceImage.classList.add("drag-source");
    board.setPointerCapture?.(event.pointerId);
    drag = { from: index, ghost, moved: false, board };
    positionGhost(event);
  }

  function positionGhost(event) {
    if (!drag) return;
    const rect = drag.board.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 8 - 0.45;
    const y = ((event.clientY - rect.top) / rect.height) * 8 - 0.45;
    drag.ghost.setAttribute("x", String(x));
    drag.ghost.setAttribute("y", String(y));
  }

  function cleanup() {
    if (!drag) return;
    drag.ghost.remove();
    drag.board.querySelector(`[data-at="${drag.from}"]`)?.classList.remove("drag-source");
    drag = null;
    clickSuppressedUntil = Date.now() + 250;
  }

  function moveDrag(event) {
    if (!drag) return;
    drag.moved = true;
    positionGhost(event);
  }

  function endDrag(event) {
    if (!drag) return;
    const { from, board: liveBoard } = drag;
    const target = squareAtPoint(liveBoard.getBoundingClientRect(), event.clientX, event.clientY);
    cleanup();
    if (target !== null && target !== from) edit({ screenIndex: from, to: target });
  }

  if (board) {
    board.addEventListener("pointermove", moveDrag);
    board.addEventListener("pointerup", endDrag);
    board.addEventListener("pointercancel", cleanup);
  }
}
